/**
 * @provider Flutterwave
 * @capability webhook_charge_completed
 * @atss 1.0
 * @capability_type webhook
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
if (!FLUTTERWAVE_WEBHOOK_SECRET) {
  throw new Error("Missing env: FLUTTERWAVE_WEBHOOK_SECRET");
}

interface ChargeCompletedData {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  customer_id: string;
  payment_method_id: string;
  payment_method?: Record<string, unknown>;
  processor_response?: Record<string, unknown>;
  order_id?: string | null;
  meta?: Record<string, unknown> | null;
  created_datetime: string;
  updated_datetime: string;
}

export interface ChargeCompletedEvent {
  type: "charge.completed";
  /** Flutterwave is inconsistent across event types — charge.completed historically uses `id`; some deliveries use `webhook_id`. Read whichever is present. */
  id?: string;
  webhook_id?: string;
  /** Unix epoch timestamp in milliseconds. */
  timestamp: number;
  data: ChargeCompletedData;
}

/**
 * Verify the HMAC-SHA256 signature of a Flutterwave webhook delivery and
 * return the parsed event. Throws if the signature is missing or invalid.
 *
 * Pass the RAW request body (string or Buffer) — never the re-serialised JSON.
 */
export function handleWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined
): ChargeCompletedEvent {
  if (!signatureHeader) {
    throw new Error("Missing flutterwave-signature header");
  }

  const expected = createHmac("sha256", FLUTTERWAVE_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signatureHeader, "utf8");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new Error("Invalid Flutterwave webhook signature");
  }

  const parsed = JSON.parse(rawBody) as ChargeCompletedEvent;
  if (parsed.type !== "charge.completed") {
    throw new Error(`Unexpected event type: ${parsed.type}`);
  }
  return parsed;
}

/*
Usage example (Next.js App Router route handler):

// app/api/webhooks/flutterwave/charge-completed/route.ts
import { handleWebhook } from "./canonical_example";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("flutterwave-signature");

  let event;
  try {
    event = handleWebhook(rawBody, signature);
  } catch (err) {
    return new Response("invalid signature", { status: 401 });
  }

  // Always re-verify server-side before fulfilling.
  // const charge = await getCharge({ id: event.data.id });
  if (event.data.status === "succeeded") {
    // fulfil the order, idempotently keyed on event.id
  }

  return new Response(null, { status: 200 });
}

Usage example (Express):

import express from "express";
import { handleWebhook } from "./canonical_example";

const app = express();

app.post(
  "/webhooks/flutterwave/charge-completed",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = (req.body as Buffer).toString("utf8");
    const signature = req.header("flutterwave-signature");
    try {
      const event = handleWebhook(rawBody, signature);
      // Verify server-side then fulfil
      void event;
    } catch {
      return res.status(401).send("invalid signature");
    }
    res.status(200).end();
  }
);
*/
