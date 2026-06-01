import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { loadIdentityMedia } from "@/services/identity-storage";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  const { id: uploadId } = await params;

  const upload =
    (await dbServer.uploadDb.getById(uploadId).catch(() => null)) ??
    db.uploadDb.getById(uploadId);

  if (!upload) {
    return new NextResponse("Upload not found", { status: 404 });
  }

  const media = await loadIdentityMedia(upload);
  if (media) {
    const body = media.body.buffer.slice(
      media.body.byteOffset,
      media.body.byteOffset + media.body.byteLength
    ) as ArrayBuffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        "Content-Length": String(media.body.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new NextResponse("Upload media not available", { status: 404 });
}
