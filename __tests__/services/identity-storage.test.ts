import { buildIdentityUploads } from "@/services/identity-storage";

const originalEnv = process.env;

describe("identity-storage", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("falls back to database media storage when S3 is not configured", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.IDENTITY_STORAGE_PROVIDER;

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.every((upload) => upload.base64Data.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("IDENTITY_STORAGE_PROVIDER is not 's3'"));
    warn.mockRestore();
  });

  it("stores only metadata for S3-backed identity media and keeps base64 only for AI verification", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.IDENTITY_STORAGE_PROVIDER = "s3";
    process.env.IDENTITY_STORAGE_BUCKET = "mission-identity";
    process.env.IDENTITY_STORAGE_REGION = "us-east-1";
    process.env.IDENTITY_STORAGE_ACCESS_KEY_ID = "test-access";
    process.env.IDENTITY_STORAGE_SECRET_ACCESS_KEY = "test-secret";

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    } as Response);
    global.fetch = fetchMock;

    const result = await buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.every((upload) => upload.base64Data === "")).toBe(true);
    expect(result.uploads.every((upload) => upload.storageUrl?.startsWith("s3://mission-identity/"))).toBe(true);
    expect(result.aiUploads.every((upload) => upload.base64Data.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    (global as unknown as { fetch?: unknown }).fetch = undefined;
  });
});
