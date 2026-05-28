import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { isAdminRequest, isProviderRequest } from "@/lib/server-auth";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order =
    (await dbServer.orderDb.getById(params.id).catch(() => null)) ??
    db.orderDb.getById(params.id);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const [serverPatient, serverProduct, serverPharmacyOrder, serverPracticeQPacket, practiceqAutomationJob] = await Promise.all([
    dbServer.patientDb.getById(order.patientId).catch(() => null),
    dbServer.productDb.getById(order.productId).catch(() => null),
    dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null),
    dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null),
    dbServer.practiceqAutomationJobDb.getByOrder(order.id).catch(() => db.practiceqAutomationJobDb.getByOrder(order.id)),
  ]);

  const patient = serverPatient ?? db.patientDb.getById(order.patientId);
  const product = serverProduct ?? db.productDb.getById(order.productId);
  const pharmacyOrder = serverPharmacyOrder ?? db.pharmacyOrderDb.getByOrder(order.id);
  const practiceqPacket = serverPracticeQPacket ?? db.practiceqDb.getByOrder(order.id);
  const practiceqMirror = await getPracticeQMirrorForOrder(order, practiceqPacket).catch(() => null);
  const canViewIdentity = isAdminRequest(req) || isProviderRequest(req);
  const [uploads, review, integrationLogs] = canViewIdentity
    ? await Promise.all([
        dbServer.uploadDb.getByOrder(order.id).catch(() => db.uploadDb.getByOrder(order.id)),
        dbServer.providerReviewDb.getByOrder(order.id).catch(() => db.providerReviewDb.getByOrder(order.id)),
        dbServer.integrationLogDb.getByOrder(order.id).catch(() =>
          db.integrationLogDb.getAll().filter((log) => log.orderId === order.id)
        ),
      ])
    : [[], null, []];

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
    identity: canViewIdentity
      ? {
          status: order.identityStatus ?? "missing",
          reason: order.identityReason,
          reviewedAt: order.identityReviewedAt,
          reviewedBy: order.identityReviewedBy,
          aiResult: order.identityAiResult ?? review?.identityAiResult ?? null,
          uploads,
        }
      : undefined,
    diagnostics: canViewIdentity
      ? {
          practiceqAutomation: practiceqAutomationJob
            ? {
                status: practiceqAutomationJob.status,
                attempts: practiceqAutomationJob.attempts,
                handoffUrl: practiceqAutomationJob.handoffUrl,
                handoffExpiresAt: practiceqAutomationJob.handoffExpiresAt,
                intakeId: practiceqAutomationJob.intakeId,
                lastError: practiceqAutomationJob.lastError,
                updatedAt: practiceqAutomationJob.updatedAt,
              }
            : null,
          integrationLogs: integrationLogs.map((log) => ({
            id: log.id,
            timestamp: log.timestamp,
            integrationName: log.integrationName,
            action: log.action,
            status: log.status,
            details: log.details,
            error: log.error,
          })),
        }
      : undefined,
  });
}
