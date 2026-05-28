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
import { sql } from "@vercel/postgres";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
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

async function getPaymentByTransactionId(transactionId: string) {
  if (process.env.POSTGRES_URL) {
    const { rows } = await sql`SELECT * FROM payments WHERE transaction_id = ${transactionId} LIMIT 1`.catch(() => ({ rows: [] }));
    if (rows[0]) return { orderId: rows[0].order_id, patientId: rows[0].patient_id, transactionId };
  }
  return null;
}

async function getQbRecordByInvoiceId(invoiceId: string) {
  if (process.env.POSTGRES_URL) {
    const { rows } = await sql`SELECT * FROM quickbooks_records WHERE invoice_id = ${invoiceId} LIMIT 1`.catch(() => ({ rows: [] }));
    if (rows[0]) return { id: rows[0].id, orderId: rows[0].order_id };
  }
  return null;
}

async function handleEntity(entity: any, realmId: string) {
  const { name, id, operation } = entity;

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
    case "Payment": {
      const payment = await getPaymentByTransactionId(id);
      if (!payment) break;

      if (operation === "Create" || operation === "Update") {
        await dbServer.orderDb.update(payment.orderId, { paymentStatus: "completed", quickbooksStatus: "invoiced" }).catch(() => {});
        log("QB payment confirmed", "success", { orderId: payment.orderId });
      }

      if (operation === "Delete") {
        await dbServer.orderDb.update(payment.orderId, { paymentStatus: "refunded", status: "cancelled" }).catch(() => {});
        log("QB payment voided/refunded", "success", { orderId: payment.orderId });
      }
      break;
    }

    case "Invoice": {
      if (operation === "Update") {
        const qbRecord = await getQbRecordByInvoiceId(id);
        if (!qbRecord) break;

        await dbServer.orderDb.update(qbRecord.orderId, { quickbooksStatus: "invoiced", paymentStatus: "completed" }).catch(() => {});

        const order = await dbServer.orderDb.getById(qbRecord.orderId).catch(() => null);
        if (order) {
          const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
          if (patient) {
            spruceServer.sendMessage(patient, "payment_received", { orderId: qbRecord.orderId }).catch(() => {});
          }
        }

        log("QB invoice paid", "success", { orderId: qbRecord.orderId, invoiceId: id });
      }
      break;
    }

    case "CreditMemo": {
      if (operation === "Create") {
        log("QB credit memo (refund) created", "success");
      }
      break;
    }

    default:
      log(`QB entity event: ${name} ${operation}`, "success");
  }
}

// QB webhook verification endpoint (GET) - Intuit sends a challenge to verify
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}
