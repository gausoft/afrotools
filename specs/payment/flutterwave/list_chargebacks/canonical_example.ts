/**
 * @provider Flutterwave
 * @capability list_chargebacks
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

interface ListChargebacksInput {
  page?: number;
  size?: number;
  from?: string;
  to?: string;
  trace_id?: string;
}

type ChargebackStage = "new" | "second" | "pre-arbitration" | "arbitration" | "invalid";
type ChargebackStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "initiated"
  | "won"
  | "lost"
  | "reversed"
  | "new";
type ChargebackType = "local" | "international";

interface FlutterwaveChargeback {
  id: string;
  charge_id: string;
  amount: number;
  meta: Record<string, unknown>;
  stage: ChargebackStage;
  status: ChargebackStatus;
  type: ChargebackType;
  due_datetime: string;
  created_datetime: string;
  updated_datetime: string;
  settlement_id: string;
  uploaded_proof: string;
  comment: string;
  provider: string;
  arn: string;
  initiator: string;
}

interface ListChargebacksResponse {
  status: "success";
  message: string;
  meta: {
    page_info: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
  data: FlutterwaveChargeback[];
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

export async function listChargebacks(
  input: ListChargebacksInput = {}
): Promise<ListChargebacksResponse> {
  const token = await getAccessToken();

  const params = new URLSearchParams();
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.size !== undefined) params.set("size", String(input.size));
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);

  const qs = params.toString();
  const url = qs
    ? "https://f4bexperience.flutterwave.com/chargebacks?" + qs
    : "https://f4bexperience.flutterwave.com/chargebacks";

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

  return response.json() as Promise<ListChargebacksResponse>;
}

/*
Usage example:

const result = await listChargebacks({
  from: "2024-01-01T00:00:00Z",
  to: "2024-01-31T23:59:59Z",
  page: 1,
  size: 20,
});

for (const cb of result.data) {
  console.log(cb.id, cb.charge_id, cb.amount, cb.stage, cb.status);
}
*/
