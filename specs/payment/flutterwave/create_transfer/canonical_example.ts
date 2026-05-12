/**
 * @provider Flutterwave
 * @capability create_transfer
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

interface TransferAmount {
  value: number;
  applies_to: "destination_currency" | "source_currency";
}

interface PaymentInstruction {
  recipient_id: string;
  source_currency: string;
  amount: TransferAmount;
  sender_id?: string;
}

interface DisburseOption {
  date_time: string;
  timezone: string;
}

interface CreateTransferInput {
  action: "instant" | "deferred" | "scheduled";
  payment_instruction: PaymentInstruction;
  reference?: string;
  narration?: string;
  disburse_option?: DisburseOption;
  callback_url?: string;
  meta?: Record<string, string>;
}

interface CreateTransferRequestOptions {
  trace_id?: string;
  idempotency_key?: string;
  scenario_key?: string;
}

interface TransferData {
  id: string;
  type: "bank" | "mobile_money" | "wallet" | "cash_pickup" | "crypto";
  action: "instant" | "deferred" | "scheduled" | "retry" | "duplicate";
  reference: string;
  status: "NEW" | "PENDING" | "FAILED" | "SUCCESSFUL" | "CANCELLED" | "INITIATED";
  narration: string | null;
  source_currency: string;
  destination_currency: string;
  amount: TransferAmount;
  fee: { currency: string; value: number };
  debit_information: {
    currency: string;
    actual_debit_amount: number;
    rate_used: number;
    vat: number;
  };
  extra_information?: { amount_credited: string };
  payment_information?: { proof: string };
  disburse_option?: DisburseOption | null;
  callback_url?: string | null;
  provider_response?: { type: string; code: string; message: string };
  recipient: Record<string, unknown>;
  sender: Record<string, unknown>;
  transfer_purpose?: string;
  meta?: Record<string, string>;
  created_datetime: string;
  reversal?: {
    reversal_datetime: string;
    initial_status: string;
    reconciliation_status: string;
    reconciliation_type: "D" | "C";
  } | null;
}

interface CreateTransferResponse {
  status: "success" | "failed";
  message?: string;
  data: TransferData;
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

export async function createTransfer(
  input: CreateTransferInput,
  options: CreateTransferRequestOptions = {},
): Promise<CreateTransferResponse> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.trace_id) headers["X-Trace-Id"] = options.trace_id;
  if (options.idempotency_key) headers["X-Idempotency-Key"] = options.idempotency_key;
  if (options.scenario_key) headers["X-Scenario-Key"] = options.scenario_key;

  const response = await fetch("https://f4bexperience.flutterwave.com/transfers", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveErrorBody;
    throw new Error(`Flutterwave error ${response.status}: ${error.error?.message ?? error.message ?? "unknown"}`);
  }

  return (await response.json()) as CreateTransferResponse;
}

/*
Usage example:

const transfer = await createTransfer(
  {
    action: "instant",
    payment_instruction: {
      recipient_id: "rcp_vRq7L4TM8p",
      source_currency: "NGN",
      amount: { value: 50000, applies_to: "destination_currency" },
      sender_id: "sdr_vRq7L4TM8p",
    },
    reference: "txn-20260511-0001",
    narration: "Payout for May invoice",
    callback_url: "https://example.com/webhooks/flutterwave",
    meta: { internal_invoice: "INV-2026-05-001" },
  },
  {
    trace_id: "trace-20260511-0001",
    idempotency_key: "idem-20260511-0001",
  },
);

// transfer.data.id is the Flutterwave transfer ID — store it to retrieve, update or retry.
// transfer.data.status is UPPERCASE (NEW | PENDING | FAILED | SUCCESSFUL | CANCELLED | INITIATED).
*/
