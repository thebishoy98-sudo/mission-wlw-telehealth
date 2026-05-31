import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";

export async function GET(req: Request) {
  const patientId = getPatientIdFromRequest(req);
  if (!patientId) {
    return NextResponse.json({ error: "Patient login required" }, { status: 401 });
  }

  const patient = await dbServer.patientDb.getById(patientId).catch(() => null);
  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const orders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
  const products = await Promise.all(
    Array.from(new Set(orders.map((order) => order.productId))).map((productId) =>
      dbServer.productDb.getById(productId).catch(() => null)
    )
  );

  return NextResponse.json({
    patient,
    orders,
    products: products.filter(Boolean),
  });
}
