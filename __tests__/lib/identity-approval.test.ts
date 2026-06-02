import type { Order, ProviderReview } from "@/types";
import {
  buildIdentityUploadOrderUpdate,
  buildIdentityUploadReviewUpdate,
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

  it("retries PracticeQ only after identity is verified", () => {
    const verifiedOrder = { ...order, identityStatus: "verified" as const };

    expect(shouldRetryPracticeQCompletionAfterIdentityApproval(order)).toBe(false);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval(verifiedOrder)).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...verifiedOrder, practiceQStatus: "submitted" })).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...verifiedOrder, practiceQStatus: "error" })).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...verifiedOrder, practiceQStatus: "pending" })).toBe(true);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({ ...verifiedOrder, pharmacyStatus: "submitted" })).toBe(false);
  });

  it("does not resume PracticeQ for an admin manual approval without verified identity", () => {
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({
      ...order,
      identityStatus: "manual_approved",
    })).toBe(false);
    expect(shouldRetryPracticeQCompletionAfterIdentityApproval({
      ...order,
      identityStatus: "missing",
    })).toBe(false);
  });

  it("approves a pending order when delayed identity upload is AI verified", () => {
    const result = {
      status: "verified" as const,
      confidence: 0.91,
      summary: "Face and demographics match.",
      flags: [],
      checkedAt: now,
    };

    expect(buildIdentityUploadOrderUpdate(order, { identityStatus: "verified", result, now })).toEqual({
      identityStatus: "verified",
      identityReason: "Face and demographics match.",
      identityAiResult: result,
      identityReviewedAt: now,
      identityReviewedBy: "anthropic-ai",
      status: "approved",
      approvedAt: now,
    });
    expect(buildIdentityUploadReviewUpdate(review, { identityStatus: "verified", result, now })).toMatchObject({
      status: "approved",
      reviewedBy: "anthropic-ai",
      identityReviewRequired: false,
    });
  });

  it("keeps delayed identity uploads on manual review when AI is uncertain", () => {
    const result = {
      status: "needs_review" as const,
      confidence: 0.45,
      summary: "Face comparison is uncertain.",
      flags: ["facial_match_uncertain"],
      checkedAt: now,
    };

    expect(buildIdentityUploadOrderUpdate(order, { identityStatus: "needs_review", result, now })).toEqual({
      identityStatus: "needs_review",
      identityReason: "Face comparison is uncertain.",
      identityAiResult: result,
      identityReviewedAt: now,
      identityReviewedBy: undefined,
    });
    expect(buildIdentityUploadReviewUpdate(review, { identityStatus: "needs_review", result, now })).toMatchObject({
      status: "needs_more_info",
      identityReviewRequired: true,
    });
  });
});
