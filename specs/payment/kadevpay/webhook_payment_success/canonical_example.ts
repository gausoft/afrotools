/**
 * @provider KadevPay
 * @capability webhook_payment_success
 * @atss 1.0
 * @capability_type webhook
 */

import { createHmac, timingSafeEqual } from "crypto";

const KADEVPAY_WEBHOOK_SECRET = process.env.KADEVPAY_WEBHOOK_SECRET;
if (!KADEVPAY_WEBHOOK_SECRET) throw new Error("Missing env: KADEVPAY_WEBHOOK_SECRET");

interface WebhookCustomer {
  full_name?: string;
  email?: string;
  phone?: string;
}

interface WebhookData {
  reference: string;
  amount: number;
  net_amount?: number;
  currency: "XOF";
  status: "paid";
  customer?: WebhookCustomer;
  metadata?: Record<string, unknown>;
}

interface KadevPayWebhookPayload {
  event: "payment.success";
  data: WebhookData;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = createHmac("sha512", KADEVPAY_WEBHOOK_SECRET as string)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function handleWebhook(payload: KadevPayWebhookPayload): void {
  if (payload.event !== "payment.success") return;

  const { reference, amount, net_amount } = payload.data;
  console.log(`Payment success: ${reference}, amount=${amount} XOF, net=${net_amount ?? amount} XOF`);
}

/*
Usage example (Express.js handler):

app.post("/webhooks/kadevpay", express.raw({ type: "application/json" }), (req, res) => {
  // Return 200 immediately — process asynchronously
  res.sendStatus(200);

  const rawBody = req.body.toString();
  const signature = req.headers["x_kadevpay_signature"] as string;

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("Invalid KadevPay webhook signature — request rejected");
    return;
  }

  const payload: KadevPayWebhookPayload = JSON.parse(rawBody);

  if (payload.event !== "payment.success") return;

  // Always verify server-side before fulfilling the order
  verifyPayment(payload.data.reference).then((result) => {
    if (result.data.status === "paid") {
      // Fulfill the order — use net_amount for accounting (amount after 3% fee)
      handleWebhook(payload);
    }
  });
});
*/
