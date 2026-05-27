import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const uploadId = params.id;

  const upload =
    (await dbServer.uploadDb.getById(uploadId).catch(() => null)) ??
    db.uploadDb.getById(uploadId);

  if (!upload) {
    return new NextResponse("Upload not found", { status: 404 });
  }

  if (upload.base64Data) {
    // base64Data is stored as a full data URL: "data:<mime>;base64,<data>"
    const match = upload.base64Data.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  if (upload.storageUrl) {
    // S3 or external storage — redirect to the storage URL
    return NextResponse.redirect(upload.storageUrl);
  }

  return new NextResponse("Upload media not available", { status: 404 });
}
