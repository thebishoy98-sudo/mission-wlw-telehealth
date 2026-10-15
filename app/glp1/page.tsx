import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Glp1Page } from './Glp1Page';
import './glp1.css';

export const metadata: Metadata = {
  title: 'GLP-1 Medical Weight-Loss Education | MissionWLW',
  description: 'Understand GLP-1 medical weight-loss options, provider supervision, and what to expect from your MissionWLW assessment.',
  alternates: { canonical: '/glp1' },
  openGraph: {
    title: 'Understand Your Medical Weight-Loss Options | MissionWLW',
    description: 'Learn about GLP-1-based weight care and medically supervised treatment.',
    url: '/glp1',
  },
};

export default function Page() {
  return <Suspense fallback={null}><Glp1Page /></Suspense>;
}
