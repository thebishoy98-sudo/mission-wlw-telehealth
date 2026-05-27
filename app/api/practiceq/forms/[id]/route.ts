import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/server-auth";
import { getPracticeQFormDetail } from "@/services/practiceq";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest | Request,
  { params }: { params: { id: string } }
) {
  const nextReq = req instanceof NextRequest ? req : new NextRequest(req);
  const denied = requireProvider(nextReq);
  if (denied) {
    return NextResponse.json({ error: "Provider authorization required" }, { status: 401 });
  }

  const detail = await getPracticeQFormDetail(params.id);
  return NextResponse.json(detail);
}
