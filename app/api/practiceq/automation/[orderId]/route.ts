import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const job = await dbServer.practiceqAutomationJobDb.getByOrder(orderId).catch(() => null);
  if (!job) return NextResponse.json({ available: false });

  return NextResponse.json({
    available: true,
    status: job.status,
    handoffUrl: job.status === "awaiting_patient_signature" ? job.handoffUrl : undefined,
    lastError: job.lastError,
  });
}

