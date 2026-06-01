import { createHash, createHmac, randomUUID } from "crypto";
import type { Upload } from "@/types";
import { dataUrlToFileMetadata } from "@/lib/data-url";
import { generateId } from "@/lib/utils";

type IdentityUploadInput = {
  orderId: string;
  practiceqClientId?: string | number | null;
  idImageData: string;
  selfieFrameData: string;
  identityVideoData?: string | null;
};

type IdentityUploadBuildResult = {
  uploads: Upload[];
  aiUploads: Upload[];
};

type IdentityMediaInput = {
  orderId: string;
  type: Upload["type"];
  filename: string;
  dataUrl: string;
};

type DecodedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

type LoadedIdentityMedia = {
  contentType: string;
  body: Buffer;
};

const MAX_IDENTITY_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/webm", "video/mp4"]);

export async function buildIdentityUploads({
  orderId,
  idImageData,
  selfieFrameData,
  identityVideoData,
}: IdentityUploadInput): Promise<IdentityUploadBuildResult> {
  const now = new Date().toISOString();
  const documentFile = dataUrlToFileMetadata(idImageData, "identity-document");
  const documentUpload = await storeIdentityMedia({
    orderId,
    type: "driver_license",
    filename: documentFile.filename,
    dataUrl: idImageData,
  });
  const videoData = identityVideoData ?? selfieFrameData;
  const selfieFile = dataUrlToFileMetadata(videoData, identityVideoData ? "identity-video" : "identity-frame");
  const selfieUpload = await storeIdentityMedia({
    orderId,
    type: "selfie_video",
    filename: selfieFile.filename,
    dataUrl: videoData,
  });

  const uploads = [
    { ...documentUpload, uploadedAt: now },
    { ...selfieUpload, uploadedAt: now },
  ];

  return {
    uploads,
    aiUploads: [
      { ...uploads[0], base64Data: idImageData },
      { ...uploads[1], mimeType: "image/jpeg", base64Data: selfieFrameData },
    ],
  };
}

export function assertIdentityStorageReady() {
  const provider = getStorageProvider();
  if (provider === "s3") {
    requireEnv("IDENTITY_STORAGE_BUCKET");
    requireEnv("IDENTITY_STORAGE_REGION");
    requireEnv("IDENTITY_STORAGE_ACCESS_KEY_ID");
    requireEnv("IDENTITY_STORAGE_SECRET_ACCESS_KEY");
  }
}

export async function loadIdentityMedia(upload: Upload): Promise<LoadedIdentityMedia | null> {
  if (upload.base64Data) {
    const decoded = decodeDataUrl(upload.base64Data);
    return { contentType: decoded.mimeType, body: decoded.buffer };
  }

  if (!upload.storageUrl && !upload.storageKey) return null;

  const storageUrl = upload.storageUrl;
  const storageKey = upload.storageKey;

  if (storageUrl?.startsWith("practiceq://files/") || storageKey?.startsWith("file_")) {
    return loadPracticeQFile(storageKey ?? storageUrl?.replace("practiceq://files/", "") ?? "");
  }

  if (storageUrl?.startsWith("s3://") || storageKey) {
    return loadS3Object(upload);
  }

  return null;
}

async function storeIdentityMedia(input: IdentityMediaInput): Promise<Upload> {
  const decoded = decodeDataUrl(input.dataUrl);
  const storageProvider = getStorageProvider();

  if (storageProvider === "database" || storageProvider === "practiceq") {
    return {
      id: generateId(),
      orderId: input.orderId,
      type: input.type,
      filename: input.filename,
      fileSize: decoded.buffer.byteLength,
      mimeType: decoded.mimeType,
      storageUrl: storageProvider === "practiceq" ? "practiceq://pending" : undefined,
      base64Data: input.dataUrl,
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
    };
  }

  if (storageProvider !== "s3") {
    throw new Error(`Unsupported IDENTITY_STORAGE_PROVIDER: ${storageProvider}`);
  }

  const { storageUrl, storageKey } = await putS3Object(input, decoded);
  return {
    id: generateId(),
    orderId: input.orderId,
    type: input.type,
    filename: input.filename,
    fileSize: decoded.buffer.byteLength,
    mimeType: decoded.mimeType,
    storageUrl,
    storageKey,
    base64Data: "",
    uploadedAt: new Date().toISOString(),
    status: "uploaded",
  };
}

