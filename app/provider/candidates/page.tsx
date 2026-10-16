"use client";

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Navbar } from '@/components/layout/Navbar';
import { useAuth } from '@/lib/auth';

type Candidate = {
  id: string; first_name: string; last_name: string; email: string; phone: string; state: string;
  goal: string; previous_support: string; contact_preference: string; created_at: string;
  status: string; review_note?: string; reviewed_by?: string; notification_status: string; attribution: Record<string, string>;
};
function Inbox() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function load() {
    try {
      const response = await fetch('/api/provider/candidates', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setCandidates(data.candidates);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load assessments.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function update(id: string, action: string) {
    setBusy(id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/provider/candidates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, note: notes[id] }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setMessage(action === 'retry_notification' && data.notificationStatus !== 'sent' ? 'Notification still needs attention. Check Admin → Notifications and the Spruce integration log.' : 'Assessment updated.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed.'); }
    finally { setBusy(''); }
  }
  return <>
    <Navbar variant={user?.role === 'admin' ? 'admin' : 'provider'} />
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-3xl font-bold text-forest-800">Candidate assessments</h1>
      <p className="mt-3 text-gray-600">Education-funnel inquiries awaiting care-team follow-up and provider evaluation. These are not orders. Discuss treatment options after provider review, then guide the candidate into the existing patient workflow where appropriate.</p>
      <button onClick={() => { setError(''); void load(); }} className="mt-5 rounded-lg border px-4 py-2">Refresh</button>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 text-forest-800">{message}</p>}
      {loading ? <p className="mt-6">Loading assessments…</p> : !candidates.length && <p className="mt-6">No candidate assessments yet.</p>}
      <div className="mt-6 space-y-6">{candidates.map(candidate => <article key={candidate.id} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">{candidate.first_name} {candidate.last_name}</h2><span>{candidate.status === 'pending' ? 'Awaiting review' : 'Review recorded'}</span></div>
        <p className="mt-2 text-sm text-gray-500">Submitted {new Date(candidate.created_at).toLocaleString()} · {candidate.state}</p>
        <dl className="mt-4 grid gap-4 break-words sm:grid-cols-2">
          <div><dt className="font-semibold">Contact</dt><dd><a className="underline" href={`mailto:${candidate.email}`}>{candidate.email}</a><br /><a className="underline" href={`tel:${candidate.phone}`}>{candidate.phone}</a><br />Prefers {candidate.contact_preference.toLowerCase()}</dd></div>
          <div><dt className="font-semibold">Goal</dt><dd>{candidate.goal}</dd><dt className="mt-2 font-semibold">Previous support</dt><dd>{candidate.previous_support}</dd></div>
          <div><dt className="font-semibold">Attribution</dt><dd>{Object.entries(candidate.attribution).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Direct'}</dd></div>
          <div><dt className="font-semibold">Staff SMS notification</dt><dd>{candidate.notification_status === 'sent' ? 'Sent' : 'Needs attention'}</dd>{candidate.notification_status !== 'sent' && <button disabled={busy === candidate.id} onClick={() => void update(candidate.id, 'retry_notification')} className="mt-2 rounded-lg border px-3 py-2 text-sm">Retry staff notification</button>}</div>
        </dl>
        {candidate.status === 'pending' ? <div className="mt-5"><label className="block font-semibold" htmlFor={`note-${candidate.id}`}>Review / follow-up note</label><textarea id={`note-${candidate.id}`} className="mt-2 w-full rounded-lg border p-3" maxLength={2000} value={notes[candidate.id] || ''} onChange={e => setNotes({ ...notes, [candidate.id]: e.target.value })} /><button disabled={busy === candidate.id || !notes[candidate.id]?.trim()} onClick={() => void update(candidate.id, 'record_review')} className="mt-3 rounded-lg bg-forest-800 px-4 py-3 text-white disabled:opacity-50">Record review / follow-up</button><p className="mt-2 text-sm text-gray-500">Records staff follow-up only; does not approve treatment, create an order, or prescribe medication.</p></div> : <p className="mt-5 whitespace-pre-wrap">{candidate.review_note}<span className="mt-2 block text-sm text-gray-500">Recorded by {candidate.reviewed_by}</span></p>}
      </article>)}</div>
    </div>
  </>;
}
export default function Page() {
  return <ProtectedRoute allowedRoles={['provider', 'admin']}><Inbox /></ProtectedRoute>;
}
