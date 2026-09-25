import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { orderDb, patientDb, uploadDb } from "@/lib/db.server";
import { sendAdminNotification } from "@/services/admin-notifications";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const order = await orderDb.getById(String(body.orderId ?? ""));
  if (!order || order.priorMedStatus !== "submitted") {
    return NextResponse.json({ error: "No prescription awaiting review for this order." }, { status: 409 });
  }
  const uploads = (await uploadDb.getByOrder(order.id)).filter(u => u.type === "prior_prescription")
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id));
  if (!uploads[0]) return NextResponse.json({ error: "Prescription upload not found." }, { status: 404 });
  const patient = await patientDb.getById(order.patientId);
  const results = await sendAdminNotification("prior_prescription_review_needed", {
    orderId: order.id, patientId: order.patientId, eventId: uploads[0].id,
    patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : undefined,
  });
  const delivered = results.length > 0 && results.every(r => r.status === "sent" || r.status === "duplicate");
  return NextResponse.json({ success: delivered, statuses: results.map(r => r.status),
    ...(!delivered ? { error: "Alert was not confirmed for all admins. Check notification settings and integration logs." } : {}),
  }, { status: delivered ? 200 : 503 });
}
