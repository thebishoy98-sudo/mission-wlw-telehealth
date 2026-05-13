import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as practiceq from "@/services/practiceq";
import * as quickbooks from "@/services/quickbooks";
import * as lifefile from "@/services/lifefile";
import * as spruce from "@/services/spruce";
import { checkEligibility } from "@/lib/eligibility";
import { generateId } from "@/lib/utils";
import type { Order, Payment } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, paymentMethod, cardLast4, cardBrand, amount } = body;

    if (!orderId || !paymentMethod || !cardLast4 || !cardBrand || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. Load order
    const order = db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Duplicate submission guard — if already processed, return current state
    if (order.status !== "draft" && order.status !== "pending_review") {
      return NextResponse.json(
        { error: "Order has already been processed", orderStatus: order.status },
        { status: 409 }
      );
    }

    // 3. Eligibility re-check (server-side validation)
    const answers = db.answerDb.getByOrder(orderId);
    const questions = db.questionDb.getAll();
    const eligibility = checkEligibility(answers, questions);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: "Patient is not eligible", reason: eligibility.reason },
        { status: 422 }
      );
    }

    // 4. Record payment
    const payment: Payment = {
      id: generateId(),
      orderId,
      patientId: order.patientId,
      amount,
      currency: "USD",
      status: "completed",
      paymentMethod,
      cardLast4,
      cardBrand,
      transactionId: `txn_${generateId()}`,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    db.paymentDb.create(payment);

    // 5. Update order to submitted
    db.orderDb.update(orderId, {
      status: "sent_to_pharmacy",
      paymentStatus: "completed",
      submittedAt: new Date().toISOString(),
    });

    const updatedOrder = db.orderDb.getById(orderId)!;

    // 6. Run integration chain — collect errors but don't fail the whole request
    const errors: string[] = [];

    try {
      practiceq.submitIntakePacket(updatedOrder);
      db.orderDb.update(orderId, { practiceQStatus: "submitted" });
    } catch (e) {
      errors.push(`PracticeQ: ${(e as Error).message}`);
      db.orderDb.update(orderId, { practiceQStatus: "error" });
    }

    try {
      const patient = db.patientDb.getById(order.patientId);
      if (patient) {
        quickbooks.createCustomerRecord(patient);
        quickbooks.createInvoice(updatedOrder, payment);
        db.orderDb.update(orderId, { quickbooksStatus: "invoiced" });
      }
    } catch (e) {
      errors.push(`QuickBooks: ${(e as Error).message}`);
      db.orderDb.update(orderId, { quickbooksStatus: "error" });
    }

    try {
      lifefile.createPharmacyOrder(updatedOrder);
      db.orderDb.update(orderId, { pharmacyStatus: "submitted" });
    } catch (e) {
      errors.push(`Life File: ${(e as Error).message}`);
      db.orderDb.update(orderId, { pharmacyStatus: "error" });
    }

    try {
      spruce.sendMessage(order.patientId, "payment_received", { orderId });
    } catch (e) {
      errors.push(`Spruce: ${(e as Error).message}`);
    }

    // 7. Create provider review record (auto-approved since eligibility passed)
    db.providerReviewDb.create({
      id: generateId(),
      orderId,
      patientId: order.patientId,
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: "system-auto",
      notes: "Auto-approved: patient passed eligibility screening",
    });

    return NextResponse.json({
      success: true,
      orderId,
      paymentId: payment.id,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Intake submit error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
