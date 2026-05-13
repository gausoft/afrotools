/**
 * @provider Flutterwave
 * @capability search_customers
 * @atss 1.0
 * @capability_type synchronous
 */

const FLUTTERWAVE_CLIENT_CREDENTIALS = process.env.FLUTTERWAVE_CLIENT_CREDENTIALS;
if (!FLUTTERWAVE_CLIENT_CREDENTIALS) {
  throw new Error("Missing env: FLUTTERWAVE_CLIENT_CREDENTIALS");
}

const FLUTTERWAVE_BASE_URL = "https://f4bexperience.flutterwave.com";
const FLUTTERWAVE_TOKEN_URL =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

interface SearchCustomersInput {
  email?: string;
  phone?: string;
  name?: string;
  traceId?: string;
}

interface FlutterwaveCustomerSummary {
  id: string;
  email: string;
  name: {
    first: string;
    middle?: string | null;
    last: string;
  };
  phone: {
    country_code: string;
    number: string;
  };
  created_datetime?: string;
}

interface SearchCustomersResponse {
  status: string;
  message?: string;
  data: FlutterwaveCustomerSummary[];
  meta?: {
    page_info?: {
      total: number;
      current_page: number;
      total_pages: number;
      size: number;
    };
  };
}

interface FlutterwaveError {
  status?: string;
  message?: string;
  error?: {
    code?: string;
    type?: string;
    validation_errors?: Array<{ field: string; message: string }>;
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

  const response = await fetch(FLUTTERWAVE_TOKEN_URL, {
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

export async function searchCustomers(
  input: SearchCustomersInput = {}
): Promise<SearchCustomersResponse> {
  const accessToken = await getAccessToken();

  const { traceId, ...filters } = input;

  const url = `${FLUTTERWAVE_BASE_URL}/customers/search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (traceId) headers["X-Trace-Id"] = traceId;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(filters),
  });

  if (!response.ok) {
    let err: FlutterwaveError = {};
    try {
      err = (await response.json()) as FlutterwaveError;
    } catch {
      // body not JSON
    }
    throw new Error(
      `Flutterwave search_customers error ${response.status}: ${err.message ?? "unknown error"}`
    );
  }

  return (await response.json()) as SearchCustomersResponse;
}

/*
Usage example:

const results = await searchCustomers({
  email: "ada@example.com",
  traceId: "abc12345def6",
});

if (results.data.length === 0) {
  // No existing customer — safe to call createCustomer.
} else {
  console.log("Found existing customer:", results.data[0].id);
}

// Note: the exact search payload schema is not publicly documented.
// Verify field names (email, phone, name) against the live API before relying on filtering behaviour.
*/
