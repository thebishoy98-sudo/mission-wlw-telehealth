"use client";

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { CANDIDATE_GOALS, CANDIDATE_SUPPORT, CANDIDATE_CONTACT, US_STATE_CODES } from '@/lib/candidate-assessment';
import { useAssessmentUrl } from '@/lib/useAssessmentUrl';

const fieldClass = 'mt-2 block w-full rounded-xl border border-gray-300 bg-white p-3 text-base text-gray-900';

export function CandidateForm() {
  const params = useSearchParams();
  const ctaUrl = useAssessmentUrl('/glp1/assessment');
  const requestId = useRef('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const attribution: Record<string, string> = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'aff']) {
      const value = params.get(key);
      if (value) attribution[key] = value;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/intake/candidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(form), id: requestId.current, adult: form.get('adult') === 'on', consent: form.get('consent') === 'on', attribution }),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || 'Unable to submit. Please try again.');
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit. Please try again.'); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-cream-100">
    <LandingNav ctaUrl={ctaUrl} education />
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      {submitted ? <section role="status" className="rounded-2xl bg-white p-6 sm:p-10 shadow-sm">
        <h1 className="text-3xl font-bold text-forest-800">Your assessment has been received</h1>
        <p className="mt-5 leading-relaxed text-gray-700">Your information is queued for care-team review. The team will contact you using the details you provided to discuss the next step and arrange provider evaluation where appropriate.</p>
        <h2 className="mt-8 text-xl font-semibold text-forest-800">What happens next?</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-gray-700"><li>The care team reviews your goals and contact details.</li><li>A licensed provider evaluates whether further assessment or care is appropriate.</li><li>Treatment options are discussed after provider review. There is no purchase or payment required at this stage.</li></ol>
        <p className="mt-6 text-sm text-gray-600">This assessment does not guarantee eligibility or a prescription. Questions? <a className="underline" href="mailto:service@missionwlw.com">service@missionwlw.com</a></p>
        <Link className="mt-8 inline-block font-semibold text-forest-800 underline" href="/glp1">Return to GLP-1 education</Link>
      </section> : <>
        <p className="text-sm font-semibold uppercase tracking-wider text-forest-800">Education → Assessment → Provider review</p>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-forest-800">Start your candidate assessment</h1>
        <p className="mt-5 leading-relaxed text-gray-600">Tell us a little about yourself and what you would like to explore. Our care team will review your information and help arrange the appropriate next step before discussing treatment options. No medication selection or payment is required.</p>
        <form onSubmit={submit} className="mt-8 space-y-7 rounded-2xl bg-white p-6 sm:p-8 shadow-sm">
          <fieldset disabled={busy} className="space-y-5">
            <legend className="mb-5 text-xl font-semibold text-forest-800">How can we reach you?</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block font-medium">First name<input className={fieldClass} name="firstName" autoComplete="given-name" maxLength={80} required /></label>
              <label className="block font-medium">Last name<input className={fieldClass} name="lastName" autoComplete="family-name" maxLength={80} required /></label>
            </div>
            <label className="block font-medium">Email<input className={fieldClass} name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <div><label className="block font-medium" htmlFor="candidate-phone">Phone</label><input id="candidate-phone" className={fieldClass} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} aria-describedby="candidate-phone-hint" required /><p id="candidate-phone-hint" className="mt-1 text-sm text-gray-500">Use a US phone number.</p></div>
            <label className="block font-medium">State of residence<select className={fieldClass} name="state" autoComplete="address-level1" defaultValue="" required><option value="" disabled>Select your state</option>{US_STATE_CODES.map(state => <option key={state}>{state}</option>)}</select></label>
            <label className="block font-medium">Preferred contact method<select className={fieldClass} name="contactPreference" defaultValue="" required><option value="" disabled>Select a contact method</option>{CANDIDATE_CONTACT.map(option => <option key={option}>{option}</option>)}</select></label>
          </fieldset>
          <fieldset disabled={busy} className="space-y-5">
            <legend className="mb-5 text-xl font-semibold text-forest-800">Your goals</legend>
            <label className="block font-medium">What would you like to explore?<select className={fieldClass} name="goal" defaultValue="" required><option value="" disabled>Select your goal</option>{CANDIDATE_GOALS.map(option => <option key={option}>{option}</option>)}</select></label>
            <label className="block font-medium">Have you received professional weight-management support?<select className={fieldClass} name="previousSupport" defaultValue="" required><option value="" disabled>Select an answer</option>{CANDIDATE_SUPPORT.map(option => <option key={option}>{option}</option>)}</select></label>
            <p className="text-sm text-gray-600">Your provider will collect detailed health history through the clinical evaluation. Please do not send medical records through this form.</p>
            <label className="flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" name="adult" required />I confirm that I am 18 years of age or older.</label>
            <label className="flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" name="consent" required /><span>I authorize MissionWLW to review this assessment and contact me by phone or email about my request. I understand this is not a diagnosis, prescription, or commitment to treatment. I have read the <Link href="/privacy" className="underline">Privacy Policy</Link>.</span></label>
          </fieldset>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-forest-800 px-5 py-4 font-semibold text-white disabled:opacity-60">{busy ? 'Submitting…' : 'Submit Assessment for Review'}</button>
        </form>
      </>}
    </div>
    <LandingFooter ctaUrl={ctaUrl} education />
  </div>;
}
