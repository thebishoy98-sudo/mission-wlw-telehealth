import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/server-auth";
import { getIntakeSummaryFeed } from "@/services/practiceq";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest | Request) {
  const nextReq = req instanceof NextRequest ? req : new NextRequest(req);
  const denied = requireProvider(nextReq);
  if (denied) {
    return NextResponse.json({ error: "Provider authorization required" }, { status: 401 });
  }

  const { searchParams } = nextReq.nextUrl;
  const feed = await getIntakeSummaryFeed({
    page: Number(searchParams.get("page") ?? "1") || 1,
    client: searchParams.get("client") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    updatedSince: searchParams.get("updatedSince") ?? undefined,
  });

  return NextResponse.json(feed);
}
