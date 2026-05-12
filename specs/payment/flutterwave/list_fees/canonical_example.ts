/**
 * @provider Flutterwave
 * @capability list_fees
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

interface ListFeesInput {
  amount: number;
  currency: string;
  payment_method: string;
  card6?: string;
  country?: string;
  network?: string;
  trace_id?: string;
}

interface FlutterwaveFeeBreakdownItem {
  type: string;
  amount: number;
}

interface FlutterwaveFeesData {
  charge_amount: number;
  fee: FlutterwaveFeeBreakdownItem[];
}

interface ListFeesResponse {
  status: "success";
  message: string;
  data: FlutterwaveFeesData;
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

export async function listFees(input: ListFeesInput): Promise<ListFeesResponse> {
  const token = await getAccessToken();

  const params = new URLSearchParams();
  params.set("amount", String(input.amount));
  params.set("currency", input.currency);
  params.set("payment_method", input.payment_method);
  if (input.card6) params.set("card6", input.card6);
  if (input.country) params.set("country", input.country);
  if (input.network) params.set("network", input.network);

  const url = "https://f4bexperience.flutterwave.com/fees?" + params.toString();

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

  return response.json() as Promise<ListFeesResponse>;
}

void API_BASE_URL;

/*
Usage example:

const result = await listFees({
  amount: 12.34,
  currency: "NGN",
  payment_method: "card",
  country: "NG",
  card6: "424242",
});

console.log("charge_amount", result.data.charge_amount);
for (const item of result.data.fee) {
  console.log(item.type, item.amount);
}
*/
