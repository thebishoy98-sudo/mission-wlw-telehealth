import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";
import { canonicalProducts, normalizeProduct } from "@/data/products";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const patientId = getPatientIdFromRequest(req);
  if (!patientId) {
    return NextResponse.json({ error: "Patient login required" }, { status: 401 });
  }

  const { orderId } = await params;
  const order = await dbServer.orderDb.getById(orderId).catch(() => null);
  if (!order || order.patientId !== patientId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const patient = await dbServer.patientDb.getById(patientId).catch(() => null);
  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const productFromDb = await dbServer.productDb.getById(order.productId).catch(() => null);
  const product = productFromDb ?? canonicalProducts.find((p) => p.id === order.productId) ?? null;
  const answers = await dbServer.answerDb.getByOrder(order.id).catch(() => []);
  const questionnaireAnswers = Object.fromEntries(
    answers.map((answer) => [answer.questionId, answer.answer])
  );

  return NextResponse.json({
    patient,
    order,
    product: product ? normalizeProduct(product) : null,
    questionnaireAnswers,
  });
}
