import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
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
      spruce: {
        liveSending: process.env.USE_REAL_SPRUCE === "true",
        configured: Boolean(
          process.env.SPRUCE_AUTH_TOKEN ||
          (process.env.SPRUCE_ACCESS_ID && process.env.SPRUCE_API_KEY)
        ),
        hasPhoneEndpoint: Boolean(process.env.SPRUCE_INTERNAL_ENDPOINT_ID),
        webhookPath: "/api/webhooks/spruce",
      },
    },
  });
}
