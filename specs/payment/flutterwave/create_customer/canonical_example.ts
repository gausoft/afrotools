/**
 * @provider Flutterwave
 * @capability create_customer
 * @atss 1.0
 * @capability_type synchronous
 */

const FLUTTERWAVE_CLIENT_CREDENTIALS = process.env.FLUTTERWAVE_CLIENT_CREDENTIALS;
if (!FLUTTERWAVE_CLIENT_CREDENTIALS) {
  throw new Error("Missing env: FLUTTERWAVE_CLIENT_CREDENTIALS");
}

const FLUTTERWAVE_BASE_URL = "https://f4bexperience.flutterwave.com";
const TOKEN_HOST = "https://idp.flutterwave.com";
const TOKEN_URL = TOKEN_HOST + "/realms/flutterwave/protocol/openid-connect/token";

interface CustomerName {
  first: string;
  middle?: string;
  last: string;
}

interface CustomerPhone {
  country_code: string;
  number: string;
}

interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface CreateCustomerInput {
  email: string;
  name: CustomerName;
  phone: CustomerPhone;
  address?: CustomerAddress;
  meta?: Record<string, string>;
  idempotencyKey?: string;
  traceId?: string;
}

interface FlutterwaveCustomer {
  id: string;
  email: string;
  name: CustomerName;
  phone: CustomerPhone;
  address?: CustomerAddress | null;
  meta?: Record<string, unknown> | null;
  created_datetime?: string;
}

interface CreateCustomerResponse {
  status: "success";
  message?: string;
  data: FlutterwaveCustomer;
}

interface FlutterwaveError {
  status?: "failed";
  message?: string;
  error?: {
    type?: string;
    code?: string;
    message?: string;
    validation_errors?: Array<{ field_name: string; message: string }>;
  };
}

interface OAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

async function getAccessToken(): Promise<string> {
  const decoded = Buffer.from(FLUTTERWAVE_CLIENT_CREDENTIALS!, "base64").toString("utf8");
  const sepIndex = decoded.indexOf(":");
  if (sepIndex === -1) {
    throw new Error(
      "FLUTTERWAVE_CLIENT_CREDENTIALS must be base64(client_id:client_secret)"
    );
  }
  const clientId = decoded.slice(0, sepIndex);
  const clientSecret = decoded.slice(sepIndex + 1);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Flutterwave OAuth failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  if (!data.access_token) {
    throw new Error("No access_token in Flutterwave OAuth response");
  }
  return data.access_token;
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<CreateCustomerResponse> {
  const accessToken = await getAccessToken();

  const { idempotencyKey, traceId, ...payload } = input;

  const url = `${FLUTTERWAVE_BASE_URL}/customers`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  if (traceId) headers["X-Trace-Id"] = traceId;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let err: FlutterwaveError = {};
    try {
      err = (await response.json()) as FlutterwaveError;
    } catch {
      // body not JSON
    }
    throw new Error(
      `Flutterwave create_customer error ${response.status}: ${err.message ?? "unknown error"}`
    );
  }

  return (await response.json()) as CreateCustomerResponse;
}

/*
Usage example:

const created = await createCustomer({
  email: "ada@example.com",
  name: { first: "Ada", last: "Lovelace" },
  phone: { country_code: "234", number: "8012345678" },
  address: {
    line1: "1 Marina Street",
    city: "Lagos",
    state: "Lagos",
    postal_code: "101001",
    country: "NG",
  },
  meta: { source: "checkout" },
  idempotencyKey: "create-cust-2024-04-01-ada", // safe retries do not duplicate
  traceId: "abc12345def6",                       // helps Flutterwave support trace requests
});

console.log(created.data.id);

// On HTTP 409, the customer already exists — fetch by email/id instead of erroring.
*/
