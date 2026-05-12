/**
 * @provider Flutterwave
 * @capability get_payment_method
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

interface GetPaymentMethodInput {
  id: string;
  trace_id?: string;
}

interface GetPaymentMethodResponse {
  status: "success" | "failed";
  message?: string;
  data: {
    id: string;
    type: PaymentMethodType;
    customer_id?: string;
    meta?: Record<string, string>;
    device_fingerprint?: string;
    client_ip?: string;
    created_datetime: string;
    card?: Record<string, unknown>;
    bank_account?: Record<string, unknown>;
    mobile_money?: Record<string, unknown>;
    opay?: Record<string, unknown>;
    applepay?: Record<string, unknown>;
    googlepay?: Record<string, unknown>;
    ussd?: Record<string, unknown>;
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

export async function getPaymentMethod(
  input: GetPaymentMethodInput
): Promise<GetPaymentMethodResponse> {
  const token = await getAccessToken();

  const url = `https://f4bexperience.flutterwave.com/payment-methods/${input.id}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave get_payment_method error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<GetPaymentMethodResponse>;
}

/*
Usage example:

const pm = await getPaymentMethod({
  id: "pmd_le6FjifCF7",
  trace_id: "trace-get-pm-001",
});

if (pm.data.type === "card") {
  console.log(pm.data.card); // last4, brand, expiry, etc.
} else if (pm.data.type === "mobile_money") {
  console.log(pm.data.mobile_money);
}

// Sensitive fields are masked (e.g. card last4 only) — never expect raw PAN/CVV.
*/
