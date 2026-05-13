/**
 * @provider Flutterwave
 * @capability list_refunds
 * @atss 1.0
 * @capability_type synchronous
 */

const FLUTTERWAVE_CLIENT_CREDENTIALS = process.env.FLUTTERWAVE_CLIENT_CREDENTIALS;
if (!FLUTTERWAVE_CLIENT_CREDENTIALS) {
  throw new Error("Missing env: FLUTTERWAVE_CLIENT_CREDENTIALS");
}

const API_BASE_URL = "https://f4bexperience.flutterwave.com";
const IDP_BASE_URL = "https://idp.flutterwave.com";
const TOKEN_URL = IDP_BASE_URL + "/realms/flutterwave/protocol/openid-connect/token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(): Promise<string> {
  const decoded = Buffer.from(FLUTTERWAVE_CLIENT_CREDENTIALS!, "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    throw new Error("FLUTTERWAVE_CLIENT_CREDENTIALS must be base64(client_id:client_secret)");
  }
  const clientId = decoded.slice(0, sep);
  const clientSecret = decoded.slice(sep + 1);

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Flutterwave token error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as TokenResponse;
  return json.access_token;
}

type RefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer"
  | "expired_uncaptured_charge";

type RefundStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "completed"
  | "new";

interface ListRefundsInput {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  trace_id?: string;
}

interface FlutterwaveRefund {
  id: string;
  amount_refunded: number;
  meta: Record<string, unknown>;
  reason: RefundReason;
  status: RefundStatus;
  charge_id: string;
  created_datetime: string;
}

interface ListRefundsResponse {
  status: "success";
  message: string;
  meta: {
    page_info: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
  data: FlutterwaveRefund[];
}

interface FlutterwaveError {
  status: "failed";
  message?: string;
  error: {
    type: string;
    code: string;
    message: string;
    validation_errors?: Array<{ field_name: string; message: string }>;
  };
}

export async function listRefunds(
  input: ListRefundsInput = {}
): Promise<ListRefundsResponse> {
  const token = await getAccessToken();

  const params = new URLSearchParams();
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.size !== undefined) params.set("size", String(input.size));
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);

  const qs = params.toString();
  const url = qs
    ? "https://f4bexperience.flutterwave.com/refunds?" + qs
    : "https://f4bexperience.flutterwave.com/refunds";

  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveError;
    throw new Error(`Flutterwave error ${response.status}: ${error.error?.message ?? error.message}`);
  }

  return response.json() as Promise<ListRefundsResponse>;
}

void API_BASE_URL;

/*
Usage example:

const result = await listRefunds({
  from: "2024-01-01T00:00:00Z",
  to: "2024-01-31T23:59:59Z",
  page: 1,
  size: 20,
});

for (const refund of result.data) {
  console.log(refund.id, refund.charge_id, refund.amount_refunded, refund.status);
}
*/
