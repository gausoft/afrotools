/**
 * @provider Flutterwave
 * @capability list_payment_methods
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

type PaymentMethodType =
  | "card"
  | "bank_account"
  | "mobile_money"
  | "opay"
  | "applepay"
  | "googlepay"
  | "ussd"
  | "bank_transfer";

interface ListPaymentMethodsInput {
  page?: number;
  size?: number;
  trace_id?: string;
}

interface FlutterwavePaymentMethodSummary {
  id: string;
  type: PaymentMethodType;
  customer_id: string;
  created_datetime: string;
}

interface ListPaymentMethodsResponse {
  status: "success" | "failed";
  message?: string;
  meta: {
    page_info: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
  data: FlutterwavePaymentMethodSummary[];
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

export async function listPaymentMethods(
  input: ListPaymentMethodsInput = {}
): Promise<ListPaymentMethodsResponse> {
  const token = await getAccessToken();

  const params = new URLSearchParams();
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.size !== undefined) params.set("size", String(input.size));

  const qs = params.toString();
  const url = `https://f4bexperience.flutterwave.com/payment-methods${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave list_payment_methods error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<ListPaymentMethodsResponse>;
}

/*
Usage example:

const result = await listPaymentMethods({
  page: 1,
  size: 20,
  trace_id: "trace-list-pm-001",
});

for (const pm of result.data) {
  console.log(pm.id, pm.type, pm.customer_id);
}

// Pagination: keep incrementing page until current_page === total_pages.
// To get type-specific details (card last4, mobile_money number, etc.) call get_payment_method.
*/
