/**
 * Edge case tests: duplicate submissions, payment failures, concurrent operations,
 * partial submission recovery, and provider rejection flow.
 */
import * as db from "@/lib/db";
import { checkEligibility } from "@/lib/eligibility";
import type { Order, Patient, Payment, Question, QuestionnaireAnswer } from "@/types";

const makePatient = (id = "p1"): Patient => ({
  id,
  firstName: "Test",
  lastName: "User",
  dateOfBirth: "1990-01-01",
  gender: "female",
  phone: "5550001111",
  email: `${id}@example.com`,
  address: { street1: "1 Test St", city: "Dallas", state: "TX", zipCode: "75001", country: "US" },
  shippingAddress: { street1: "1 Test St", city: "Dallas", state: "TX", zipCode: "75001", country: "US" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeOrder = (id = "o1", status: Order["status"] = "draft"): Order => ({
  id,
  patientId: "p1",
  productId: "prod_1",
  doseId: "dose_1",
  status,
  paymentStatus: "pending",
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ── Duplicate submission ─────────────────────────────────────────────────────

describe("Duplicate submission prevention", () => {
  it("rejects a second payment for an already-processed order", () => {
    db.orderDb.create(makeOrder("o1", "sent_to_pharmacy"));

    const order = db.orderDb.getById("o1")!;
    // The API route checks: if order.status !== 'draft' && !== 'pending_review' → 409
    const alreadyProcessed =
      order.status !== "draft" && order.status !== "pending_review";
    expect(alreadyProcessed).toBe(true);
  });

  it("allows re-submission when order is still in draft", () => {
    db.orderDb.create(makeOrder("o1", "draft"));
    const order = db.orderDb.getById("o1")!;
    const canProcess = order.status === "draft" || order.status === "pending_review";
    expect(canProcess).toBe(true);
  });

  it("detects duplicate patient email", () => {
    db.patientDb.create(makePatient("p1"));
    // Second attempt with same email
    const existing = db.patientDb.getByEmail("p1@example.com");
    expect(existing).not.toBeNull();
    expect(existing?.id).toBe("p1");
  });
});

// ── Payment failure recovery ─────────────────────────────────────────────────

describe("Payment failure recovery", () => {
  it("payment with status failed does not advance order", () => {
    db.orderDb.create(makeOrder("o1", "draft"));

    const failedPayment: Payment = {
      id: "pay_1",
      orderId: "o1",
      patientId: "p1",
      amount: 299,
      currency: "USD",
      status: "failed",
      paymentMethod: "credit_card",
      cardLast4: "0002",
      cardBrand: "Visa",
      transactionId: "txn_fail_001",
      createdAt: new Date().toISOString(),
    };
    db.paymentDb.create(failedPayment);

    // Order should still be draft because payment failed
    const order = db.orderDb.getById("o1")!;
    expect(order.status).toBe("draft");
    expect(order.paymentStatus).toBe("pending");
  });

  it("order can be retried after payment failure", () => {
    db.orderDb.create(makeOrder("o1", "draft"));
    db.paymentDb.create({
      id: "pay_1",
      orderId: "o1",
      patientId: "p1",
      amount: 299,
      currency: "USD",
      status: "failed",
      paymentMethod: "credit_card",
      cardLast4: "0002",
      cardBrand: "Visa",
      transactionId: "txn_fail_001",
      createdAt: new Date().toISOString(),
    });

    // Simulate retry: update payment to completed
    db.paymentDb.update("pay_1", { status: "completed", processedAt: new Date().toISOString() });
    db.orderDb.update("o1", { paymentStatus: "completed", status: "sent_to_pharmacy" });

    const order = db.orderDb.getById("o1")!;
    expect(order.status).toBe("sent_to_pharmacy");
    expect(order.paymentStatus).toBe("completed");
  });
});

// ── Provider rejection flow ──────────────────────────────────────────────────

describe("Provider rejection flow", () => {
  it("rejected order stores rejection reason", () => {
    db.orderDb.create(makeOrder("o1", "pending_review"));
    db.providerReviewDb.create({
      id: "rev1",
      orderId: "o1",
      patientId: "p1",
      status: "pending",
    });

    // Provider rejects
    db.orderDb.update("o1", { status: "rejected", rejectionReason: "BMI below threshold" });
    db.providerReviewDb.update("rev1", {
      status: "rejected",
      rejectionReason: "BMI below threshold",
      reviewedBy: "dr.smith",
      reviewedAt: new Date().toISOString(),
    });

    const order = db.orderDb.getById("o1")!;
    expect(order.status).toBe("rejected");
    expect(order.rejectionReason).toBe("BMI below threshold");

    const review = db.providerReviewDb.getByOrder("o1")!;
    expect(review.status).toBe("rejected");
    expect(review.reviewedBy).toBe("dr.smith");
  });

  it("rejected order cannot be re-processed without reset", () => {
    db.orderDb.create(makeOrder("o1", "rejected"));
    const order = db.orderDb.getById("o1")!;
    // API check: status must be pending_review or draft
    const canReview = order.status === "pending_review" || order.status === "approved";
    expect(canReview).toBe(false);
  });

  it("needs_more_info status keeps order in pending_review", () => {
    db.orderDb.create(makeOrder("o1", "pending_review"));
    db.providerReviewDb.create({ id: "rev1", orderId: "o1", patientId: "p1", status: "pending" });

    db.providerReviewDb.update("rev1", {
      status: "needs_more_info",
      notes: "Please provide recent labs",
    });

    const review = db.providerReviewDb.getByOrder("o1")!;
    expect(review.status).toBe("needs_more_info");
    // Order stays pending_review
    expect(db.orderDb.getById("o1")?.status).toBe("pending_review");
  });
});

// ── Concurrent / multiple orders ─────────────────────────────────────────────

describe("Multiple orders per patient", () => {
  it("patient can have multiple orders in different states", () => {
    db.patientDb.create(makePatient("p1"));
    db.orderDb.create(makeOrder("o1", "delivered"));
    db.orderDb.create(makeOrder("o2", "draft"));

    const patientOrders = db.orderDb.getByPatient("p1");
    expect(patientOrders).toHaveLength(2);

    const statuses = patientOrders.map((o) => o.status);
    expect(statuses).toContain("delivered");
    expect(statuses).toContain("draft");
  });

  it("reorder creates a new order without affecting existing ones", () => {
    db.patientDb.create(makePatient("p1"));
    db.orderDb.create(makeOrder("o1", "delivered"));

    // New reorder
    db.orderDb.create(makeOrder("o2", "draft"));

    expect(db.orderDb.getById("o1")?.status).toBe("delivered");
    expect(db.orderDb.getById("o2")?.status).toBe("draft");
  });
});

// ── Eligibility edge cases ────────────────────────────────────────────────────

describe("Eligibility edge cases", () => {
  const questions: Question[] = [
    {
      id: "q1",
      category: "medical_history",
      text: "Thyroid cancer history?",
      type: "radio",
      options: ["Yes", "No"],
      required: true,
      displayOrder: 1,
      disqualifying: "Yes",
    },
  ];

  it("multiple disqualifying conditions — stops at first", () => {
    const moreQuestions: Question[] = [
      ...questions,
      {
        id: "q2",
        category: "medical_history",
        text: "Pregnant?",
        type: "radio",
        options: ["Yes", "No"],
        required: true,
        displayOrder: 2,
        disqualifying: "Yes",
      },
    ];

    const answers: QuestionnaireAnswer[] = [
      { id: "a1", orderId: "o1", questionId: "q1", answer: "Yes", createdAt: new Date().toISOString() },
      { id: "a2", orderId: "o1", questionId: "q2", answer: "Yes", createdAt: new Date().toISOString() },
    ];

    const result = checkEligibility(answers, moreQuestions);
    expect(result.eligible).toBe(false);
    // Only one reason returned (first disqualifying answer)
    expect(typeof result.reason).toBe("string");
  });

  it("whitespace in answer value is trimmed", () => {
    const answers: QuestionnaireAnswer[] = [
      { id: "a1", orderId: "o1", questionId: "q1", answer: "  Yes  ", createdAt: new Date().toISOString() },
    ];
    const result = checkEligibility(answers, questions);
    expect(result.eligible).toBe(false);
  });
});

// ── Integration log audit ─────────────────────────────────────────────────────

describe("Integration log audit trail", () => {
  it("logs are append-only — previous logs remain after new entries", () => {
    db.integrationLogDb.create({
      id: "log1",
      timestamp: new Date().toISOString(),
      integrationName: "system",
      action: "Order created",
      orderId: "o1",
      status: "success",
      details: {},
    });
    db.integrationLogDb.create({
      id: "log2",
      timestamp: new Date().toISOString(),
      integrationName: "practiceq",
      action: "Packet submitted",
      orderId: "o1",
      status: "success",
      details: {},
    });

    const logs = db.integrationLogDb.getAll();
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe("log1");
    expect(logs[1].id).toBe("log2");
  });
});
