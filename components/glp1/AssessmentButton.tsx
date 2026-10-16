import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAssessmentUrl } from '@/lib/useAssessmentUrl';

export function AssessmentButton({ className = '', children = 'Start my assessment' }: { className?: string; children?: ReactNode }) {
  const href = useAssessmentUrl('/glp1/assessment');
  return (
    <Link className={`button ${className}`.trim()} href={href}>
      {children}<span aria-hidden="true" className="button-arrow">↗</span>
    </Link>
  );
}
