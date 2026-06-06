import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import { canonicalProducts } from "@/data/products";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const allOrders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const activeOrders = allOrders.filter(
      (o) => o.status !== "draft" && o.status !== "cancelled"
    );

    const now = new Date();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const uniquePatients = (orders: typeof activeOrders) =>
      new Set(orders.map((o) => o.patientId)).size;

    const totals = {
      allTime: uniquePatients(activeOrders),
      week7: uniquePatients(
        activeOrders.filter((o) => new Date(o.createdAt).getTime() >= now.getTime() - ms7d)
      ),
      month30: uniquePatients(
        activeOrders.filter((o) => new Date(o.createdAt).getTime() >= now.getTime() - ms30d)
      ),
      ytd: uniquePatients(
        activeOrders.filter((o) => new Date(o.createdAt) >= yearStart)
      ),
    };

    // Build last-12-month keys
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const monthlyMap: Record<string, { orders: number; patients: Set<string>; revenue: number }> =
      {};
    for (const key of monthKeys) {
      monthlyMap[key] = { orders: 0, patients: new Set(), revenue: 0 };
    }

    const allPayments = await dbServer.paymentDb
      .getByOrders(activeOrders.map((o) => o.id))
      .catch(() => []);
    const paymentByOrder = new Map(allPayments.map((p) => [p.orderId, p] as [string, typeof p]));

    for (const order of activeOrders) {
      const d = new Date(order.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key]) {
        monthlyMap[key].orders++;
        monthlyMap[key].patients.add(order.patientId);
        const payment = paymentByOrder.get(order.id);
        if (payment?.status === "completed") {
          monthlyMap[key].revenue += Number(payment.amount) || 0;
        }
      }
    }

    // Product mix — use canonical names
    const productMix: Record<string, { count: number; name: string }> = {};
    for (const order of activeOrders) {
      const id = order.productId ?? "unknown";
      if (!productMix[id]) {
        const canonical = canonicalProducts.find((p) => p.id === id);
        productMix[id] = { count: 0, name: canonical?.name ?? id };
      }
      productMix[id].count++;
    }

    return NextResponse.json({
      totals,
      monthly: monthKeys.map((key) => {
        const [year, month] = key.split("-");
        const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        return {
          key,
          label,
          orders: monthlyMap[key].orders,
          patients: monthlyMap[key].patients.size,
          revenue: monthlyMap[key].revenue,
        };
      }),
      productMix: Object.values(productMix).sort((a, b) => b.count - a.count),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
