/**
 * @provider Flutterwave
 * @capability list_orders
 * @atss 1.0
 * @capability_type synchronous
 */

const FLUTTERWAVE_CLIENT_CREDENTIALS = process.env.FLUTTERWAVE_CLIENT_CREDENTIALS;
if (!FLUTTERWAVE_CLIENT_CREDENTIALS) {
  throw new Error("Missing env: FLUTTERWAVE_CLIENT_CREDENTIALS");
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(): Promise<string> {
  const decoded = Buffer.from(FLUTTERWAVE_CLIENT_CREDENTIALS!, "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    throw new Error("FLUTTERWAVE_CLIENT_CREDENTIALS must be base64('client_id:client_secret')");
  }
  const clientId = decoded.slice(0, sep);
  const clientSecret = decoded.slice(sep + 1);

  const TOKEN_HOST = "https://idp.flutterwave.com";
  const TOKEN_URL = TOKEN_HOST + "/realms/flutterwave/protocol/openid-connect/token";

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Flutterwave OAuth error ${tokenRes.status}: ${await tokenRes.text()}`);
  }

  const tokenJson = (await tokenRes.json()) as TokenResponse;
  return tokenJson.access_token;
}

type OrderStatus =
  | "completed"
  | "pending"
  | "authorized"
  | "partially-completed"
  | "voided"
  | "failed";

interface ListOrdersInput {
  status?: OrderStatus;
  from?: string;
  to?: string;
  customer_id?: string;
  payment_method_id?: string;
  page?: number;
  size?: number;
  trace_id?: string;
}

interface FlutterwaveOrder {
  id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  reference: string;
  customer_id: string;
  description?: string;
  payment_method_details?: Record<string, unknown>;
  created_datetime: string;
}

interface ListOrdersResponse {
  status: "success" | "failed";
  message?: string;
  meta: {
    page_info: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
  data: FlutterwaveOrder[];
}

interface FlutterwaveErrorBody {
  status: "failed";
  message?: string;
  error: {
    type: string;
    code: string;
    message: string;
    validation_errors?: Array<{ field_name: string; message: string }>;
  };
}

export async function listOrders(
  input: ListOrdersInput = {}
): Promise<ListOrdersResponse> {
  const token = await getAccessToken();

  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.customer_id) params.set("customer_id", input.customer_id);
  if (input.payment_method_id) params.set("payment_method_id", input.payment_method_id);
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.size !== undefined) params.set("size", String(input.size));

  const qs = params.toString();
  const url = `https://f4bexperience.flutterwave.com/orders${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave list_orders error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<ListOrdersResponse>;
}

/*
Usage example:

const result = await listOrders({
  status: "completed",
  from: "2024-01-01T00:00:00Z",
  to: "2024-01-31T23:59:59Z",
  page: 1,
  size: 20,
  trace_id: "trace-list-orders-001",
});

for (const order of result.data) {
  console.log(order.id, order.reference, order.amount, order.status);
}

// Pagination: keep incrementing page until current_page === total_pages.
*/
