import { normalizeIdentityAiResult } from "@/services/identity-verification";

describe("normalizeIdentityAiResult", () => {
  it("downgrades subjective face mismatch rejections when demographics match", () => {
    const result = normalizeIdentityAiResult({
      status: "rejected",
      confidence: 0.88,
      summary:
        "The ID face and video face appear to be different people; name and DOB on the ID match the expected order.",
      flags: ["face_mismatch", "document_capture_irregular"],
      checkedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(result.status).toBe("needs_review");
    expect(result.confidence).toBeLessThanOrEqual(0.64);
    expect(result.summary).toContain("name and DOB match");
    expect(result.flags).toContain("facial_match_uncertain");
    expect(result.flags).not.toContain("face_mismatch");
  });

  it("preserves hard different-person rejections", () => {
    const result = normalizeIdentityAiResult({
      status: "rejected",
      confidence: 0.92,
      summary: "The submitted identity belongs to a different person.",
      flags: ["different_person"],
      checkedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(result.status).toBe("rejected");
    expect(result.flags).toContain("different_person");
  });
});
