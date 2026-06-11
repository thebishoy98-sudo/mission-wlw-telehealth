import type { FedExPackageStatus } from "@/services/fedex-tracking";
import { fetchFedExTrackingStatus, isFedExTrackingConfigured } from "@/services/fedex-tracking";
import type { PharmacyStatus, OrderStatus, Patient } from "@/types";

export type FedExTrackingOrderRow = {
  orderId: string;
  pharmacyOrderId: string;
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  trackingNumber: string;
};

export type FedExTrackingAction = {
  pharmacyUpdate: { status: PharmacyStatus; deliveredAt?: string } | null;
  orderUpdate: { status: OrderStatus; pharmacyStatus: PharmacyStatus } | null;
  messages: { templateKey: string; variables: Record<string, string> }[];
  logAction: string | null;
};

export function buildFedExTrackingActions(input: {
  row: FedExTrackingOrderRow;
  status: FedExPackageStatus;
  existingTemplateKeys: string[];
  now: string;
}): FedExTrackingAction {
  const existing = new Set(input.existingTemplateKeys);

  if (input.status.kind === "delivered") {
    return {
      pharmacyUpdate: { status: "delivered", deliveredAt: input.now },
      orderUpdate: { status: "delivered", pharmacyStatus: "delivered" },
      messages: existing.has("order_delivered")
        ? []
        : [{ templateKey: "order_delivered", variables: { orderId: input.row.orderId } }],
      logAction: "FedEx delivered order",
    };
  }

  if (input.status.kind === "out_for_delivery") {
    return {
      pharmacyUpdate: null,
      orderUpdate: null,
      messages: existing.has("order_out_for_delivery")
        ? []
        : [
            {
              templateKey: "order_out_for_delivery",
              variables: { orderId: input.row.orderId, trackingNumber: input.row.trackingNumber },
            },
          ],
      logAction: "FedEx package out for delivery",
    };
  }

  return {
    pharmacyUpdate: null,
    orderUpdate: null,
    messages: [],
    logAction: null,
  };
}

export function rowToFedExPatient(row: FedExTrackingOrderRow): Patient {
  return {
    id: row.patientId,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: "",
    dateOfBirth: "",
    gender: "other",
    address: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    shippingAddress: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    createdAt: "",
    updatedAt: "",
  };
}

export async function runFedExTrackingSync() {
  const [{ sql, ...dbServer }, { generateId }, spruceServer] = await Promise.all([
    import("@/lib/db.server"),
    import("@/lib/utils"),
    import("@/services/spruce.server"),
  ]);

  if (!process.env.POSTGRES_URL) {
    return { skipped: "No POSTGRES_URL configured", processed: 0, results: [] };
  }

  if (!isFedExTrackingConfigured()) {
    return { skipped: "FedEx credentials are not configured", processed: 0, results: [] };
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

  return { processed: results.length, results };
}
