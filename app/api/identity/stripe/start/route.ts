import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { createStripeIdentitySession, isStripeIdentityConfigured } from "@/services/stripe-identity";

export async function POST(req: NextRequest) {
  try {
    if (!isStripeIdentityConfigured()) {
      return NextResponse.json({ configured: false, error: "Stripe Identity is not configured" }, { status: 503 });
    }

    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getByIdentityUploadToken(token).catch(() => null)) ??
      db.orderDb.getByIdentityUploadToken(token);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const patient =
      (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
      db.patientDb.getById(order.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const origin = req.nextUrl.origin;
    const session = await createStripeIdentitySession({
      orderId: order.id,
      patientId: patient.id,
      email: patient.email,
      returnUrl: `${origin}/verify-identity/${encodeURIComponent(token)}?stripe=return`,
    });

    await dbServer.integrationLogDb.create({
      id: `log_stripe_idv_${Date.now()}`,
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: "Stripe Identity session created",
      orderId: order.id,
      patientId: patient.id,
      status: "success",
      details: { sessionId: session.id },
    }).catch(() => {});

    return NextResponse.json({ configured: true, session });
  } catch (error) {
    console.error("Stripe Identity start error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
