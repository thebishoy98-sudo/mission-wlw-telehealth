/**
 * POST /api/intake/referral
 *
 * Creates (or returns an existing) patient referral affiliate link.
 * Called from the confirmation page after a successful order.
 * No auth required — validates name/orderId inputs, gracefully degrades if no DB.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { createOrGetPatientReferral } from "@/lib/referral-credit.server";
import { getPublicBaseUrl } from "@/lib/public-url";

export async function POST(req: NextRequest) {
  if (!process.env.POSTGRES_URL) return NextResponse.json({ link: null, code: null });

  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Paid order not found" }, { status: 404 });

    const [order, payment] = await Promise.all([
      dbServer.orderDb.getById(orderId).catch(() => null),
      dbServer.paymentDb.getByOrder(orderId).catch(() => null),
    ]);
    if (!order || !payment || payment.status !== "completed" || payment.patientId !== order.patientId) {
      return NextResponse.json({ error: "Paid order not found" }, { status: 404 });
    }
    const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
    if (!patient) return NextResponse.json({ error: "Paid order not found" }, { status: 404 });

    const referral = await createOrGetPatientReferral({
      patientId: patient.id,
      displayName: [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient",
      orderId: order.id,
    });
    return NextResponse.json({
      code: referral.code,
      link: `${getPublicBaseUrl(req)}?ref=${encodeURIComponent(referral.code)}`,
    });
  } catch (error) {
    console.error("Patient referral creation failed:", error);
    return NextResponse.json({ error: "Could not create referral link" }, { status: 500 });
  }
}
