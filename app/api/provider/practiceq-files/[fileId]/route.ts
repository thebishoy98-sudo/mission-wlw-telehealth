import { NextRequest, NextResponse } from "next/server";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { downloadPracticeQFile } from "@/services/practiceq";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  const { fileId } = await params;
  const file = await downloadPracticeQFile(fileId).catch(() => null);
  if (!file) {
    return NextResponse.json({ error: "Clinical file not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
