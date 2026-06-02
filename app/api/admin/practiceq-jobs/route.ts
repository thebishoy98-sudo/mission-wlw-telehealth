/**
 * Admin API — PracticeQ Automation Jobs
 *
 * GET  /api/admin/practiceq-jobs?status=queued   — list jobs + full patient/order/answers/uploads
 * PATCH /api/admin/practiceq-jobs                — update job status
 *
 * Used by the local practiceq-remote-worker to poll for work and report back.
 * Requires ADMIN_SECRET header (x-admin-secret) or cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";

export const dynamic = "force-dynamic";

const PRACTICEQ_IDENTITY_DEFERRED_ERROR = "PracticeQ deferred until verified identity";

function getPracticeQStatusForJobUpdate(status: string, error?: string) {
  if (status === "completed") return "completed";
  if (status === "failed") return error === PRACTICEQ_IDENTITY_DEFERRED_ERROR ? "pending" : "error";
  return "pending";
}

// ── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit") ?? "10") || 10);
  const jobs = await dbServer.practiceqAutomationJobDb.getQueued(limit);

  const hydrated = await Promise.all(
    jobs.map(async (job) => {
      const [patient, order, answers, questions, uploads] = await Promise.all([
        dbServer.patientDb.getById(job.patientId).catch(() => null),
        dbServer.orderDb.getById(job.orderId).catch(() => null),
        dbServer.answerDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.answerDb.getByOrder>>),
        dbServer.questionDb.getAll().catch(() => [] as Awaited<ReturnType<typeof dbServer.questionDb.getAll>>),
        dbServer.uploadDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>),
      ]);

      // answer map: questionId → answer string
      const answerMap: Record<string, string> = {};
      for (const a of answers) {
        const q = questions.find((q) => q.id === a.questionId);
        answerMap[q?.id ?? a.questionId] = String(a.answer ?? "");
      }

      // product → medication name
      let medicationName = "Tirzepatide";
      if (order?.productId) {
        const product = await dbServer.productDb.getById(order.productId).catch(() => null);
        if (product?.slug?.includes("sema") || product?.name?.toLowerCase().includes("sema")) {
          medicationName = "Semaglutide";
        }
      }

      // Expose only the license image + selfie frame (not full video — too large for JSON)
      const identityUploads = uploads
        .filter((u) => u.type === "driver_license" || u.type === "selfie_video")
        .map((u) => ({
          id: u.id,
          type: u.type,
          mimeType: u.type === "selfie_video" ? "image/jpeg" : u.mimeType,
          // For selfie_video rows, base64Data is actually the selfie frame (set during charge)
          base64Data: u.base64Data ?? null,
          filename: u.type === "driver_license" ? "identity-document.jpg" : "selfie.jpg",
        }));

      return { job, patient, order, answerMap, medicationName, identityUploads };
    })
  );

  return NextResponse.json({ jobs: hydrated, count: hydrated.length });
}

// ── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { jobId, status, error, intakeQUrl } = await req.json();

  if (!jobId || !status) {
    return NextResponse.json({ error: "jobId and status required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
    ...(intakeQUrl ? { intakeQUrl } : {}),
  };
  if (status === "running")    updates.startedAt   = new Date().toISOString();
  if (status === "completed")  updates.completedAt = new Date().toISOString();

  const updated = await dbServer.practiceqAutomationJobDb.update(jobId, updates);
  if (!updated) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (updated.orderId) {
    const pqStatus = getPracticeQStatusForJobUpdate(status, error);
    await dbServer.orderDb.update(updated.orderId, { practiceQStatus: pqStatus }).catch(() => {});
  }

  const practiceQCompletion = status === "completed"
    ? await completePracticeQSession(jobId).catch((completionError) => ({
        status: "pharmacy_error" as const,
        error: completionError instanceof Error ? completionError.message : String(completionError),
      }))
    : undefined;

  return NextResponse.json({ success: true, job: updated, practiceQCompletion });
}
