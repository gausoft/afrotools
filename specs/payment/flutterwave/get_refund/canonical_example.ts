/**
 * @provider Flutterwave
 * @capability get_refund
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

interface GetRefundInput {
  id: string;
  trace_id?: string;
}

interface FlutterwaveRefund {
  id: string;
  amount_refunded: number;
  meta: Record<string, string>;
  reason: RefundReason;
  status: RefundStatus;
  charge_id: string;
  created_datetime: string;
}

interface GetRefundResponse {
  status: "success";
  message: string;
  meta?: {
    page_info?: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
  data: FlutterwaveRefund;
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

export async function getRefund(
  input: GetRefundInput
): Promise<GetRefundResponse> {
  const token = await getAccessToken();

  const url = "https://f4bexperience.flutterwave.com/refunds/" + input.id;

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

  return response.json() as Promise<GetRefundResponse>;
}

void API_BASE_URL;

/*
Usage example:

const result = await getRefund({ id: "rfd_abc123" });
console.log(result.data.status, result.data.amount_refunded, result.data.charge_id);
*/
