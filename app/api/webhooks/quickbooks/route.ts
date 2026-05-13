/**
 * QuickBooks / Intuit Payments Webhook Handler
 *
 * Handles both:
 *   A) QuickBooks Payments events (charge status updates, refunds)
 *   B) QuickBooks Accounting events (invoice paid, customer updated)
 *
 * Setup:
 *   1. Intuit Developer Portal → Your App → Webhooks
 *   2. Add endpoint: https://<your-domain>/api/webhooks/quickbooks
 *   3. Subscribe to: Payment, Invoice, Customer entities
 *   4. Copy "Verifier Token" → QB_WEBHOOK_VERIFIER_TOKEN env var
 *
 * Intuit uses a verifier token (not HMAC) for webhook validation.
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // Intuit sends the verifier token as a header for validation
  const intuitToken = req.headers.get("intuit-webhook-signature") ??
    req.headers.get("intuit-verifier-token") ?? "";

  if (
    process.env.QB_WEBHOOK_VERIFIER_TOKEN &&
    intuitToken !== process.env.QB_WEBHOOK_VERIFIER_TOKEN
  ) {
    console.warn("QuickBooks webhook: invalid verifier token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json();

  // Intuit sends an array of notification objects
  const notifications: any[] = payload.eventNotifications ?? [payload];

  for (const notification of notifications) {
    const { realmId, dataChangeEvent } = notification;
    const entities: any[] = dataChangeEvent?.entities ?? [];

    for (const entity of entities) {
      await handleEntity(entity, realmId ?? "");
    }
  }

  return NextResponse.json({ received: true });
}

async function handleEntity(entity: any, realmId: string) {
  const { name, id, operation, lastUpdated } = entity;

  const log = (action: string, status: "success" | "error" = "success", details: any = {}) => {
    const entry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "quickbooks" as const,
      action,
      status,
      details: { qbEntityName: name, qbEntityId: id, operation, realmId, ...details },
    };
    db.integrationLogDb.create(entry);
    dbServer.integrationLogDb.create(entry).catch(() => {});
  };

  switch (name) {
    // ── QB Payments — Charge events ───────────────────────────────────────────
    case "Payment": {
      if (operation === "Create" || operation === "Update") {
        // A payment was created or updated in QB
        // Find our order by QB transaction reference
        const payments = db.paymentDb.getAll ? db.paymentDb.getAll() : [];
        const payment = payments.find((p: any) => p.transactionId === id);

        if (payment) {
          db.orderDb.update(payment.orderId, { paymentStatus: "completed", quickbooksStatus: "invoiced" });
          await dbServer.orderDb.update(payment.orderId, { paymentStatus: "completed" }).catch(() => {});
          log("QB payment confirmed", "success", { orderId: payment.orderId });
        }
      }

      if (operation === "Delete") {
        // Payment was voided/deleted — mark as refunded
        const payments = db.paymentDb.getAll ? db.paymentDb.getAll() : [];
        const payment = payments.find((p: any) => p.transactionId === id);

        if (payment) {
          db.orderDb.update(payment.orderId, { paymentStatus: "refunded", status: "cancelled" });
          await dbServer.orderDb.update(payment.orderId, { paymentStatus: "refunded", status: "cancelled" }).catch(() => {});
          log("QB payment voided/refunded", "success", { orderId: payment.orderId });
        }
      }
      break;
    }

    // ── QB Accounting — Invoice events ────────────────────────────────────────
    case "Invoice": {
      if (operation === "Update") {
        // Invoice was updated — could be paid via QB's hosted payment link
        const qbRecords = db.quickbooksDb.getAll ? db.quickbooksDb.getAll() : [];
        const record = qbRecords.find((r: any) => r.invoiceId === id);

        if (record) {
          db.quickbooksDb.update(record.id, { status: "paid", syncedAt: new Date().toISOString() });
          db.orderDb.update(record.orderId, { quickbooksStatus: "invoiced", paymentStatus: "completed" });
          await dbServer.orderDb.update(record.orderId, { quickbooksStatus: "invoiced", paymentStatus: "completed" }).catch(() => {});

          // Get order to look up patient for SMS
          const order = db.orderDb.getById(record.orderId);
          if (order) {
            try {
              spruce.sendMessage(order.patientId, "payment_received", { orderId: record.orderId });
            } catch {}
          }

          log("QB invoice paid", "success", { orderId: record.orderId, invoiceId: id });
        }
      }
      break;
    }

    // ── QB Accounting — CreditMemo (refund) ───────────────────────────────────
    case "CreditMemo": {
      if (operation === "Create") {
        log("QB credit memo (refund) created", "success");
        // Find associated order and update status
        const qbRecords = db.quickbooksDb.getAll ? db.quickbooksDb.getAll() : [];
        const record = qbRecords.find((r: any) => r.orderId);
        if (record) {
          db.orderDb.update(record.orderId, { paymentStatus: "refunded" });
          await dbServer.orderDb.update(record.orderId, { paymentStatus: "refunded" }).catch(() => {});
        }
      }
      break;
    }

    default:
      // Log but don't fail on unknown entity types
      log(`QB entity event: ${name} ${operation}`, "success");
  }
}

// QB webhook verification endpoint (GET) — Intuit sends a challenge to verify
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}
