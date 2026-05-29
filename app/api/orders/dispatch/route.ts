import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as pharmacy from "@/services/pharmacy";
import * as spruceServer from "@/services/spruce.server";
import { getIdentityGate } from "@/lib/identity";
import { actorFromHeaders, logPhiDisclosure } from "@/lib/phi-audit";
import { preferCompletePatientForIntegrations, resolvePatient } from "@/lib/patient-resolver";
import { hydratePatientFromPracticeQ } from "@/lib/provider-chart";
import { generateId } from "@/lib/utils";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { normalizeProduct, tirzepatideProduct } from "@/data/products";
import { requireAdmin } from "@/lib/server-auth";
import type { Patient } from "@/types";

function answerValue(practiceq: Awaited<ReturnType<typeof getPracticeQMirrorForOrder>> | null | undefined, pattern: RegExp): string {
  const answer = practiceq?.answers.find((item) => pattern.test(item.question.toLowerCase()))?.answer?.trim() ?? "";
  return answer.toLowerCase() === "no answer" ? "" : answer;
}

async function hydratePatientFromOrderAnswers(order: NonNullable<Awaited<ReturnType<typeof dbServer.orderDb.getById>>>, patient: any) {
  if (!patient || (patient.firstName && patient.lastName && patient.phone && patient.address?.street1)) return patient;
  const packet = await dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null);
  const practiceq = await getPracticeQMirrorForOrder(order, packet).catch(() => null);
  if (!practiceq?.available) return patient;

  const hydrated = hydratePatientFromPracticeQ(patient, practiceq);
  if (!practiceq.answers.length) return hydrated;

  const firstName = hydrated.firstName || answerValue(practiceq, /^first name\b/);
  const lastName = hydrated.lastName || answerValue(practiceq, /^last name\b/);
  const phone = hydrated.phone || answerValue(practiceq, /^phone/);
  const dateOfBirth = hydrated.dateOfBirth || answerValue(practiceq, /date of birth|dob/);
  const street1 = hydrated.address?.street1 || answerValue(practiceq, /address/);
  const city = hydrated.address?.city || answerValue(practiceq, /^city\b/);
  const state = hydrated.address?.state || answerValue(practiceq, /^state\b/);
  const zipCode = hydrated.address?.zipCode || answerValue(practiceq, /zip/);
  return {
    ...hydrated,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    address: { ...hydrated.address, street1, city, state, zipCode, country: hydrated.address?.country || "US" },
    shippingAddress: {
      ...hydrated.shippingAddress,
      street1: hydrated.shippingAddress?.street1 || street1,
      city: hydrated.shippingAddress?.city || city,
      state: hydrated.shippingAddress?.state || state,
      zipCode: hydrated.shippingAddress?.zipCode || zipCode,
      country: hydrated.shippingAddress?.country || "US",
    },
  };
}

function patientStub(order: NonNullable<Awaited<ReturnType<typeof dbServer.orderDb.getById>>>): Patient {
  const now = new Date().toISOString();
  return {
    id: order.patientId,
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "other",
    phone: "",
    email: "",
    address: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    shippingAddress: { street1: "", city: "", state: "", zipCode: "", country: "US" },
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId, patientData, productData } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const gate = getIdentityGate(order);
    if (!gate.canDispatch) {
      return NextResponse.json(
        {
          error: "Identity verification required before pharmacy dispatch",
          identityStatus: order.identityStatus ?? "missing",
        },
        { status: 409 }
      );
    }
    const submittedPatient =
      patientData ??
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId) ??
      patientStub(order);
    const patient = await hydratePatientFromOrderAnswers(order, preferCompletePatientForIntegrations(
      await resolvePatient(order).catch(() => null),
      submittedPatient
    ));
    const product = normalizeProduct(
      productData ??
      (await dbServer.productDb.getById(order.productId).catch(() => null)) ??
      db.productDb.getById(order.productId) ??
      tirzepatideProduct
    );
    const packet = await dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null);
    const packetDose = typeof packet?.packetData?.doseSelected === "string" ? packet.packetData.doseSelected : "";
    const normalized = normalizeOrderForPharmacyDispatch(order, product, [order.doseId, packetDose]);
    if (!normalized.normalizedOrder) {
      return NextResponse.json(
        {
          error: "Order dispatch failed",
          detail: `Invalid order data - ${normalized.reason ?? "missing product or dose"}`,
        },
        { status: 422 }
      );
    }
    if (normalized.repaired) {
      await dbServer.orderDb.update(orderId, { doseId: normalized.normalizedOrder.doseId }).catch(() => {});
      db.orderDb.update(orderId, { doseId: normalized.normalizedOrder.doseId });
    }
    const auditCtx = actorFromHeaders(req.headers);
    const pharmacyIntegration = pharmacy.getPharmacyProvider() === "appsheet" ? "appsheet" : "lifefile";
    let pharmacyOrder;
    try {
      pharmacyOrder = await pharmacy.createPharmacyOrder(normalized.normalizedOrder, { patient, product });
      await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
      const update = { status: "sent_to_pharmacy" as const, pharmacyStatus: "submitted" as const };
      db.orderDb.update(orderId, update);
      await dbServer.orderDb.update(orderId, update).catch(() => {});
      if (patient) {
        await spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId }).catch(() => {});
      }
      logPhiDisclosure(order.patientId, orderId, pharmacyIntegration, auditCtx.actor);
    } catch (error) {
      const errorMessage = (error as Error).message;
      const update = { status: "approved" as const, pharmacyStatus: "error" as const };
      db.orderDb.update(orderId, update);
      await dbServer.orderDb.update(orderId, update).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: pharmacyIntegration,
        action: "Pharmacy order submission failed",
        orderId,
        patientId: order.patientId,
        status: "error",
        details: { source: "manual_dispatch" },
        error: errorMessage,
      }).catch(() => {});
      logPhiDisclosure(order.patientId, orderId, pharmacyIntegration, auditCtx.actor, "error", errorMessage);
      return NextResponse.json({ error: "Order dispatch failed", detail: errorMessage }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      orderId,
      pharmacyStatus: "submitted",
      lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
    });
  } catch (error) {
    console.error("Order dispatch error:", error);
    return NextResponse.json({ error: "Order dispatch failed" }, { status: 500 });
  }
}
