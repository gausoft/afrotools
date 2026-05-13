/**
 * @provider Flutterwave
 * @capability create_orchestrator_transfer
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

interface InlineSender {
  name?: string;
  type?: string;
  country?: string;
  [key: string]: unknown;
}

interface InlineRecipient {
  name?: string;
  type?: string;
  country?: string;
  [key: string]: unknown;
}

interface OrchestratorPaymentInstruction {
  amount: number;
  currency: string;
  sender: InlineSender;
  recipient: InlineRecipient;
  [key: string]: unknown;
}

interface DisburseOption {
  [key: string]: unknown;
}

interface CreateOrchestratorTransferInput {
  action: "instant" | "deferred" | "scheduled";
  reference: string;
  payment_instruction: OrchestratorPaymentInstruction;
  narration?: string;
  disburse_option?: DisburseOption;
  callback_url?: string;
  meta?: Record<string, unknown>;
}

interface CreateOrchestratorTransferRequestOptions {
  trace_id?: string;
  idempotency_key?: string;
  scenario_key?: string;
}

interface CreateOrchestratorTransferResponse {
  id: string;
  reference: string;
  status: string;
  action: string;
  payment_instruction: OrchestratorPaymentInstruction;
  sender_id: string;
  recipient_id: string;
  created_at: string;
}

interface FlutterwaveError {
  code: number;
  message: string;
}

export async function createOrchestratorTransfer(
  input: CreateOrchestratorTransferInput,
  options: CreateOrchestratorTransferRequestOptions = {},
): Promise<CreateOrchestratorTransferResponse> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.trace_id) headers["X-Trace-Id"] = options.trace_id;
  if (options.idempotency_key) headers["X-Idempotency-Key"] = options.idempotency_key;
  if (options.scenario_key) headers["X-Scenario-Key"] = options.scenario_key;

  const response = await fetch("https://f4bexperience.flutterwave.com/direct-transfers", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = (await response.json()) as FlutterwaveError;
    throw new Error(`Flutterwave error ${response.status}: ${error.message}`);
  }

  return (await response.json()) as CreateOrchestratorTransferResponse;
}

/*
Usage example:

const transfer = await createOrchestratorTransfer(
  {
    action: "instant",
    reference: "txn_orch_20260511_001",
    payment_instruction: {
      amount: 25000,
      currency: "NGN",
      sender: {
        name: "Acme Corp",
        type: "corporate",
        country: "NG",
      },
      recipient: {
        name: "Jane Doe",
        type: "individual",
        country: "NG",
        bank_code: "058",
        account_number: "0123456789",
      },
    },
    narration: "May commissions",
    callback_url: "https://example.com/webhooks/flutterwave",
  },
  {
    trace_id: "trace_orch_20260511_001",
    idempotency_key: "idem_orch_20260511_001",
  },
);

// Flutterwave returns the created sender_id and recipient_id so they can be reused
// in future POST /transfers calls without re-sending the full sender/recipient objects.
*/
