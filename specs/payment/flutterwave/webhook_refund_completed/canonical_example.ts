/**
 * @provider Flutterwave
 * @capability webhook_refund_completed
 * @atss 1.0
 * @capability_type webhook
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
if (!FLUTTERWAVE_WEBHOOK_SECRET) {
  throw new Error("Missing env: FLUTTERWAVE_WEBHOOK_SECRET");
}

type RefundStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "completed"
  | "new";

type RefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer"
  | "expired_uncaptured_charge";

interface RefundCompletedData {
  id: string;
  charge_id: string;
  amount_refunded: number;
  status: RefundStatus;
  reason?: RefundReason;
  meta?: Record<string, string> | null;
  created_datetime: string;
}

export interface RefundCompletedEvent {
  type: "refund.completed";
  webhook_id: string;
  timestamp: number;
  data: RefundCompletedData;
}

/**
 * Verify the HMAC-SHA256 signature of a Flutterwave refund.completed webhook
 * and return the parsed event. Throws if the signature is missing or invalid.
 *
 * Pass the RAW request body (string or Buffer) — never the re-serialised JSON.
 */
export function handleWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined
): RefundCompletedEvent {
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

  const parsed = JSON.parse(rawBody) as RefundCompletedEvent;
  if (parsed.type !== "refund.completed") {
    throw new Error(`Unexpected event type: ${parsed.type}`);
  }
  return parsed;
}

/*
Usage example (Next.js App Router route handler):

// app/api/webhooks/flutterwave/refund-completed/route.ts
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

  // Always re-verify server-side before adjusting ledgers.
  // const refund = await getRefund({ id: event.data.id });
  if (event.data.status === "succeeded" || event.data.status === "completed") {
    // mark the order as refunded, idempotently keyed on event.webhook_id
  }

  return new Response(null, { status: 200 });
}

Usage example (Express):

import express from "express";
import { handleWebhook } from "./canonical_example";

const app = express();

app.post(
  "/webhooks/flutterwave/refund-completed",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = (req.body as Buffer).toString("utf8");
    const signature = req.header("flutterwave-signature");
    try {
      const event = handleWebhook(rawBody, signature);
      // Verify server-side then update ledger
      void event;
    } catch {
      return res.status(401).send("invalid signature");
    }
    res.status(200).end();
  }
);
*/
