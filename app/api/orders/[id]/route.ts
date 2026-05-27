import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order =
    (await dbServer.orderDb.getById(params.id).catch(() => null)) ??
    db.orderDb.getById(params.id);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const [serverPatient, serverProduct, serverPharmacyOrder, serverPracticeQPacket] = await Promise.all([
    dbServer.patientDb.getById(order.patientId).catch(() => null),
    dbServer.productDb.getById(order.productId).catch(() => null),
    dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null),
    dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null),
  ]);

  const patient = serverPatient ?? db.patientDb.getById(order.patientId);
  const product = serverProduct ?? db.productDb.getById(order.productId);
  const pharmacyOrder = serverPharmacyOrder ?? db.pharmacyOrderDb.getByOrder(order.id);
  const practiceqPacket = serverPracticeQPacket ?? db.practiceqDb.getByOrder(order.id);
  const practiceqMirror = await getPracticeQMirrorForOrder(order, practiceqPacket).catch(() => null);

  return NextResponse.json({
    order,
    patient: patient
      ? {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
        }
      : null,
    product: product ? { id: product.id, name: product.name } : null,
    pharmacy: pharmacyOrder
      ? {
          status: pharmacyOrder.status,
          trackingNumber: pharmacyOrder.trackingNumber,
          shippedAt: pharmacyOrder.shippedAt,
        }
      : null,
    practiceq: practiceqMirror ?? (practiceqPacket
      ? {
          available: false,
          status: practiceqPacket.status,
          submittedAt: practiceqPacket.submittedAt,
          intakeId: practiceqPacket.id,
          answers: [],
        }
      : null),
  });
}
