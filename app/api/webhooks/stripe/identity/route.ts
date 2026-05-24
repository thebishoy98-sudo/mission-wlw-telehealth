import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

function verifyStripeSignature(rawBody: string, signature: string, secret: string) {
  const timestamp = signature.match(/t=([^,]+)/)?.[1];
  const expected = signature.match(/v1=([^,]+)/)?.[1];
  if (!timestamp || !expected) return false;
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";
    const webhookSecret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? "";

    if (webhookSecret && (!signature || !verifyStripeSignature(rawBody, signature, webhookSecret))) {
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const session = event.data?.object;
    const orderId = session?.metadata?.order_id;
    if (!orderId || !String(event.type).startsWith("identity.verification_session.")) {
      return NextResponse.json({ received: true });
    }

    const now = new Date().toISOString();
    const status =
      event.type === "identity.verification_session.verified"
        ? "verified"
        : event.type === "identity.verification_session.requires_input"
          ? "needs_review"
          : "pending";

    const update = {
      identityStatus: status as "verified" | "needs_review" | "pending",
      identityReason:
        status === "verified"
          ? "Stripe Identity verified document and selfie."
          : status === "needs_review"
            ? "Stripe Identity requires more input or manual review."
            : "Stripe Identity verification is processing.",
      identityReviewedAt: now,
      identityReviewedBy: "stripe-identity",
      identityAiResult: {
        status: status as "verified" | "needs_review" | "pending",
        confidence: status === "verified" ? 1 : 0,
        summary:
          status === "verified"
            ? "Stripe Identity verified the patient identity."
            : "Stripe Identity did not return a verified result.",
        flags: [`stripe_${session?.status ?? "unknown"}`],
        checkedAt: now,
      },
    };

    db.orderDb.update(orderId, update);
    await dbServer.orderDb.update(orderId, update).catch(() => {});

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);
    if (review) {
      const reviewUpdate = {
        identityAiResult: update.identityAiResult,
        identityReviewRequired: status !== "verified",
      };
      db.providerReviewDb.update(review.id, reviewUpdate);
      await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
    }

    await dbServer.integrationLogDb.create({
      id: `log_stripe_webhook_${Date.now()}`,
      timestamp: now,
      integrationName: "system",
      action: `Stripe Identity webhook ${event.type}`,
      orderId,
      patientId: session?.metadata?.patient_id,
      status: "success",
      details: { sessionId: session?.id, stripeStatus: session?.status },
    }).catch(() => {});

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe Identity webhook error:", error);
    return NextResponse.json({ error: "Stripe Identity webhook failed" }, { status: 500 });
  }
}
