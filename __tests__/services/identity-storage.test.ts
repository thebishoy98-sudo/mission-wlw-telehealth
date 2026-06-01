import { buildIdentityUploads, loadIdentityMedia } from "@/services/identity-storage";

const originalEnv = process.env;

describe("identity-storage", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    (global as unknown as { fetch?: unknown }).fetch = undefined;
    jest.restoreAllMocks();
  });

  function configureS3Storage() {
    process.env.VERCEL_ENV = "production";
    process.env.IDENTITY_STORAGE_PROVIDER = "s3";
    process.env.IDENTITY_STORAGE_BUCKET = "mission-identity";
    process.env.IDENTITY_STORAGE_REGION = "us-east-1";
    process.env.IDENTITY_STORAGE_ACCESS_KEY_ID = "access-key";
    process.env.IDENTITY_STORAGE_SECRET_ACCESS_KEY = "secret-key";
    process.env.IDENTITY_STORAGE_ENDPOINT = "https://storage.test";
    process.env.IDENTITY_STORAGE_FORCE_PATH_STYLE = "true";
  }

  function configurePracticeQStorage() {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.IDENTITY_STORAGE_PROVIDER = "practiceq";
  }

  it("rejects production identity media storage when no storage provider is configured", async () => {
    process.env.VERCEL_ENV = "production";

    await expect(buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
    })).rejects.toThrow("IDENTITY_STORAGE_PROVIDER is required");
  });

  it("rejects Render/Node production identity media storage when no storage provider is configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;

    await expect(buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
    })).rejects.toThrow("IDENTITY_STORAGE_PROVIDER is required");
  });

  it("uploads identity media to S3 in production and stores only object references locally", async () => {
    configureS3Storage();

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Id: "file_license" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Id: "file_video" }),
      } as Response);
    global.fetch = fetchMock;

    const result = await buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
      identityVideoData: "data:video/webm;base64,aGVsbG8=",
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.every((upload) => upload.base64Data === "")).toBe(true);
    expect(result.uploads.every((upload) => upload.storageUrl?.startsWith("s3://mission-identity/identity/order_1/"))).toBe(true);
    expect(result.uploads.every((upload) => upload.storageKey?.startsWith("identity/order_1/"))).toBe(true);
    expect(result.aiUploads.every((upload) => upload.base64Data.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(result.aiUploads[1].base64Data).toBe("data:image/jpeg;base64,aGVsbG8=");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("https://storage.test/mission-identity/identity/order_1/driver_license/");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "PUT" }));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toContain("AWS4-HMAC-SHA256");
  });

  it("stages identity media in Render database when PracticeQ is the configured PHI source of truth", async () => {
    configurePracticeQStorage();

    const result = await buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
      identityVideoData: "data:video/webm;base64,aGVsbG8=",
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.every((upload) => upload.storageUrl === "practiceq://pending")).toBe(true);
    expect(result.uploads.every((upload) => upload.base64Data.startsWith("data:"))).toBe(true);
    expect(result.aiUploads.every((upload) => upload.base64Data.startsWith("data:image/jpeg;base64,"))).toBe(true);
  });

  it("accepts browser video data URLs that include codec parameters", async () => {
    configureS3Storage();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Id: "file_license" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Id: "file_video" }),
      } as Response);

    const result = await buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
      identityVideoData: "data:video/webm;codecs=vp8;base64,aGVsbG8=",
    });

    expect(result.uploads[1].mimeType).toBe("video/webm");
    expect(result.uploads[1].storageUrl).toMatch(/^s3:\/\/mission-identity\/identity\/order_1\/selfie_video\//);
  });

  it("loads S3-backed identity media through signed object storage reads", async () => {
    configureS3Storage();
    const bytes = Buffer.from("hello");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as Response);
    global.fetch = fetchMock;

    const media = await loadIdentityMedia({
      id: "upload_1",
      orderId: "order_1",
      type: "driver_license",
      filename: "identity-document.jpg",
      fileSize: 5,
      mimeType: "image/jpeg",
      storageUrl: "s3://mission-identity/identity/order_1/driver_license/file_license.jpg",
      storageKey: "identity/order_1/driver_license/file_license.jpg",
      base64Data: "",
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
    });

    expect(media?.contentType).toBe("image/jpeg");
    expect(media?.body.toString("utf8")).toBe("hello");
    expect(fetchMock.mock.calls[0][0]).toBe("https://storage.test/mission-identity/identity/order_1/driver_license/file_license.jpg");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toContain("AWS4-HMAC-SHA256");
  });

  it("retries transient PracticeQ file download misses before reporting media unavailable", async () => {
    configurePracticeQStorage();
    process.env.PRACTICEQ_API_KEY = "pq-key";
    process.env.PRACTICEQ_BASE_URL = "https://practiceq.test/api/v1";
    const bytes = Buffer.from("video");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "video/mp4" }),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      } as Response);
    global.fetch = fetchMock;

    const media = await loadIdentityMedia({
      id: "upload_1",
      orderId: "order_1",
      type: "selfie_video",
      filename: "identity-video.mp4",
      fileSize: 5,
      mimeType: "video/mp4",
      storageUrl: "practiceq://files/file_video",
      storageKey: "file_video",
      base64Data: "",
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
    });

    expect(media?.contentType).toBe("video/mp4");
    expect(media?.body.toString("utf8")).toBe("video");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
