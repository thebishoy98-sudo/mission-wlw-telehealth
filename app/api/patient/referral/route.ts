import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";
import {
  createOrGetPatientReferral,
  getPatientReferral,
  getReferralBalance,
} from "@/lib/referral-credit.server";
import { getPublicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const patientId = getPatientIdFromRequest(req);
  if (!patientId) {
    return NextResponse.json({ error: "Patient login required" }, { status: 401 });
  }

  let referral = await getPatientReferral(patientId);
  if (!referral) {
    const [patient, orders] = await Promise.all([
      dbServer.patientDb.getById(patientId).catch(() => null),
      dbServer.orderDb.getByPatient(patientId).catch(() => []),
    ]);
    const payments = await dbServer.paymentDb
      .getByOrders(orders.map((order) => order.id))
      .catch(() => []);
    const paidOrder = orders.find((order) =>
      payments.some((payment) => payment.orderId === order.id && payment.status === "completed")
    );
    if (patient && paidOrder) {
      referral = await createOrGetPatientReferral({
        patientId,
        displayName: [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient",
        orderId: paidOrder.id,
      });
    }
  }

  const balance = await getReferralBalance(patientId);
  if (!referral) return NextResponse.json({ code: null, link: null, balance });
  return NextResponse.json({
    code: referral.code,
    link: `${getPublicBaseUrl(req)}?ref=${encodeURIComponent(referral.code)}`,
    balance,
  });
}
