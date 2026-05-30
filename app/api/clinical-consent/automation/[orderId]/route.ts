import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";

const RETRYABLE_FAILED_ATTEMPTS = 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const patientId = new URL(request.url).searchParams.get("patientId")?.trim();
  if (!patientId) return NextResponse.json({ available: false });

  const order = await dbServer.orderDb.getById(orderId).catch(() => null);
  if (!order || order.patientId !== patientId) {
    return NextResponse.json({ available: false });
  }

  const job = await dbServer.practiceqAutomationJobDb.getByOrder(orderId).catch(() => null);
  if (!job) return NextResponse.json({ available: false });

  const retryableFailure = job.status === "failed" && !job.intakeId && job.attempts < RETRYABLE_FAILED_ATTEMPTS;
  const status = retryableFailure ? "running" : job.status;

  return NextResponse.json({
    available: true,
    status,
    handoffUrl: status === "awaiting_patient_signature" ? job.handoffUrl : undefined,
    lastError: status === "failed" ? job.lastError : undefined,
  });
}
