import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import { buildAdminAnalytics } from "@/lib/admin-dashboard-metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const allOrders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const activeOrders = allOrders.filter((o) => o.status !== "draft" && o.status !== "cancelled");
    const allPayments = await dbServer.paymentDb
      .getByOrders(activeOrders.map((o) => o.id))
      .catch(() => []);

    return NextResponse.json(buildAdminAnalytics({ orders: allOrders, payments: allPayments }));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
