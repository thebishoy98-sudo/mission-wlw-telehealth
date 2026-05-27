import { buildIdentityUploads, loadIdentityMedia } from "@/services/identity-storage";
import { serviceConfig } from "@/lib/service-config";

const originalEnv = process.env;
const originalConfig = { ...serviceConfig.practiceq };

describe("identity-storage", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    Object.assign(serviceConfig.practiceq, originalConfig);
  });

  afterAll(() => {
    process.env = originalEnv;
    Object.assign(serviceConfig.practiceq, originalConfig);
  });

  afterEach(() => {
    (global as unknown as { fetch?: unknown }).fetch = undefined;
    jest.restoreAllMocks();
  });

  it("rejects PracticeQ media storage in production when no PracticeQ client is linked", async () => {
    process.env.VERCEL_ENV = "production";
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";

    await expect(buildIdentityUploads({
      orderId: "order_1",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
    })).rejects.toThrow("PracticeQ client id is required");
  });

  it("uploads identity media to PracticeQ in production and stores only file references locally", async () => {
    process.env.VERCEL_ENV = "production";
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";

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
      practiceqClientId: "12345",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
      identityVideoData: "data:video/webm;base64,aGVsbG8=",
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.uploads.every((upload) => upload.base64Data === "")).toBe(true);
    expect(result.uploads.map((upload) => upload.storageUrl)).toEqual([
      "practiceq://files/file_license",
      "practiceq://files/file_video",
    ]);
    expect(result.uploads.map((upload) => upload.storageKey)).toEqual(["file_license", "file_video"]);
    expect(result.aiUploads.every((upload) => upload.base64Data.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(result.aiUploads[1].base64Data).toBe("data:image/jpeg;base64,aGVsbG8=");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://intakeq.com/api/v1/files/12345",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Auth-Key": "test-api-key" },
      })
    );
  });

  it("accepts browser video data URLs that include codec parameters", async () => {
    process.env.VERCEL_ENV = "production";
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";

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
      practiceqClientId: "12345",
      idImageData: "data:image/jpeg;base64,aGVsbG8=",
      selfieFrameData: "data:image/jpeg;base64,aGVsbG8=",
      identityVideoData: "data:video/webm;codecs=vp8;base64,aGVsbG8=",
    });

    expect(result.uploads[1].mimeType).toBe("video/webm");
    expect(result.uploads[1].storageUrl).toBe("practiceq://files/file_video");
  });

  it("loads PracticeQ-backed identity media through the Files API", async () => {
    serviceConfig.practiceq.apiKey = "test-api-key";
    serviceConfig.practiceq.baseUrl = "https://intakeq.com/api/v1";
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
      storageUrl: "practiceq://files/file_license",
      storageKey: "file_license",
      base64Data: "",
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
    });

    expect(media?.contentType).toBe("image/jpeg");
    expect(media?.body.toString("utf8")).toBe("hello");
    expect(fetchMock).toHaveBeenCalledWith("https://intakeq.com/api/v1/files/file_license", {
      headers: { "X-Auth-Key": "test-api-key" },
    });
  });
});
