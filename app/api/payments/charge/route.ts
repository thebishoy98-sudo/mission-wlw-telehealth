import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as practiceq from "@/services/practiceq";
import * as quickbooks from "@/services/quickbooks";
import * as lifefile from "@/services/lifefile";
import * as spruce from "@/services/spruce";
import { checkEligibility } from "@/lib/eligibility";
import { generateId } from "@/lib/utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-04-22.dahlia" as any,
});

export async function POST(req: NextRequest) {
  try {
    const { orderId, paymentMethodId, amount } = await req.json();

    if (!orderId || !paymentMethodId || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Load order (try server DB first, fall back to localStorage)
    const order = (await dbServer.orderDb.getById(orderId)) ?? db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Duplicate guard
    if (order.status !== "draft") {
      return NextResponse.json(
        { error: "Order already processed", status: order.status },
        { status: 409 }
      );
    }

    // Server-side eligibility re-check
    const answers = await dbServer.answerDb.getByOrder(orderId);
    const fallbackAnswers = answers.length ? answers : db.answerDb.getByOrder(orderId);
    const questions = await dbServer.questionDb.getAll();
    const fallbackQuestions = questions.length ? questions : db.questionDb.getAll();
    const eligibility = checkEligibility(fallbackAnswers, fallbackQuestions);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: "Patient not eligible", reason: eligibility.reason }, { status: 422 });
    }

    // Get or create Stripe customer
    const patient = (await dbServer.patientDb.getById(order.patientId)) ?? db.patientDb.getById(order.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    let stripeCustomerId = (patient as any).stripeCustomerId as string | undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: patient.email,
        name: `${patient.firstName} ${patient.lastName}`,
        phone: patient.phone,
        metadata: { patientId: patient.id },
      });
      stripeCustomerId = customer.id;
      // Save back
      db.patientDb.update(patient.id, { updatedAt: new Date().toISOString() });
    }

    // Create and confirm PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,                  // already in cents
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { orderId, patientId: patient.id },
      description: `Mission WLW — Order ${orderId}`,
    });

    if (paymentIntent.status === "requires_action") {
      return NextResponse.json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
      });
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Payment failed", status: paymentIntent.status }, { status: 402 });
    }

    // Record payment
    const paymentRecord = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      amount,
      currency: "USD" as const,
      status: "completed" as const,
      paymentMethod: "credit_card" as const,
      cardLast4: (paymentIntent.payment_method as any)?.card?.last4 ?? "0000",
      cardBrand: (paymentIntent.payment_method as any)?.card?.brand ?? "unknown",
      transactionId: paymentIntent.id,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    db.paymentDb.create(paymentRecord);
    await dbServer.paymentDb.create(paymentRecord).catch(() => {});

    // Update order
    const updates = {
      status: "sent_to_pharmacy" as const,
      paymentStatus: "completed" as const,
      submittedAt: new Date().toISOString(),
    };
    db.orderDb.update(orderId, updates);
    await dbServer.orderDb.update(orderId, updates).catch(() => {});

    const updatedOrder = db.orderDb.getById(orderId)!;

    // Run integration chain (non-fatal errors)
    const errors: string[] = [];

    try { practiceq.submitIntakePacket(updatedOrder); } catch (e) {
      errors.push(`PracticeQ: ${(e as Error).message}`);
    }
    try { quickbooks.createCustomerRecord(patient); quickbooks.createInvoice(updatedOrder, paymentRecord); } catch (e) {
      errors.push(`QuickBooks: ${(e as Error).message}`);
    }
    try { lifefile.createPharmacyOrder(updatedOrder); } catch (e) {
      errors.push(`LifeFile: ${(e as Error).message}`);
    }
    try { spruce.sendMessage(patient.id, "payment_received", { orderId }); } catch (e) {
      errors.push(`Spruce: ${(e as Error).message}`);
    }

    // Auto provider review
    const reviewRecord = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      status: "approved" as const,
      reviewedAt: new Date().toISOString(),
      reviewedBy: "system-auto",
      notes: "Auto-approved: patient passed eligibility screening",
    };
    db.providerReviewDb.create(reviewRecord);
    await dbServer.providerReviewDb.create(reviewRecord).catch(() => {});

    return NextResponse.json({
      success: true,
      orderId,
      paymentIntentId: paymentIntent.id,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    if (err.type === "StripeCardError") {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("Payment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
