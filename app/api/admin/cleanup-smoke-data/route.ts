import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "delete-smoke-test-data") {
    return NextResponse.json({ error: "Confirmation is required." }, { status: 400 });
  }

  const deleted = await dbServer.adminMaintenanceDb.deleteSmokeTestData();
  return NextResponse.json({ success: true, deleted });
}