function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function getStorageProvider(): "database" | "s3" | "practiceq" {
  const provider = process.env.IDENTITY_STORAGE_PROVIDER?.trim().toLowerCase();
  if (!provider) {
    if (isProductionRuntime()) {
      throw new Error("IDENTITY_STORAGE_PROVIDER is required in production before storing identity media");
    }
    return "database";
  }
  if (provider === "database" && isProductionRuntime()) {
    throw new Error("IDENTITY_STORAGE_PROVIDER=database is not allowed in production for identity media");
  }
  if (provider === "database" || provider === "s3" || provider === "practiceq") return provider;
  throw new Error(`Unsupported IDENTITY_STORAGE_PROVIDER: ${provider}`);
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;[^,]*)*;base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new Error("Identity media must be submitted as a base64 data URL");
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported identity media type: ${mimeType}`);
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.byteLength || buffer.byteLength > MAX_IDENTITY_MEDIA_BYTES) {
    throw new Error("Identity media is empty or exceeds the maximum allowed size");
  }

  return { mimeType, buffer };
}

async function putS3Object(input: IdentityMediaInput, decoded: DecodedDataUrl) {
  const bucket = requireEnv("IDENTITY_STORAGE_BUCKET");
  const region = requireEnv("IDENTITY_STORAGE_REGION");
  const accessKeyId = requireEnv("IDENTITY_STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("IDENTITY_STORAGE_SECRET_ACCESS_KEY");
  const endpoint = process.env.IDENTITY_STORAGE_ENDPOINT;
  const forcePathStyle = process.env.IDENTITY_STORAGE_FORCE_PATH_STYLE === "true";
  const key = buildStorageKey(input.orderId, input.type, input.filename);
  const url = buildS3Url({ bucket, region, key, endpoint, forcePathStyle });
  const payloadHash = sha256Hex(decoded.buffer);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers = signS3Put({
    url,
    region,
    accessKeyId,
    secretAccessKey,
    amzDate,
    dateStamp,
    payloadHash,
    contentType: decoded.mimeType,
  });

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: decoded.buffer.buffer.slice(
      decoded.buffer.byteOffset,
      decoded.buffer.byteOffset + decoded.buffer.byteLength
    ) as ArrayBuffer,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Identity media storage failed: S3 returned HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return { storageUrl: `s3://${bucket}/${key}`, storageKey: key };
}

async function loadS3Object(upload: Upload): Promise<LoadedIdentityMedia | null> {
  const bucket = requireEnv("IDENTITY_STORAGE_BUCKET");
  const region = requireEnv("IDENTITY_STORAGE_REGION");
  const accessKeyId = requireEnv("IDENTITY_STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("IDENTITY_STORAGE_SECRET_ACCESS_KEY");
  const endpoint = process.env.IDENTITY_STORAGE_ENDPOINT;
  const forcePathStyle = process.env.IDENTITY_STORAGE_FORCE_PATH_STYLE === "true";
  const key = upload.storageKey ?? upload.storageUrl?.replace(/^s3:\/\/[^/]+\//, "");
  if (!key) return null;

  const url = buildS3Url({ bucket, region, key, endpoint, forcePathStyle });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers = signS3Get({ url, region, accessKeyId, secretAccessKey, amzDate, dateStamp });
  const response = await fetch(url, { headers });
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  return {
    contentType: response.headers.get("content-type") ?? upload.mimeType,
    body: Buffer.from(arrayBuffer),
  };
}

async function loadPracticeQFile(fileId: string): Promise<LoadedIdentityMedia | null> {
  const apiKey = process.env.PRACTICEQ_API_KEY?.trim();
  const baseUrl = process.env.PRACTICEQ_BASE_URL?.trim() || "https://intakeq.com/api/v1";
  if (!apiKey) return null;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/files/${encodeURIComponent(fileId)}`, {
    headers: { "X-Auth-Key": apiKey },
  });
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  return {
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    body: Buffer.from(arrayBuffer),
  };
}

function buildStorageKey(orderId: string, type: Upload["type"], filename: string) {
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `identity/${safeOrderId}/${type}/${Date.now()}-${randomUUID()}-${safeFilename}`;
}

function buildS3Url({
  bucket,
  region,
  key,
  endpoint,
  forcePathStyle,
}: {
  bucket: string;
  region: string;
  key: string;
  endpoint?: string;
  forcePathStyle: boolean;
}) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (endpoint) {
    const base = endpoint.replace(/\/$/, "");
    return forcePathStyle ? `${base}/${bucket}/${encodedKey}` : `${base}/${encodedKey}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function signS3Put({
  url,
  region,
  accessKeyId,
  secretAccessKey,
  amzDate,
  dateStamp,
  payloadHash,
  contentType,
}: {
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
  dateStamp: string;
  payloadHash: string;
  contentType: string;
}) {
  const parsed = new URL(url);
  const canonicalUri = parsed.pathname || "/";
  const canonicalQueryString = "";
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${parsed.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    "Content-Type": contentType,
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function signS3Get({
  url,
  region,
  accessKeyId,
  secretAccessKey,
  amzDate,
  dateStamp,
}: {
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
  dateStamp: string;
}) {
  const parsed = new URL(url);
  const canonicalUri = parsed.pathname || "/";
  const canonicalQueryString = "";
  const canonicalHeaders =
    `host:${parsed.host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    "X-Amz-Date": amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = createHmac("sha256", `AWS4${key}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(regionName).digest();
  const kService = createHmac("sha256", kRegion).update(serviceName).digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}

function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for identity media storage`);
  return value;
}
