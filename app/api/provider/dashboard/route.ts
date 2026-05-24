import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const reviews = await dbServer.providerReviewDb.getAll().catch(() => db.providerReviewDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());
    const patients = await Promise.all(
      Array.from(new Set(orders.map((order) => order.patientId))).map(async (patientId) =>
        (await dbServer.patientDb.getById(patientId).catch(() => null)) ?? db.patientDb.getById(patientId)
      )
    );

    return NextResponse.json({
      orders,
      patients: patients.filter(Boolean),
      products,
      reviews,
    });
  } catch (error) {
    console.error("Provider dashboard load error:", error);
    return NextResponse.json({ error: "Provider dashboard load failed" }, { status: 500 });
  }
}
