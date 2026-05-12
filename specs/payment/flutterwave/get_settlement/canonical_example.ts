/**
 * @provider Flutterwave
 * @capability get_settlement
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

interface GetSettlementInput {
  id: string;
  trace_id?: string;
}

interface FlutterwaveSettlement {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  destination_account: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GetSettlementResponse {
  status: string;
  message: string;
  data: FlutterwaveSettlement;
}

interface FlutterwaveError {
  code: number;
  message: string;
  error?: Record<string, unknown>;
}

export async function getSettlement(
  input: GetSettlementInput
): Promise<GetSettlementResponse> {
  const token = await getAccessToken();

  const url = `${API_BASE_URL}/settlements/${input.id}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveError;
    throw new Error(`Flutterwave error ${response.status}: ${error.message}`);
  }

  return response.json() as Promise<GetSettlementResponse>;
}

/*
Usage example:

const result = await getSettlement({ id: "stl_abc123" });
console.log(result.data.amount, result.data.currency, result.data.status);
*/
