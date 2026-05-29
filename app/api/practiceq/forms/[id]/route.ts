import { NextResponse } from "next/server";
import { getPracticeQFormDetail } from "@/services/practiceq";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireProviderOrAdmin(req);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const detail = await getPracticeQFormDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    console.error("PracticeQ form detail load error:", error);
    return NextResponse.json({ error: "PracticeQ form detail load failed" }, { status: 500 });
  }
}
