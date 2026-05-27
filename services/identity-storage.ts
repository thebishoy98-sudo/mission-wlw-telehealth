import { createHash, createHmac, randomUUID } from "crypto";
import type { Upload } from "@/types";
import { generateId } from "@/lib/utils";
import { downloadPracticeQFile, uploadPracticeQClientFile } from "@/services/practiceq";
import { serviceConfig } from "@/lib/service-config";

type IdentityUploadInput = {
  orderId: string;
  practiceqClientId?: string | null;
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
  practiceqClientId?: string | null;
  type: Upload["type"];
  filename: string;
  dataUrl: string;
};

type DecodedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

const MAX_IDENTITY_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/webm", "video/mp4"]);

export async function buildIdentityUploads({
  orderId,
  practiceqClientId,
  idImageData,
  selfieFrameData,
  identityVideoData,
}: IdentityUploadInput): Promise<IdentityUploadBuildResult> {
  const now = new Date().toISOString();
  const documentUpload = await storeIdentityMedia({
    orderId,
    practiceqClientId,
    type: "driver_license",
    filename: "identity-document.jpg",
    dataUrl: idImageData,
  });
  const videoData = identityVideoData ?? selfieFrameData;
  const selfieUpload = await storeIdentityMedia({
    orderId,
    practiceqClientId,
    type: "selfie_video",
    filename: identityVideoData ? "identity-video.webm" : "identity-frame.jpg",
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
  if (provider === "practiceq" && !serviceConfig.practiceq.apiKey) {
    throw new Error("PRACTICEQ_API_KEY is required for identity media storage");
  }
  if (provider === "s3") {
    requireEnv("IDENTITY_STORAGE_BUCKET");
    requireEnv("IDENTITY_STORAGE_REGION");
    requireEnv("IDENTITY_STORAGE_ACCESS_KEY_ID");
    requireEnv("IDENTITY_STORAGE_SECRET_ACCESS_KEY");
  }
}

export async function loadIdentityMedia(upload: Upload): Promise<{ body: Buffer; contentType: string } | null> {
  if (upload.base64Data) {
    const decoded = decodeDataUrl(upload.base64Data);
    return { body: decoded.buffer, contentType: decoded.mimeType };
  }

  const practiceQFileId = parsePracticeQFileId(upload);
  if (practiceQFileId) {
    return downloadPracticeQFile(practiceQFileId);
  }

  if (!upload.storageUrl?.startsWith("s3://")) return null;

  const { bucket, key } = parseS3StorageUrl(upload.storageUrl);
  const region = requireEnv("IDENTITY_STORAGE_REGION");
  const accessKeyId = requireEnv("IDENTITY_STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("IDENTITY_STORAGE_SECRET_ACCESS_KEY");
  const endpoint = process.env.IDENTITY_STORAGE_ENDPOINT;
  const forcePathStyle = process.env.IDENTITY_STORAGE_FORCE_PATH_STYLE === "true";
  const url = buildS3Url({ bucket, region, key, endpoint, forcePathStyle });
  const headers = signS3Get({
    url,
    region,
    accessKeyId,
    secretAccessKey,
    amzDate: new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""),
  });
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return { body: Buffer.from(arrayBuffer), contentType: upload.mimeType };
}

async function storeIdentityMedia(input: IdentityMediaInput): Promise<Upload> {
  const decoded = decodeDataUrl(input.dataUrl);
  const storageProvider = getStorageProvider();

  if (storageProvider === "database") {
    return {
      id: generateId(),
      orderId: input.orderId,
      type: input.type,
      filename: input.filename,
      fileSize: decoded.buffer.byteLength,
      mimeType: decoded.mimeType,
      base64Data: input.dataUrl,
      uploadedAt: new Date().toISOString(),
      status: "uploaded",
    };
  }

  if (storageProvider === "practiceq") {
    if (!input.practiceqClientId) {
      throw new Error("PracticeQ client id is required for identity media storage");
    }
    const file = await uploadPracticeQClientFile(input.practiceqClientId, {
      filename: input.filename,
      mimeType: decoded.mimeType,
      buffer: decoded.buffer,
    });
    return {
      id: generateId(),
      orderId: input.orderId,
      type: input.type,
      filename: input.filename,
      fileSize: decoded.buffer.byteLength,
      mimeType: decoded.mimeType,
      storageUrl: `practiceq://files/${file.id}`,
      storageKey: file.id,
      base64Data: "",
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

// Vercel sets NODE_ENV=production on ALL deployments (including dev/preview branches).
// Use VERCEL_ENV to distinguish actual production from dev/preview deployments.
function isVercelProduction() {
  return process.env.VERCEL_ENV === "production";
}

function getStorageProvider(): "database" | "practiceq" | "s3" {
  const provider = process.env.IDENTITY_STORAGE_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === "database") {
    if (isVercelProduction()) return "practiceq";
    return "database";
  }
  if (provider === "practiceq") return "practiceq";
  if (provider === "s3") return "s3";
  throw new Error(`Unsupported IDENTITY_STORAGE_PROVIDER: ${provider}`);
}

function parsePracticeQFileId(upload: Upload): string | null {
  const fromUrl = upload.storageUrl?.match(/^practiceq:\/\/files\/(.+)$/)?.[1];
  if (fromUrl) return fromUrl;
  if (upload.storageUrl === "practiceq://files" && upload.storageKey) return upload.storageKey;
  return null;
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;(?!base64,)[^,;]+)*;base64,([a-zA-Z0-9+/=\r\n]+)$/);
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

function buildStorageKey(orderId: string, type: Upload["type"], filename: string) {
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `identity/${safeOrderId}/${type}/${Date.now()}-${randomUUID()}-${safeFilename}`;
}

function parseS3StorageUrl(storageUrl: string) {
  const match = storageUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error("Invalid S3 identity storage URL");
  return { bucket: match[1], key: match[2] };
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
}: {
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
}) {
  const parsed = new URL(url);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");
  const canonicalHeaders =
    `host:${parsed.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "GET",
    parsed.pathname || "/",
    "",
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
    "X-Amz-Content-Sha256": payloadHash,
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
