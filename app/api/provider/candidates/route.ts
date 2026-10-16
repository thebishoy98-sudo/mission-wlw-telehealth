import { NextResponse } from 'next/server';
import { requireProviderOrAdmin } from '@/lib/server-auth';
import { getStaffSessionFromRequest } from '@/lib/staff-session';
import { sql } from '@/lib/db.server';
import { ensureCandidateTable, notifyCandidateAssessment } from '@/services/candidate-assessments';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;
  try {
    await ensureCandidateTable();
    const { rows } = await sql`SELECT * FROM candidate_assessments ORDER BY created_at DESC LIMIT 200`;
    return NextResponse.json({ candidates: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load candidate assessments.' }, { status: 503 }); }
}
export async function PATCH(req: Request) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== 'string' || body.id.length > 36) return NextResponse.json({ error: 'Invalid assessment.' }, { status: 400 });
  try {
    await ensureCandidateTable();
    const { rows: existing } = await sql`SELECT id FROM candidate_assessments WHERE id = ${body.id}`;
    if (!existing.length) return NextResponse.json({ error: 'Assessment not found.' }, { status: 404 });
    if (body.action === 'retry_notification') {
      const status = await notifyCandidateAssessment(body.id);
      return NextResponse.json({ ok: true, notificationStatus: status });
    }
    if (body.action !== 'record_review' || typeof body.note !== 'string' || !body.note.trim() || body.note.length > 2000) return NextResponse.json({ error: 'Add a review or follow-up note (up to 2,000 characters).' }, { status: 400 });
    const actor = getStaffSessionFromRequest(req)?.email ?? 'authorized-staff';
    await sql`UPDATE candidate_assessments SET status = 'reviewed', reviewed_at = NOW(), reviewed_by = ${actor}, review_note = ${body.note.trim()} WHERE id = ${body.id} AND status = 'pending'`;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not update the assessment.' }, { status: 503 }); }
}
