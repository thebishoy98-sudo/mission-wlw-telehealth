import type { Order } from "@/types";

/** A patient record or abandoned checkout alone is not established care. */
export function findEstablishedOrder(current: Order, history: Order[]): Order | undefined {
  return history.find(previous => previous.id !== current.id && previous.patientId === current.patientId &&
    previous.paymentStatus === "completed" && !["cancelled", "refunded", "rejected"].includes(previous.status) &&
    Date.parse(previous.createdAt) < Date.parse(current.createdAt) &&
    ["submitted", "received", "processing", "fulfilled", "shipped", "delivered"].includes(previous.pharmacyStatus));
}
