export const CANDIDATE_GOALS = ['Understand my options', 'Explore medically supervised weight care', 'Discuss ongoing weight-management support'] as const;
export const CANDIDATE_SUPPORT = ['No previous professional support', 'Previously worked with a care team', 'Currently receiving care', 'Prefer to discuss with a provider'] as const;
export const CANDIDATE_CONTACT = ['Phone call', 'Email'] as const;
export const US_STATE_CODES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
export type CandidateAssessment = {
  id: string; firstName: string; lastName: string; email: string; phone: string; state: string;
  goal: string; previousSupport: string; contactPreference: string; adult: boolean; consent: boolean;
  attribution: Record<string, string>;
};
export function validateCandidateAssessment(value: unknown): CandidateAssessment | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof b[key] === 'string' && b[key].length <= max ? b[key].trim() : '';
  const id = text('id', 36);
  const firstName = text('firstName', 80), lastName = text('lastName', 80);
  const email = text('email', 254).toLowerCase();
  const digits = text('phone', 30).replace(/\D/g, '');
  const phone = digits.length === 11 && digits.startsWith('1') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : '';
  const state = text('state', 2), goal = text('goal', 100), previousSupport = text('previousSupport', 100), contactPreference = text('contactPreference', 20);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !phone || !US_STATE_CODES.includes(state) || !CANDIDATE_GOALS.includes(goal as typeof CANDIDATE_GOALS[number]) || !CANDIDATE_SUPPORT.includes(previousSupport as typeof CANDIDATE_SUPPORT[number]) || !CANDIDATE_CONTACT.includes(contactPreference as typeof CANDIDATE_CONTACT[number]) || b.adult !== true || b.consent !== true) return null;
  const attribution: Record<string, string> = {};
  if (b.attribution && typeof b.attribution === 'object') {
    const raw = b.attribution as Record<string, unknown>;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'aff']) {
      if (typeof raw[key] === 'string') attribution[key] = raw[key].slice(0, 200);
    }
  }
  return { id, firstName, lastName, email, phone, state, goal, previousSupport, contactPreference, adult: true, consent: true, attribution };
}
