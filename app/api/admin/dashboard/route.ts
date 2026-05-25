import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());

    const patients = await Promise.all(
      Array.from(new Set(orders.map((order) => order.patientId))).map(async (patientId) =>
        (await dbServer.patientDb.getById(patientId).catch(() => null)) ?? db.patientDb.getById(patientId)
      )
    );

    const payments = await Promise.all(
      orders.map(async (order) =>
        (await dbServer.paymentDb.getByOrder(order.id).catch(() => null)) ?? db.paymentDb.getByOrder(order.id)
      )
    );

    const pharmacyOrders = await Promise.all(
      orders.map(async (order) =>
        (await dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null)) ?? db.pharmacyOrderDb.getByOrder(order.id)
      )
    );

    return NextResponse.json({
      orders,
      patients: patients.filter(Boolean),
      products,
      payments: payments.filter(Boolean),
      pharmacyOrders: pharmacyOrders.filter(Boolean),
    });
  } catch (error) {
    console.error("Admin dashboard load error:", error);
    return NextResponse.json({ error: "Admin dashboard load failed" }, { status: 500 });
  }
}
