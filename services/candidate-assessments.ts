import { sql } from '@/lib/db.server';
import type { CandidateAssessment } from '@/lib/candidate-assessment';
import { sendAdminNotification } from '@/services/admin-notifications';

export async function ensureCandidateTable() {
  if (!process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING) throw Error('Candidate storage unavailable');
  await sql`CREATE TABLE IF NOT EXISTS candidate_assessments (
    id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT NOT NULL, phone TEXT NOT NULL, state TEXT NOT NULL,
    goal TEXT NOT NULL, previous_support TEXT NOT NULL, contact_preference TEXT NOT NULL,
    attribution JSONB NOT NULL DEFAULT '{}', consent_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ, reviewed_by TEXT, review_note TEXT,
    notification_status TEXT NOT NULL DEFAULT 'pending'
  )`;
  await sql`CREATE INDEX IF NOT EXISTS candidate_assessments_created ON candidate_assessments(created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS candidate_assessments_pending_phone ON candidate_assessments(phone) WHERE status = 'pending'`;
}

export async function notifyCandidateAssessment(id: string) {
  const results = await sendAdminNotification('candidate_assessment_received', { eventId: id });
  const status = results.length && results.every(r => r.status === 'sent' || r.status === 'duplicate') ? 'sent' : 'needs_attention';
  await sql`UPDATE candidate_assessments SET notification_status = ${status} WHERE id = ${id}`;
  return status;
}

export async function saveCandidateAssessment(data: CandidateAssessment) {
  await ensureCandidateTable();
  // One pending request per phone; the unique index also prevents concurrent duplicate notifications.
  const { rows } = await sql`
    INSERT INTO candidate_assessments (id, first_name, last_name, email, phone, state, goal, previous_support, contact_preference, attribution, consent_version)
    SELECT ${data.id}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.phone}, ${data.state}, ${data.goal}, ${data.previousSupport}, ${data.contactPreference}, ${JSON.stringify(data.attribution)}::jsonb, 'candidate-contact-v1'
    WHERE NOT EXISTS (SELECT 1 FROM candidate_assessments WHERE phone = ${data.phone} AND status = 'pending')
    ON CONFLICT DO NOTHING RETURNING id
  `;
  if (rows.length) await notifyCandidateAssessment(data.id).catch(() => {});
  return { accepted: true };
}
