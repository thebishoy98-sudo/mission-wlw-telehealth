export type DataUrlMetadata = {
  mimeType: string;
  extension: string;
  filename: string;
  base64: string;
};

export type DataUrlFileParts = DataUrlMetadata & {
  buffer: Buffer;
};

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/json": "json",
};

export function extensionForMime(mimeType: string) {
  return MIME_EXTENSIONS[mimeType.toLowerCase()] ?? "bin";
}

export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;[^,]*)*;base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) throw new Error("Expected a base64 data URL");
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2].replace(/\s/g, ""),
  };
}

export function dataUrlToFileMetadata(dataUrl: string, basename: string): DataUrlMetadata {
  const parsed = parseDataUrl(dataUrl);
  const extension = extensionForMime(parsed.mimeType);
  return {
    mimeType: parsed.mimeType,
    extension,
    filename: `${basename}.${extension}`,
    base64: parsed.base64,
  };
}

export function dataUrlToFileParts(dataUrl: string, basename: string): DataUrlFileParts {
  const metadata = dataUrlToFileMetadata(dataUrl, basename);
  return {
    ...metadata,
    buffer: Buffer.from(metadata.base64, "base64"),
  };
}
