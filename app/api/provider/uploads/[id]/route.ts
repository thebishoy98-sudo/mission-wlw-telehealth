import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { loadIdentityMedia } from "@/services/identity-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  const upload = await dbServer.uploadDb.getById(params.id).catch(() => null);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const media = await loadIdentityMedia(upload).catch(() => null);
  if (!media) {
    return NextResponse.json({ error: "Upload media is not available" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(media.body), {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
