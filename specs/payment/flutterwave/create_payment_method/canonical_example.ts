/**
 * @provider Flutterwave
 * @capability create_payment_method
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

interface CardBillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string; // ISO2 e.g. "US", "NG"
}

interface CardCof {
  enabled: boolean;
  agreement_id?: string;
  trace_id?: string;
}

interface CardDetails {
  nonce: string; // 12 alphanumeric chars
  encrypted_card_number: string;
  encrypted_expiry_month: string;
  encrypted_expiry_year: string;
  encrypted_cvv?: string;
  card_holder_name?: string;
  billing_address: CardBillingAddress;
  cof: CardCof;
}

interface MobileMoneyDetails {
  network: string; // e.g. "MTN"
  country_code: string; // digits only, 1-3 chars
  phone_number: string; // digits only, 7-10 chars
  use_qr?: boolean;
}

interface UssdDetails {
  account_bank: string; // digits only, 3+ chars, Nigerian bank code
}

interface ApplePayDetails {
  card_holder_name?: string;
}

interface GooglePayDetails {
  card_holder_name?: string;
}

type CreatePaymentMethodInput =
  | {
      type: "card";
      customer_id?: string;
      meta?: Record<string, string>;
      card: CardDetails;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "mobile_money";
      customer_id?: string;
      meta?: Record<string, string>;
      mobile_money: MobileMoneyDetails;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "ussd";
      customer_id?: string;
      meta?: Record<string, string>;
      ussd: UssdDetails;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "applepay";
      customer_id?: string;
      meta?: Record<string, string>;
      applepay?: ApplePayDetails;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "googlepay";
      customer_id?: string;
      meta?: Record<string, string>;
      googlepay?: GooglePayDetails;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "bank_account";
      customer_id?: string;
      meta?: Record<string, string>;
      bank_account?: Record<string, unknown>;
      trace_id?: string;
      idempotency_key?: string;
    }
  | {
      type: "opay";
      customer_id?: string;
      meta?: Record<string, string>;
      opay?: Record<string, unknown>;
      trace_id?: string;
      idempotency_key?: string;
    };

interface CreatePaymentMethodResponse {
  status: "success" | "failed";
  message?: string;
  data: {
    id: string;
    type: string;
    customer_id?: string;
    meta?: Record<string, string>;
    device_fingerprint?: string;
    client_ip?: string;
    created_datetime: string;
    card?: Record<string, unknown>;
    mobile_money?: Record<string, unknown>;
    ussd?: Record<string, unknown>;
    applepay?: Record<string, unknown>;
    googlepay?: Record<string, unknown>;
    bank_account?: Record<string, unknown>;
    opay?: Record<string, unknown>;
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

export async function createPaymentMethod(
  input: CreatePaymentMethodInput
): Promise<CreatePaymentMethodResponse> {
  const token = await getAccessToken();

  const url = "https://f4bexperience.flutterwave.com/payment-methods";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (input.trace_id) headers["X-Trace-Id"] = input.trace_id;
  if (input.idempotency_key) headers["X-Idempotency-Key"] = input.idempotency_key;

  // Build body excluding header-only fields. The per-type sub-object key matches the type name.
  const body: Record<string, unknown> = { type: input.type };
  if (input.customer_id !== undefined) body.customer_id = input.customer_id;
  if (input.meta !== undefined) body.meta = input.meta;

  if (input.type === "card") body.card = input.card;
  else if (input.type === "mobile_money") body.mobile_money = input.mobile_money;
  else if (input.type === "ussd") body.ussd = input.ussd;
  else if (input.type === "applepay" && input.applepay !== undefined) body.applepay = input.applepay;
  else if (input.type === "googlepay" && input.googlepay !== undefined) body.googlepay = input.googlepay;
  else if (input.type === "bank_account") body.bank_account = input.bank_account ?? {};
  else if (input.type === "opay") body.opay = input.opay ?? {};

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(
      `Flutterwave create_payment_method error ${response.status} [${error.error?.type}/${error.error?.code}]: ${error.error?.message ?? error.message}`
    );
  }

  return response.json() as Promise<CreatePaymentMethodResponse>;
}

/*
Usage example — card (encrypted via Flutterwave SDK):

const pm = await createPaymentMethod({
  type: "card",
  customer_id: "cus_3XarBILKQS",
  card: {
    nonce: "acb123e4f567",
    encrypted_card_number: "sAE3hEDaDQ+yLzo4Py+Lx15OZjBGduHu/DcdILh3En0=",
    encrypted_expiry_month: "sQpvQEb7GrUCjPuEN/NmHiPl",
    encrypted_expiry_year: "sgHNEDkJ/RmwuWWq/RymToU5",
    encrypted_cvv: "tAUzH7Qjma7diGdi7938F/ESNA==",
    card_holder_name: "Alex James",
    billing_address: {
      line1: "123 Main Street",
      city: "New York",
      state: "New York",
      postal_code: "10001",
      country: "US",
    },
    cof: { enabled: true },
  },
  trace_id: "trace-create-pm-card-01",
  idempotency_key: "idem-create-pm-20240115-abc",
});

// Usage example — mobile money:
const pmMm = await createPaymentMethod({
  type: "mobile_money",
  customer_id: "cus_3XarBILKQS",
  mobile_money: {
    network: "MTN",
    country_code: "234",
    phone_number: "8012345678",
  },
  trace_id: "trace-create-pm-mm-01",
});

console.log(pm.data.id, pm.data.type);

// Never POST raw PAN/CVV directly — use the Flutterwave field-level encryption SDK to produce
// the encrypted_* values and the 12-char alphanumeric nonce.
*/
