import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CandidateForm } from './CandidateForm';

export const metadata: Metadata = {
  title: 'Candidate Assessment | MissionWLW',
  description: 'Share your goals with MissionWLW for review before discussing treatment options.',
  robots: { index: false, follow: true },
};
export default function Page() {
  return <Suspense fallback={null}><CandidateForm /></Suspense>;
}
