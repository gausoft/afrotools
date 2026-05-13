/**
 * @provider Flutterwave
 * @capability update_customer
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
  first?: string;
  middle?: string;
  last?: string;
}

interface CustomerPhone {
  country_code: string;
  number: string;
}

interface CustomerAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface UpdateCustomerInput {
  id: string;
  name?: CustomerName;
  phone?: CustomerPhone;
  address?: CustomerAddress;
  meta?: Record<string, string>;
  idempotencyKey?: string;
  traceId?: string;
}

interface FlutterwaveCustomer {
  id: string;
  email: string;
  name: { first: string; middle?: string | null; last: string };
  phone: { country_code: string; number: string };
  address?: CustomerAddress | null;
  meta?: Record<string, unknown> | null;
  created_datetime?: string;
}

interface UpdateCustomerResponse {
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

export async function updateCustomer(
  input: UpdateCustomerInput
): Promise<UpdateCustomerResponse> {
  const accessToken = await getAccessToken();

  const { id, idempotencyKey, traceId, ...payload } = input;

  // Customer IDs are opaque strings — pass as-is, do not encodeURIComponent.
  const url = `${FLUTTERWAVE_BASE_URL}/customers/${id}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  if (traceId) headers["X-Trace-Id"] = traceId;

  const response = await fetch(url, {
    method: "PUT",
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
      `Flutterwave update_customer error ${response.status}: ${err.message ?? "unknown error"}`
    );
  }

  return (await response.json()) as UpdateCustomerResponse;
}

/*
Usage example:

const updated = await updateCustomer({
  id: "cus_8oP3npH4DCpDOl",
  phone: { country_code: "234", number: "8099887766" },
  address: {
    line1: "10 Admiralty Way",
    city: "Lagos",
    state: "Lagos",
    postal_code: "106104",
    country: "NG",
  },
  // To update meta, read the customer first and merge — sending meta replaces it.
  meta: { source: "checkout", tier: "gold" },
  idempotencyKey: "update-cust-cus_8oP3npH4DCpDOl-2024-04-02",
  traceId: "abc12345def6",
});

console.log(updated.data.id, updated.data.created_datetime);

// Email cannot be updated via this endpoint — only name, phone, address and meta.
*/
