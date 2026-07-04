import { getReorderReviewGate, getReorderReviewUpdate } from "@/lib/reorder-review";

describe("reorder-review gate", () => {
  it("passes when there is no review status or when approved", () => {
    expect(getReorderReviewGate({}).canDispatch).toBe(true);
    expect(getReorderReviewGate({ reorderReviewStatus: "approved" }).canDispatch).toBe(true);
  });

  it("blocks dispatch while flagged or rejected", () => {
    expect(getReorderReviewGate({ reorderReviewStatus: "flagged" })).toEqual({
      canDispatch: false,
      blockedReason: "reorder_too_soon",
    });
    expect(getReorderReviewGate({ reorderReviewStatus: "rejected" }).canDispatch).toBe(false);
  });

  it("builds approve/reject review updates", () => {
    const approved = getReorderReviewUpdate({ action: "approve", reviewedBy: "admin", now: "t" });
    expect(approved).toMatchObject({ reorderReviewStatus: "approved", reorderReviewedAt: "t", reorderReviewedBy: "admin" });
    const rejected = getReorderReviewUpdate({ action: "reject", reviewedBy: "admin", now: "t" });
    expect(rejected.reorderReviewStatus).toBe("rejected");
  });
});
