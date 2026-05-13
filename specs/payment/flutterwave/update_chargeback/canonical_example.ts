/**
 * @provider Flutterwave
 * @capability update_chargeback
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

type ChargebackUpdateStatus = "accepted" | "declined";
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

interface UpdateChargebackInput {
  id: string;
  status?: ChargebackUpdateStatus;
  uploaded_proof?: string;
  comment?: string;
  provider?: string;
  arn?: string;
  due_datetime?: string;
  proof_data?: string;
  trace_id?: string;
}

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

interface UpdateChargebackResponse {
  status: "success";
  message: string;
  data: FlutterwaveChargeback;
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

export async function updateChargeback(
  input: UpdateChargebackInput
): Promise<UpdateChargebackResponse> {
  const token = await getAccessToken();

  const url = "https://f4bexperience.flutterwave.com/chargebacks/" + input.id;

  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const body: Record<string, unknown> = {};
  if (input.status !== undefined) body.status = input.status;
  if (input.uploaded_proof !== undefined) body.uploaded_proof = input.uploaded_proof;
  if (input.comment !== undefined) body.comment = input.comment;
  if (input.provider !== undefined) body.provider = input.provider;
  if (input.arn !== undefined) body.arn = input.arn;
  if (input.due_datetime !== undefined) body.due_datetime = input.due_datetime;
  if (input.proof_data !== undefined) body.proof_data = input.proof_data;

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveError;
    throw new Error(`Flutterwave error ${response.status}: ${error.error?.message ?? error.message}`);
  }

  return response.json() as Promise<UpdateChargebackResponse>;
}

void API_BASE_URL;

/*
Usage example:

const result = await updateChargeback({
  id: "cbk_xyz789",
  status: "accepted",
  uploaded_proof: "https://files.example.com/receipt.pdf",
  comment: "Customer received goods on 2024-02-03",
  provider: "Visa",
});

console.log(result.data.id, result.data.status, result.data.updated_datetime);
*/
