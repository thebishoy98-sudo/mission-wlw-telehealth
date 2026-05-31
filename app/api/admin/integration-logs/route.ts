import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { getSpruceReadiness } from "@/lib/integration-readiness";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const serverLogs = await dbServer.integrationLogDb.getAll().catch(() => []);
  const localLogs = db.integrationLogDb.getAll();

  return NextResponse.json({
    logs: serverLogs.length ? serverLogs : localLogs,
    integrations: {
      spruce: getSpruceReadiness(),
    },
  });
}
