import { getIdentityReviewUpdate } from "@/lib/identity";

describe("identity review updates", () => {
  it("marks provider approval as manual approved", () => {
    const update = getIdentityReviewUpdate({
      action: "approve",
      reviewedBy: "Dr. Provider",
      notes: "ID matches patient",
      now: "2026-05-23T12:00:00.000Z",
    });

    expect(update).toMatchObject({
      identityStatus: "manual_approved",
      identityReason: "ID matches patient",
      identityReviewedBy: "Dr. Provider",
      identityReviewedAt: "2026-05-23T12:00:00.000Z",
    });
  });

  it("marks provider denial as rejected", () => {
    const update = getIdentityReviewUpdate({
      action: "deny",
      reviewedBy: "Dr. Provider",
      notes: "ID does not match selfie",
      now: "2026-05-23T12:00:00.000Z",
    });

    expect(update).toMatchObject({
      identityStatus: "rejected",
      identityReason: "ID does not match selfie",
      identityReviewedBy: "Dr. Provider",
      identityReviewedAt: "2026-05-23T12:00:00.000Z",
    });
  });
});
