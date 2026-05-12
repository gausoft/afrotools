/**
 * @provider Flutterwave
 * @capability create_order
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

interface CreateOrderInput {
  amount: number;
  currency: string;
  reference: string;
  customer_id: string;
  payment_method_id: string;
  meta?: Record<string, unknown>;
  redirect_url?: string;
  authorization?: Record<string, unknown>;
  merchant_vat_amount?: number;
  trace_id?: string;
  idempotency_key?: string;
  scenario_key?: string;
}

interface CreateOrderResponse {
  status: "success" | "failed";
  message?: string;
  data: {
    id: string;
    amount: number;
    currency: string;
    reference: string;
    status: OrderStatus;
    customer_id: string;
    payment_method_details?: Record<string, unknown>;
    next_action?: Record<string, unknown>;
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

export async function createOrder(
  input: CreateOrderInput
): Promise<CreateOrderResponse> {
  const token = await getAccessToken();

  const url = "https://f4bexperience.flutterwave.com/orders";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;
  if (input.idempotency_key) headers["X-Idempotency-Key"] = input.idempotency_key;
  if (input.scenario_key) headers["X-Scenario-Key"] = input.scenario_key;

  const body: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency,
    reference: input.reference,
    customer_id: input.customer_id,
    payment_method_id: input.payment_method_id,
  };
  if (input.meta !== undefined) body.meta = input.meta;
  if (input.redirect_url !== undefined) body.redirect_url = input.redirect_url;
  if (input.authorization !== undefined) body.authorization = input.authorization;
  if (input.merchant_vat_amount !== undefined) body.merchant_vat_amount = input.merchant_vat_amount;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave create_order error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<CreateOrderResponse>;
}

/*
Usage example:

const order = await createOrder({
  amount: 500,
  currency: "NGN",
  reference: "order-20240115-abc123",
  customer_id: "cus_01HABCDEF",
  payment_method_id: "pmd_01HABCDEF",
  redirect_url: "https://merchant.com/checkout/callback",
  meta: { cart_id: "cart_789" },
  trace_id: "trace-create-order-001",
  idempotency_key: "idem-create-order-20240115-abc",
});

console.log(order.data.id, order.data.status);

// Inspect order.data.next_action for 3DS / wallet redirect instructions before fulfilling.
// Always verify status server-side via get_order before fulfilling.
*/
