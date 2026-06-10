import * as dbServer from "@/lib/db.server";
import type { Patient } from "@/types";
import * as spruceServer from "@/services/spruce.server";

export async function sendOrderSentToPharmacyMessage(patient: Patient, orderId: string) {
  const existingMessages = await dbServer.spruceMessageDb.getByOrder(orderId).catch(() => []);
  const alreadyRecorded = existingMessages.some((message) =>
    message.templateKey === "order_sent_to_pharmacy" &&
    message.status !== "failed"
  );
  if (alreadyRecorded) return null;

  return spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId });
}
