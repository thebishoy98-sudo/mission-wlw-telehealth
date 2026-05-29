import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { isAdminRequest, isProviderRequest, requireAdmin } from "@/lib/server-auth";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
import * as spruceServer from "@/services/spruce.server";
import { generateId } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order =
    (await dbServer.orderDb.getById(id).catch(() => null)) ??
    db.orderDb.getById(id);

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
  const practiceqMirror = await getPracticeQMirrorForOrder(order, practiceqPacket, practiceqAutomationJob?.intakeId).catch(() => null);
  const canViewIdentity = isAdminRequest(req) || isProviderRequest(req);
  const isPrivilegedRequest = canViewIdentity;
  const requestedEmail = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";

  if (!isPrivilegedRequest) {
    if (!patient?.email || !requestedEmail || patient.email.toLowerCase() !== requestedEmail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  }
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
          email: isPrivilegedRequest ? patient.email : undefined,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const trackingNumber = String(body.trackingNumber ?? "").trim();

  if (!trackingNumber) {
    return NextResponse.json({ error: "Tracking number is required" }, { status: 400 });
  }

  const order =
    (await dbServer.orderDb.getById(id).catch(() => null)) ??
    db.orderDb.getById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const pharmacyOrder =
    (await dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null)) ??
    db.pharmacyOrderDb.getByOrder(order.id);

  if (!pharmacyOrder) {
    return NextResponse.json({ error: "No pharmacy order found for tracking" }, { status: 404 });
  }

  const shippedAt = new Date().toISOString();
  const pharmacyUpdate = { trackingNumber, status: "shipped" as const, shippedAt };
  const orderUpdate = { pharmacyStatus: "shipped" as const, status: "shipped" as const };

  const localPharmacyOrder = db.pharmacyOrderDb.update(pharmacyOrder.id, pharmacyUpdate);
  db.orderDb.update(order.id, orderUpdate);
  const serverPharmacyOrder =
    (await dbServer.pharmacyOrderDb.update(pharmacyOrder.id, pharmacyUpdate).catch(() => null)) ??
    localPharmacyOrder;
  const updatedOrder =
    (await dbServer.orderDb.update(order.id, orderUpdate).catch(() => null)) ??
    db.orderDb.getById(order.id);

  const patient =
    (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
    db.patientDb.getById(order.patientId);

  if (patient) {
    await spruceServer.sendMessage(patient, "order_shipped", { orderId: order.id, trackingNumber }).catch(() => {});
  }

  const log = {
    id: generateId(),
    timestamp: shippedAt,
    integrationName: "lifefile" as const,
    action: "Tracking number manually recorded",
    orderId: order.id,
    patientId: order.patientId,
    status: "success" as const,
    details: { lifeFileOrderId: pharmacyOrder.lifeFileOrderId, trackingNumber },
  };
  db.integrationLogDb.create(log);
  await dbServer.integrationLogDb.create(log).catch(() => {});

  return NextResponse.json({
    order: updatedOrder,
    pharmacy: serverPharmacyOrder,
  });
}
