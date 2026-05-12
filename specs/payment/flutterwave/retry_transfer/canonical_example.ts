/**
 * @provider Flutterwave
 * @capability retry_transfer
 * @atss 1.0
 * @capability_type synchronous
 */

const FLUTTERWAVE_CLIENT_CREDENTIALS = process.env.FLUTTERWAVE_CLIENT_CREDENTIALS;
if (!FLUTTERWAVE_CLIENT_CREDENTIALS) {
  throw new Error("Missing env: FLUTTERWAVE_CLIENT_CREDENTIALS (base64 of client_id:client_secret)");
}

const TOKEN_HOST = "https://idp.flutterwave.com";
const TOKEN_URL = TOKEN_HOST + "/realms/flutterwave/protocol/openid-connect/token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(): Promise<string> {
  const decoded = Buffer.from(FLUTTERWAVE_CLIENT_CREDENTIALS as string, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx === -1) {
    throw new Error("FLUTTERWAVE_CLIENT_CREDENTIALS must decode to client_id:client_secret");
  }
  const clientId = decoded.slice(0, idx);
  const clientSecret = decoded.slice(idx + 1);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Flutterwave OAuth error ${tokenRes.status}: ${await tokenRes.text()}`);
  }

  const json = (await tokenRes.json()) as TokenResponse;
  return json.access_token;
}

interface RetryTransferInput {
  id: string;
  overrides?: Record<string, unknown>;
}

interface RetryTransferRequestOptions {
  trace_id?: string;
  idempotency_key?: string;
}

interface RetryTransferResponse {
  id: string;
  reference: string;
  status: string;
  action: string;
  payment_instruction: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface FlutterwaveError {
  code: number;
  message: string;
}

export async function retryTransfer(
  input: RetryTransferInput,
  options: RetryTransferRequestOptions = {},
): Promise<RetryTransferResponse> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.trace_id) headers["X-Trace-Id"] = options.trace_id;
  if (options.idempotency_key) headers["X-Idempotency-Key"] = options.idempotency_key;

  const body = input.overrides ? JSON.stringify(input.overrides) : "{}";

  const response = await fetch(
    "https://f4bexperience.flutterwave.com/transfers/" + input.id + "/retry",
    {
      method: "POST",
      headers,
      body,
    },
  );

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveError;
    throw new Error(`Flutterwave error ${response.status}: ${error.message}`);
  }

  return (await response.json()) as RetryTransferResponse;
}

/*
Usage example:

const retried = await retryTransfer(
  { id: "tx_01HXYZ..." },
  {
    trace_id: "trace_retry_20260511_001",
    idempotency_key: "idem_retry_20260511_001",
  },
);

// Always poll GET /transfers/{id} afterwards to confirm the final outcome.
*/
