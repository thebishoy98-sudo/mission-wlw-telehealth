"use client";

import { useSearchParams } from 'next/navigation';

const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'aff'] as const;

/** Keep the existing landing-page attribution when entering patient intake. */
export function useAssessmentUrl(base = '/start/info') {
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  TRACKING_KEYS.forEach(key => {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
