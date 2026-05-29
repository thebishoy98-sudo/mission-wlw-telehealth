import type { Order, ProviderReview } from "@/types";
import {
  buildManualIdentityApprovalOrderUpdate,
  buildManualIdentityApprovalReviewUpdate,
  shouldRetryPracticeQCompletionAfterIdentityApproval,
} from "@/lib/identity-approval";

const now = "2026-05-28T21:30:00.000Z";

const order: Order = {
  id: "order_1",
  patientId: "patient_1",
  productId: "product_1",
  doseId: "dose_1",
  status: "pending_review",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "completed",
  quickbooksStatus: "skipped",
  identityStatus: "needs_review",
  createdAt: now,
  updatedAt: now,
};

const review: ProviderReview = {
  id: "review_1",
  orderId: order.id,
  patientId: order.patientId,
  status: "needs_more_info",
  identityReviewRequired: true,
  notes: "Needs manual ID review",
};

describe("manual identity approval workflow", () => {
  it("approves pending orders instead of only changing the identity flag", () => {
    expect(
      buildManualIdentityApprovalOrderUpdate(order, {
        reviewedBy: "admin",
        notes: "ID approved",
        now,
      })
    ).toEqual({
      identityStatus: "manual_approved",
      identityReason: "ID approved",
      identityReviewedAt: now,
      identityReviewedBy: "admin",
      status: "approved",
      approvedAt: now,
      providerNotes: "ID approved",
    });
  });

  it("does not roll back orders already sent to pharmacy", () => {
    const update = buildManualIdentityApprovalOrderUpdate(
      { ...order, status: "sent_to_pharmacy", pharmacyStatus: "submitted" },
      { reviewedBy: "admin", now }
    );

    expect(update).toMatchObject({ identityStatus: "manual_approved" });
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("approvedAt");
  });

  it("marks the provider review approved when identity is manually approved", () => {
    expect(
      buildManualIdentityApprovalReviewUpdate(review, {
        reviewedBy: "admin",
        notes: "ID approved",
        now,
      })
    ).toEqual({
      status: "approved",
      reviewedAt: now,
      reviewedBy: "admin",
      notes: "ID approved",
      identityReviewRequired: false,
    });
  });

  it("retries PracticeQ completion only when pharmacy dispatch is unblocked", () => {
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval(order)).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...order, practiceQStatus: "submitted" })).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...order, practiceQStatus: "error" })).toBe(false);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...order, pharmacyStatus: "submitted" })).toBe(false);
  });
});
