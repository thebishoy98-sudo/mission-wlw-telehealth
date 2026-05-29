import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const denied = requireProviderOrAdmin(request);
  if (denied) return denied;

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

