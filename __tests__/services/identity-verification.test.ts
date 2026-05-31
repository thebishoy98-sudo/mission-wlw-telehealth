import { normalizeIdentityAiResult, verifyIdentityUploads } from "@/services/identity-verification";

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
    expect(result.summary).toMatch(/name and DOB match/i);
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

describe("verifyIdentityUploads", () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalSandboxAutoVerify = process.env.IDENTITY_SANDBOX_AUTO_VERIFY;
  const originalPaymentBypass = process.env.BYPASS_QB_PAYMENTS;
  const originalPaymentEnvironment = process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT;

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    process.env.IDENTITY_SANDBOX_AUTO_VERIFY = originalSandboxAutoVerify;
    process.env.BYPASS_QB_PAYMENTS = originalPaymentBypass;
    process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT = originalPaymentEnvironment;
  });

  it("auto-verifies complete identity uploads when sandbox auto-verify is enabled", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.IDENTITY_SANDBOX_AUTO_VERIFY = "true";
    process.env.BYPASS_QB_PAYMENTS = "true";
    const media = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

    const result = await verifyIdentityUploads([
      {
        id: "upload_id",
        orderId: "order_1",
        type: "driver_license",
        filename: "id.jpg",
        fileSize: 10,
        mimeType: "image/jpeg",
        base64Data: media,
        uploadedAt: "2026-05-31T00:00:00.000Z",
        status: "uploaded",
      },
      {
        id: "upload_video",
        orderId: "order_1",
        type: "selfie_video",
        filename: "selfie.jpg",
        fileSize: 10,
        mimeType: "image/jpeg",
        base64Data: media,
        uploadedAt: "2026-05-31T00:00:00.000Z",
        status: "uploaded",
      },
    ], { patientName: "Test Patient", dateOfBirth: "1990-01-01" });

    expect(result.status).toBe("verified");
    expect(result.flags).toContain("sandbox_auto_verified");
  });

  it("does not auto-verify when the sandbox payment guard is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.BYPASS_QB_PAYMENTS;
    delete process.env.NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT;
    process.env.IDENTITY_SANDBOX_AUTO_VERIFY = "true";
    const media = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

    const result = await verifyIdentityUploads([
      {
        id: "upload_id",
        orderId: "order_1",
        type: "driver_license",
        filename: "id.jpg",
        fileSize: 10,
        mimeType: "image/jpeg",
        base64Data: media,
        uploadedAt: "2026-05-31T00:00:00.000Z",
        status: "uploaded",
      },
      {
        id: "upload_video",
        orderId: "order_1",
        type: "selfie_video",
        filename: "selfie.jpg",
        fileSize: 10,
        mimeType: "image/jpeg",
        base64Data: media,
        uploadedAt: "2026-05-31T00:00:00.000Z",
        status: "uploaded",
      },
    ]);

    expect(result.status).toBe("needs_review");
    expect(result.flags).toContain("anthropic_not_configured");
  });
});
