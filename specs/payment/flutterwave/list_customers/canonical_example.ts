/**
 * @provider Flutterwave
 * @capability list_customers
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

interface ListCustomersInput {
  page?: number;
  size?: number;
  trace_id?: string;
}

interface FlutterwaveCustomerName {
  first: string;
  middle?: string | null;
  last: string;
}

interface FlutterwaveCustomerPhone {
  country_code: string;
  number: string;
}

interface FlutterwaveCustomerAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface FlutterwaveCustomer {
  id: string;
  email: string;
  name: FlutterwaveCustomerName;
  phone: FlutterwaveCustomerPhone;
  address?: FlutterwaveCustomerAddress | null;
  meta?: Record<string, unknown> | null;
  created_datetime?: string;
}

interface ListCustomersResponse {
  status: "success";
  message?: string;
  data: FlutterwaveCustomer[];
  meta?: {
    page_info?: {
      total: number;
      current_page: number;
      total_pages: number;
    };
  };
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
  // Decode base64(client_id:client_secret) into the two components
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

export async function listCustomers(
  input: ListCustomersInput = {}
): Promise<ListCustomersResponse> {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams();
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.size !== undefined) params.set("size", String(input.size));

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const url = `${FLUTTERWAVE_BASE_URL}/customers${query}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    let err: FlutterwaveError = {};
    try {
      err = (await response.json()) as FlutterwaveError;
    } catch {
      // body not JSON — fall through
    }
    throw new Error(
      `Flutterwave list_customers error ${response.status}: ${err.message ?? "unknown error"}`
    );
  }

  return (await response.json()) as ListCustomersResponse;
}

/*
Usage example:

const result = await listCustomers({
  page: 1,
  size: 20,
  trace_id: "abc12345def6", // X-Trace-Id helps Flutterwave support trace requests
});

for (const customer of result.data) {
  console.log(customer.id, customer.email);
}

// Paginate using result.meta?.page_info — keep going until current_page === total_pages.
// size must be in [10, 50]; values outside that range return HTTP 400.
// Validation errors arrive as error.validation_errors[].field_name (not 'field').
*/
