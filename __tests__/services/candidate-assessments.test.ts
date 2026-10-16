/** @jest-environment node */
import { sql } from '@/lib/db.server';
import { sendAdminNotification } from '@/services/admin-notifications';
import { saveCandidateAssessment } from '@/services/candidate-assessments';
import type { CandidateAssessment } from '@/lib/candidate-assessment';
jest.mock('@/lib/db.server', () => ({ sql: jest.fn() }));
jest.mock('@/services/admin-notifications', () => ({ sendAdminNotification: jest.fn() }));
const data: CandidateAssessment = { id: 'test-id', firstName: 'Test', lastName: 'Candidate', email: 'test@example.test', phone: '+12025550100', state: 'NY', goal: 'Understand my options', previousSupport: 'No previous professional support', contactPreference: 'Email', adult: true, consent: true, attribution: {} };
describe('candidate persistence and staff notifications', () => {
  const previousDb = process.env.POSTGRES_URL;
  beforeEach(() => {
    jest.resetAllMocks(); process.env.POSTGRES_URL = 'test-db';
    (sql as jest.Mock).mockImplementation((strings: TemplateStringsArray) => Promise.resolve({ rows: strings.join('').includes('INSERT INTO candidate_assessments') ? [{ id: data.id }] : [] }));
    (sendAdminNotification as jest.Mock).mockResolvedValue([{ status: 'sent' }]);
  });
  afterAll(() => { if (previousDb === undefined) delete process.env.POSTGRES_URL; else process.env.POSTGRES_URL = previousDb; });
  it('saves before notifying with a per-assessment idempotency key', async () => {
    await saveCandidateAssessment(data);
    expect(sendAdminNotification).toHaveBeenCalledWith('candidate_assessment_received', { eventId: data.id });
    expect((sql as jest.Mock).mock.invocationCallOrder[3]).toBeLessThan((sendAdminNotification as jest.Mock).mock.invocationCallOrder[0]);
  });
  it('does not notify twice for duplicate or concurrent submissions', async () => {
    (sql as jest.Mock).mockResolvedValue({ rows: [] });
    await saveCandidateAssessment(data);
    expect(sendAdminNotification).not.toHaveBeenCalled();
  });
  it('retains the submission if notification delivery throws', async () => {
    (sendAdminNotification as jest.Mock).mockRejectedValue(Error('SMS down'));
    await expect(saveCandidateAssessment(data)).resolves.toEqual({ accepted: true });
  });
});
