import type { FedExPackageStatus } from "@/services/fedex-tracking";
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
