import { NextResponse } from "next/server";
import { getIntakeSummaryFeed } from "@/services/practiceq";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function readOptions(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  return {
    page,
    client: url.searchParams.get("client") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    updatedSince: url.searchParams.get("updatedSince") ?? undefined,
  };
}

export async function GET(req: Request) {
  try {
    const unauthorized = requireProviderOrAdmin(req);
    if (unauthorized) return unauthorized;

    const feed = await getIntakeSummaryFeed(readOptions(req));
    return NextResponse.json(feed);
  } catch (error) {
    console.error("PracticeQ forms feed load error:", error);
    return NextResponse.json({ error: "PracticeQ forms feed load failed" }, { status: 500 });
  }
}
