/**
 * Cron: FedEx Tracking Sync
 *
 * Polls FedEx directly for shipped pharmacy orders that have tracking numbers.
 * Sends one out-for-delivery text and one delivered text per order.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { buildFedExTrackingActions, rowToFedExPatient, type FedExTrackingOrderRow } from "@/lib/fedex-tracking-sync";
import { fetchFedExTrackingStatus, isFedExTrackingConfigured } from "@/services/fedex-tracking";
import * as spruceServer from "@/services/spruce.server";

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return { ok: false, response: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 }) };
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.ok) return auth.response;

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ skipped: "No POSTGRES_URL configured", results: [] });
  }

  if (!isFedExTrackingConfigured()) {
    return NextResponse.json({ skipped: "FedEx credentials are not configured", results: [] });
  }

  const results: {
    orderId: string;
    trackingNumber: string;
    fedexStatus?: string;
    actions: string[];
    status: string;
    error?: string;
  }[] = [];

  const { rows } = await sql`
    SELECT
      o.id AS order_id,
      po.id AS pharmacy_order_id,
      o.patient_id,
      p.first_name,
      p.last_name,
      p.phone,
      po.tracking_number
    FROM pharmacy_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN patients p ON p.id = o.patient_id
    WHERE po.tracking_number IS NOT NULL
      AND po.tracking_number <> ''
      AND po.delivered_at IS NULL
      AND po.status = 'shipped'
    ORDER BY po.shipped_at ASC NULLS LAST
    LIMIT 100
  `;

  for (const row of rows) {
    const trackingRow: FedExTrackingOrderRow = {
      orderId: row.order_id,
      pharmacyOrderId: row.pharmacy_order_id,
      patientId: row.patient_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      trackingNumber: row.tracking_number,
    };

    try {
      const fedexStatus = await fetchFedExTrackingStatus(trackingRow.trackingNumber);
      const existingMessages = await dbServer.spruceMessageDb.getByOrder(trackingRow.orderId).catch(() => []);
      const actions = buildFedExTrackingActions({
        row: trackingRow,
        status: fedexStatus,
        existingTemplateKeys: existingMessages.map((message) => message.templateKey),
        now: new Date().toISOString(),
      });

      if (actions.pharmacyUpdate) {
        await dbServer.pharmacyOrderDb.update(trackingRow.pharmacyOrderId, actions.pharmacyUpdate);
      }
      if (actions.orderUpdate) {
        await dbServer.orderDb.update(trackingRow.orderId, actions.orderUpdate);
      }

      const patient = rowToFedExPatient(trackingRow);
      for (const message of actions.messages) {
        await spruceServer.sendMessage(patient, message.templateKey, message.variables);
      }

      if (actions.logAction) {
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: "lifefile",
          action: actions.logAction,
          orderId: trackingRow.orderId,
          patientId: trackingRow.patientId,
          status: "success",
          details: {
            source: "fedex",
            trackingNumber: trackingRow.trackingNumber,
            fedexStatus,
            messages: actions.messages.map((message) => message.templateKey),
          },
        });
      }

      results.push({
        orderId: trackingRow.orderId,
        trackingNumber: trackingRow.trackingNumber,
        fedexStatus: fedexStatus.kind,
        actions: [
          ...(actions.pharmacyUpdate ? ["pharmacy_update"] : []),
          ...(actions.orderUpdate ? ["order_update"] : []),
          ...actions.messages.map((message) => `sms:${message.templateKey}`),
        ],
        status: "processed",
      });
    } catch (error) {
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "lifefile",
        action: "FedEx tracking sync failed",
        orderId: trackingRow.orderId,
        patientId: trackingRow.patientId,
        status: "error",
        details: { source: "fedex", trackingNumber: trackingRow.trackingNumber },
        error: (error as Error).message,
      }).catch(() => {});
      results.push({
        orderId: trackingRow.orderId,
        trackingNumber: trackingRow.trackingNumber,
        actions: [],
        status: "error",
        error: (error as Error).message,
      });
    }
  }

  return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
}

export const POST = GET;
