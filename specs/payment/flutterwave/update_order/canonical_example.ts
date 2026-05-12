/**
 * @provider Flutterwave
 * @capability update_order
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

type OrderStatus =
  | "completed"
  | "pending"
  | "authorized"
  | "partially-completed"
  | "voided"
  | "failed";

interface UpdateOrderInput {
  id: string;
  action?: "void" | "capture";
  meta?: Record<string, string>;
  trace_id?: string;
  scenario_key?: string;
}

interface UpdateOrderResponse {
  status: "success" | "failed";
  message?: string;
  data: {
    id: string;
    amount: number;
    fees?: Array<{ type?: string; amount?: number }>;
    billing_details?: Record<string, unknown>;
    currency: string;
    customer_id: string;
    description?: string;
    meta?: Record<string, unknown>;
    next_action?: Record<string, unknown>;
    payment_method_details?: Record<string, unknown>;
    redirect_url?: string;
    reference: string;
    status: OrderStatus;
    processor_response?: {
      type?: string;
      code?: string;
      [k: string]: unknown;
    };
    created_datetime: string;
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

export async function updateOrder(
  input: UpdateOrderInput
): Promise<UpdateOrderResponse> {
  const token = await getAccessToken();

  const url = `https://f4bexperience.flutterwave.com/orders/${input.id}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;
  if (input.scenario_key) headers["X-Scenario-Key"] = input.scenario_key;

  const body: Record<string, unknown> = {};
  if (input.action !== undefined) body.action = input.action;
  if (input.meta !== undefined) body.meta = input.meta;

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave update_order error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<UpdateOrderResponse>;
}

/*
Usage example — void an authorized order:

const voided = await updateOrder({
  id: "ord_EFAHCzELJb",
  action: "void",
  meta: { reason: "customer-cancelled" },
  trace_id: "trace-update-order-001",
});

console.log(voided.data.status); // -> "voided"

// Terminal statuses (completed, voided, failed) typically reject further updates with 10409.
// action='capture' is only valid while the order is in 'authorized' (manual-capture flows).
*/
