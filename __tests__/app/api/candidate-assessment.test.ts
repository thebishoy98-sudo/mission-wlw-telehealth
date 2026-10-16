/** @jest-environment node */
import { POST } from '@/app/api/intake/candidate/route';
import { GET, PATCH } from '@/app/api/provider/candidates/route';
import { saveCandidateAssessment } from '@/services/candidate-assessments';
import { validateCandidateAssessment } from '@/lib/candidate-assessment';

jest.mock('@/services/candidate-assessments', () => ({ saveCandidateAssessment: jest.fn(), ensureCandidateTable: jest.fn(), notifyCandidateAssessment: jest.fn() }));
jest.mock('@/lib/db.server', () => ({ sql: jest.fn() }));
const valid = {
  id: '901f94f7-7860-41f7-8171-e87132370e69', firstName: 'Test', lastName: 'Candidate', email: 'candidate@example.test', phone: '(202) 555-0100', state: 'NY',
  goal: 'Understand my options', previousSupport: 'No previous professional support', contactPreference: 'Email', adult: true, consent: true,
  attribution: { utm_source: 'social', ref: 'partner', privateData: 'discard' },
};
const request = (body: unknown, origin = 'https://mission.test') => new Request('https://mission.test/api/intake/candidate', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('education-funnel candidate submission', () => {
  beforeEach(() => jest.resetAllMocks());
  it('requires consent, adult confirmation, and valid contact data', () => {
    for (const change of [{ consent: false }, { adult: false }, { phone: 'bad' }, { state: 'XX' }, { goal: 'buy medication' }]) expect(validateCandidateAssessment({ ...valid, ...change })).toBeNull();
  });
  it('normalizes contact data and retains only allowed attribution', async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(201);
    expect(saveCandidateAssessment).toHaveBeenCalledWith(expect.objectContaining({ phone: '+12025550100', attribution: { utm_source: 'social', ref: 'partner' } }));
    expect(await response.json()).toEqual({ ok: true });
  });
  it('rejects cross-origin submissions and invalid inputs before saving', async () => {
    expect((await POST(request(valid, 'https://other.test'))).status).toBe(403);
    expect((await POST(request({ ...valid, consent: false }))).status).toBe(400);
    expect(saveCandidateAssessment).not.toHaveBeenCalled();
  });
  it('does not report success when persistence fails', async () => {
    (saveCandidateAssessment as jest.Mock).mockRejectedValue(Error('database down'));
    expect((await POST(request(valid))).status).toBe(503);
  });
  it('protects the staff inbox and updates from anonymous access', async () => {
    expect((await GET(new Request('https://mission.test/api/provider/candidates'))).status).toBe(401);
    expect((await PATCH(new Request('https://mission.test/api/provider/candidates', { method: 'PATCH' }))).status).toBe(401);
  });
});
