import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";

export async function GET(
  _request: Request,
  { params }: { params: { orderId: string } }
) {
  const job = await dbServer.practiceqAutomationJobDb.getByOrder(params.orderId).catch(() => null);
  if (!job) return NextResponse.json({ available: false });

  return NextResponse.json({
    available: true,
    status: job.status,
    handoffUrl: job.status === "awaiting_patient_signature" ? job.handoffUrl : undefined,
    lastError: job.lastError,
  });
}

