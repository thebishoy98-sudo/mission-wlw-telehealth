import {
  buildIdentityUploadUrl,
  createIdentityUploadToken,
  getIdentityGate,
  hasRequiredIdentityUploads,
} from "@/lib/identity";
import type { Upload } from "@/types";

describe("identity helpers", () => {
  it("creates opaque upload tokens", () => {
    expect(createIdentityUploadToken("o1")).toMatch(/^idv_o1_/);
  });

  it("builds upload URLs", () => {
    expect(buildIdentityUploadUrl("https://example.com/", "idv_123")).toBe(
      "https://example.com/verify-identity/idv_123"
    );
  });

  it("blocks dispatch when identity is missing", () => {
    expect(getIdentityGate({ identityStatus: "missing" })).toEqual({
      canDispatch: false,
      blockedReason: "identity_not_verified",
    });
  });

  it("allows dispatch when identity is verified", () => {
    expect(getIdentityGate({ identityStatus: "verified" }).canDispatch).toBe(true);
    expect(getIdentityGate({ identityStatus: "manual_approved" }).canDispatch).toBe(true);
  });

  it("requires ID and selfie video uploads", () => {
    const baseUpload = {
      id: "u",
      orderId: "o",
      filename: "file",
      fileSize: 1,
      mimeType: "image/png",
      base64Data: "data",
      uploadedAt: new Date().toISOString(),
      status: "uploaded" as const,
    };
    const uploads = [
      { ...baseUpload, id: "id", type: "driver_license" as const },
      { ...baseUpload, id: "video", type: "selfie_video" as const, mimeType: "video/mp4" },
    ] satisfies Upload[];

    expect(hasRequiredIdentityUploads(uploads)).toBe(true);
    expect(hasRequiredIdentityUploads(uploads.slice(0, 1))).toBe(false);
  });
});
