/**
 * @provider Flutterwave
 * @capability get_order
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

interface GetOrderInput {
  id: string;
  trace_id?: string;
}

interface GetOrderResponse {
  status: "success" | "failed";
  message?: string;
  data: {
    id: string;
    amount: number;
    currency: string;
    status: OrderStatus;
    reference: string;
    customer_id: string;
    description?: string;
    meta?: Record<string, unknown>;
    payment_method_details?: Record<string, unknown>;
    processor_response?: {
      type?: string;
      code?: string;
      [k: string]: unknown;
    };
    created_datetime: string;
  };
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

export async function getOrder(input: GetOrderInput): Promise<GetOrderResponse> {
  const token = await getAccessToken();

  const url = `https://f4bexperience.flutterwave.com/orders/${input.id}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave get_order error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<GetOrderResponse>;
}

/*
Usage example:

const order = await getOrder({
  id: "ord_EFAHCzELJb",
  trace_id: "trace-get-order-001",
});

if (order.data.status === "completed") {
  // fulfil the order
}

// Always verify status server-side before fulfilling — never trust client-side redirects.
*/
