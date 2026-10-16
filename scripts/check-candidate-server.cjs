// Portable server checks for environments where Jest's native resolver is unavailable.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  const execute = vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file });
  execute(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
(async () => {
  const validation = load('lib/candidate-assessment.ts');
  const data = { id: '901f94f7-7860-41f7-8171-e87132370e69', firstName: 'Test', lastName: 'Candidate', email: 'candidate@example.test', phone: '(202) 555-0100', state: 'NY', goal: 'Understand my options', previousSupport: 'No previous professional support', contactPreference: 'Email', adult: true, consent: true, attribution: { ref: 'partner', unrelated: 'discard' } };
  for (const change of [{ adult: false }, { consent: false }, { phone: 'invalid' }, { state: 'XX' }, { goal: 'buy medication' }]) assert.equal(validation.validateCandidateAssessment({ ...data, ...change }), null);
  const normalized = validation.validateCandidateAssessment(data);
  assert.equal(normalized.phone, '+12025550100');
  assert.deepEqual(normalized.attribution, { ref: 'partner' });
  const calls = [];
  let duplicate = false, smsFailure = false;
  const db = { sql: async (strings, ...values) => {
    const query = strings.join(''); calls.push({ query, values });
    return { rows: query.includes('INSERT INTO candidate_assessments') && !duplicate ? [{ id: data.id }] : [] };
  } };
  const notification = { sendAdminNotification: async (event, payload) => { calls.push({ event, payload }); if (smsFailure) throw Error('SMS unavailable'); return [{ status: 'sent' }]; } };
  const service = load('services/candidate-assessments.ts', { '@/lib/db.server': db, '@/services/admin-notifications': notification });
  const previous = process.env.POSTGRES_URL;
  process.env.POSTGRES_URL = 'mock-database';
  try {
    await service.saveCandidateAssessment(normalized);
    assert(calls.findIndex(c => c.query?.includes('INSERT INTO candidate_assessments')) < calls.findIndex(c => c.event));
    assert.equal(calls.find(c => c.event).event, 'candidate_assessment_received');
    assert.deepEqual(calls.find(c => c.event).payload, { eventId: data.id });
    calls.length = 0; duplicate = true;
    await service.saveCandidateAssessment(normalized);
    assert.equal(calls.filter(c => c.event).length, 0);
    duplicate = false; smsFailure = true;
    await assert.doesNotReject(() => service.saveCandidateAssessment(normalized));
    let persistenceFailure = false;
    const route = load('app/api/intake/candidate/route.ts', { '@/lib/candidate-assessment': validation, '@/services/candidate-assessments': { saveCandidateAssessment: async () => { if (persistenceFailure) throw Error('DB down'); } } });
    const request = (body, origin = 'https://mission.test') => new Request('https://mission.test/api/intake/candidate', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
    assert.equal((await route.POST(request(data))).status, 201);
    assert.equal((await route.POST(request({ ...data, consent: false }))).status, 400);
    assert.equal((await route.POST(request(data, 'https://other.test'))).status, 403);
    persistenceFailure = true;
    assert.equal((await route.POST(request(data))).status, 503);
    console.log('PASS: required consent/adult/contact validation, attribution allowlist, save-before-SMS, deduplication, SMS failure recovery, API validation and persistence failure. No real database or SMS used.');
  } finally { if (previous === undefined) delete process.env.POSTGRES_URL; else process.env.POSTGRES_URL = previous; }
})().catch(error => { console.error(error); process.exitCode = 1; });
