import { NextResponse } from 'next/server';
import { validateCandidateAssessment } from '@/lib/candidate-assessment';
import { saveCandidateAssessment } from '@/services/candidate-assessments';

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const allowedOrigins = new Set([new URL(req.url).origin, 'https://missionwlw.com', 'https://www.missionwlw.com']);
  if (origin && !allowedOrigins.has(origin)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 12000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const data = validateCandidateAssessment(body);
  if (!data) return NextResponse.json({ error: 'Please complete all fields and confirm the consent boxes.' }, { status: 400 });
  try {
    await saveCandidateAssessment(data);
    return NextResponse.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'We could not save your assessment. Please try again or contact service@missionwlw.com.' }, { status: 503 });
  }
}
