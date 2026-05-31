import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";

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

  const product = await dbServer.productDb.getById(order.productId).catch(() => null);
  const answers = await dbServer.answerDb.getByOrder(order.id).catch(() => []);
  const questionnaireAnswers = Object.fromEntries(
    answers.map((answer) => [answer.questionId, answer.answer])
  );

  return NextResponse.json({
    patient,
    order,
    product,
    questionnaireAnswers,
  });
}
