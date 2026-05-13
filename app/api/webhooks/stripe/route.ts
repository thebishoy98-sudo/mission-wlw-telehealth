/**
 * Stripe Webhook Handler
 *
 * Events handled:
 *   payment_intent.succeeded       — confirm payment, trigger integration chain
 *   payment_intent.payment_failed  — mark payment failed, notify patient
 *   charge.refunded                — record refund
 *
 * Setup:
 *   1. stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   2. Add STRIPE_WEBHOOK_SECRET to env vars
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-04-22.dahlia" as any,
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const log = (action: string, orderId?: string, status: "success" | "error" = "success", error?: string) => {
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      integrationName: "system" as const, action,
      orderId, status, details: { stripeEventId: event.id, type: event.type }, error,
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as any;
        const orderId = pi.metadata?.orderId;
        if (orderId) {
          db.orderDb.update(orderId, { paymentStatus: "completed" });
          await dbServer.orderDb.update(orderId, { paymentStatus: "completed" }).catch(() => {});
          log("Stripe payment confirmed", orderId);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as any;
        const orderId = pi.metadata?.orderId;
        const patientId = pi.metadata?.patientId;
        if (orderId) {
          db.orderDb.update(orderId, { paymentStatus: "failed", status: "draft" });
          await dbServer.orderDb.update(orderId, { paymentStatus: "failed", status: "draft" }).catch(() => {});
          log("Stripe payment failed", orderId, "error", pi.last_payment_error?.message);
        }
        if (patientId) {
          try { spruce.sendMessage(patientId, "payment_failed", { orderId: orderId ?? "" }); } catch {}
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as any;
        const orderId = charge.metadata?.orderId;
        if (orderId) {
          db.orderDb.update(orderId, { paymentStatus: "refunded", status: "cancelled" });
          await dbServer.orderDb.update(orderId, { paymentStatus: "refunded", status: "cancelled" }).catch(() => {});
          log("Stripe refund processed", orderId);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    log(`Webhook error: ${event.type}`, undefined, "error", err.message);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
