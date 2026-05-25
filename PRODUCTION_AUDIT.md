# Production Audit

Audit date: 2026-05-24 local workspace date / 2026-05-25 command runtime.

Scope: full Next.js app, API routes, integration services, database schema, env usage, build/typecheck/lint/tests, and browser route smoke checks.

## Go / No-Go

**Recommendation: NO-GO for production with real PHI or real patients.**

The app is demo-ready in places, but not production-ready end to end. The main blockers are real authentication/authorization, real PracticeQ integration, PCI-safe QuickBooks Payments tokenization, BAA-covered storage for identity uploads, production database verification, and removal/minimization of PHI sent to non-HIPAA systems.

## Fixes Completed

- Added explicit ESLint tooling:
  - `.eslintrc.json`
  - `eslint`
  - `eslint-config-next`
- Fixed lint errors from unescaped JSX text in:
  - `app/admin/integrations/page.tsx`
  - `app/page.tsx`
  - `app/start/info/page.tsx`
- Fixed `/admin` middleware redirect from non-existent `/admin/login` to `/login/admin`.
- Changed middleware so missing `ADMIN_SECRET` no longer silently opens admin routes in production.
- Disabled browser demo seeding in production unless `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`.
- Updated `app/api/orders/[id]/route.ts` to read from server Postgres first, then local fallback, instead of only reading the local mock DB from a server route.
- Replaced hardcoded PracticeQ mock constants with an env-driven live submission path:
  - `USE_REAL_PRACTICEQ=true`
  - `PRACTICEQ_API_KEY`
  - `PRACTICEQ_BASE_URL`
  - optional `PRACTICEQ_INTAKE_ENDPOINT`
- Added server Postgres persistence helpers for `practiceq_packets`.
- Made PracticeQ webhook updates persist to server Postgres when available.
- Made PracticeQ, Life File, and Spruce webhooks fail closed in production when webhook secrets are missing.
- Made Life File and Spruce signature comparisons length-safe and added invalid JSON handling.
- Made identity reminder cron fail closed in production when `CRON_SECRET` is missing.
- Blocked live QuickBooks Payments charges without an Intuit payment token unless `QB_ALLOW_RAW_CARD_CHARGES=true` is explicitly set.

## Critical Blockers

### 1. Authentication is demo-only

Files:
- `lib/auth.tsx`
- `components/auth/ProtectedRoute.tsx`
- `middleware.ts`
- `app/api/admin/dashboard/route.ts`
- `app/api/provider/*`
- `app/api/orders/*`

Findings:
- Staff credentials are hardcoded.
- Patient password is hardcoded as `patient123`.
- Sessions are stored in browser `localStorage`.
- `ProtectedRoute` is client-side only and does not protect API data.
- Provider/admin API routes return PHI without server-side session authorization.

Needed:
- Real auth provider or PracticeQ-backed SSO/session model.
- Server-side session validation in every PHI/API route.
- Role-based authorization for patient/provider/admin access.

### 2. PracticeQ is not real

Files:
- `services/practiceq.ts`
- `app/api/webhooks/practiceq/route.ts`
- `lib/service-config.ts`

Findings:
- The hardcoded mock URL/key were removed.
- Live mode now posts intake data to the configured PracticeQ endpoint.
- The exact PracticeQ production endpoint/payload still needs vendor confirmation and an authenticated end-to-end test.

Needed:
- PracticeQ API contract for creating/updating intake packets.
- Real base URL, auth method, required payload fields, and webhook event schema.
- Configure `PRACTICEQ_INTAKE_ENDPOINT` if the vendor path is not `/intake/submit`.

### 3. Payment flow is not PCI-safe

Files:
- `app/start/payment/page.tsx`
- `app/api/payments/charge/route.ts`
- `services/quickbooks-payments.ts`

Findings:
- The browser collects raw card number, expiry, and CVC.
- Raw card data is sent to `/api/payments/charge`.
- `NEXT_PUBLIC_QB_PAYMENTS_APP_KEY` is not configured or used.
- Comments describe Intuit tokenization, but the implementation does not use it.
- The server now rejects live QuickBooks charges without a token unless `QB_ALLOW_RAW_CARD_CHARGES=true` is explicitly set.

Needed:
- Intuit client-side tokenization using `NEXT_PUBLIC_QB_PAYMENTS_APP_KEY`.
- Server route should accept only a payment token, not raw PAN/CVC.
- Update CSP/script config for Intuit payments script.

### 4. QuickBooks PHI risk

Files:
- `services/quickbooks.ts`
- `app/api/payments/charge/route.ts`
- `app/api/orders/sync-quickbooks/route.ts`

Findings:
- QuickBooks customer creation sends patient name, email, phone, and address.
- Invoice line description includes treatment/product/dose.
- Intuit/QuickBooks should not be treated as a HIPAA PHI system unless a compliant agreement/workflow exists.

Needed:
- Business decision: either keep QuickBooks strictly non-PHI with opaque references or replace accounting workflow.
- Remove treatment names/doses and direct patient identifiers from QuickBooks payloads if QuickBooks remains in use.

### 5. Database production readiness is not verified

Files:
- `lib/db.server.ts`
- `lib/schema.sql`
- `scripts/db-migrate.ts`
- `app/api/cron/identity-reminders/route.ts`

Findings:
- App is wired to Postgres, but dev runtime recently tried `127.0.0.1:5432` on Vercel and crashed checkout.
- `POSTGRES_URL` exists only for Production in the current Vercel project.
- Several API routes still fall back to browser/local mock DB patterns.
- Schema allows base64 uploads in Postgres.

Needed:
- BAA-covered Postgres with verified production/preview/dev connection URLs.
- Run migrations and verify schema.
- Add DB health check that validates a query, not just env presence.
- Remove localStorage fallback from production server paths after real auth/data is live.

### 6. Identity uploads need real storage

Files:
- `components/identity/IdentityCapture.tsx`
- `app/start/uploads/page.tsx`
- `app/api/identity/upload/route.ts`
- `lib/schema.sql`

Findings:
- Identity images/video frames are stored in browser state/localStorage during intake.
- Server schema stores upload base64 in Postgres.
- No BAA-covered object storage, signed URLs, retention cleanup, malware checks, or file-size enforcement are in place.

Needed:
- Private object storage bucket with BAA.
- Signed upload/read URLs.
- Store metadata and storage keys in DB, not raw base64 payloads.

### 7. Cron route requires `CRON_SECRET` in production

File:
- `app/api/cron/identity-reminders/route.ts`

Finding:
- Fixed: if `CRON_SECRET` is unset in production, the route returns a configuration error instead of running.

Needed:
- Set `CRON_SECRET` in production.

## High Priority Issues

- `/api/admin/dashboard` and `/api/provider/dashboard` are not server-authenticated.
- `/api/provider/patients/[id]` returns chart data without server-authenticated provider context.
- `/api/orders/[id]` exposes partial patient/order status without patient ownership verification.
- `SeedInit` previously seeded demo patients/orders on production client load; fixed to require explicit `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`.
- `services/lifefile.ts` has fallback prescriber placeholders if env is missing.
- `app/admin/page.tsx` links to `/admin/questionnaire`, but no such route exists.
- `app/api/health/route.ts` reveals integration mode publicly.
- CSP allows `unsafe-inline` and `unsafe-eval`.
- Rate limiting uses in-memory Edge maps; this is not reliable across Vercel instances.
- `npm audit` reports 5 vulnerabilities after adding lint packages; review dependency risk before production.

## Medium Priority Issues

- Lint warnings remain for `<img>` usage where `next/image` would improve LCP.
- Lint warnings remain for several hook dependency arrays.
- E2E suite did not complete within tool timeout; needs test stability work.
- Product and patient portals still rely heavily on localStorage.
- Admin CMS/product changes do not persist to server DB.
- `README.md` and `INTEGRATIONS.md` still describe the product as a mocked demo in places.
- Generated screenshots/output files and ad hoc scripts exist as untracked files; do not include them in production commits unless intentionally curated.

## Verification Results

Commands run:

```powershell
npm run build
npx tsc --noEmit
npm test -- --runInBand
npm run lint
npm run test:e2e -- --project=chromium
$env:E2E_BASE_URL='http://localhost:3007'; npx playwright test e2e/patient-journey.spec.ts --project=chromium --reporter=list --timeout=30000
node -e "<Playwright smoke route script>"
```

Results:
- `npm run build`: passed.
- `npx tsc --noEmit`: passed when run alone after build output stabilized. Parallel runs can fail because `.next/types` is regenerated during `next build`.
- `npm test -- --runInBand`: passed, 13 suites / 83 tests.
- `npm run lint`: passed with warnings after ESLint config/deps and JSX escaping fixes.
- `npm audit --audit-level=moderate`: failed with 5 vulnerabilities: Next.js/postcss advisories and `eslint-config-next` transitive `glob`; suggested fix is a breaking upgrade to Next 16.
- Full Playwright E2E: timed out after 5 minutes with no useful output.
- Narrow patient Playwright E2E: timed out after 3 minutes with no useful output.
- Fresh production server smoke on `localhost:3012`: `/`, `/products`, `/start/info`, `/login`, `/login/admin`, `/status` returned 200 with no page errors. `/provider` redirected client-side to `/login/provider`. `/admin` redirected to `/login/admin?redirect=%2Fadmin`.
- Fresh `/api/health` on `localhost:3012`: returned `practiceq: "mock"`, `quickbooks: "live"`, `lifefile: "live"`, `spruce: "mock"` with the local environment.

## Remaining Production Environment Needs

See `PROD_ENV_REQUIREMENTS.md` for the complete value-by-value list. The short list before production:

- Real auth/session provider and env values.
- Production `ADMIN_SECRET` until real auth replaces it.
- Production `CRON_SECRET`.
- Verified BAA-covered Postgres URLs for production and preview.
- Object storage bucket and credentials for identity uploads.
- PracticeQ real API/webhook credentials and implementation contract.
- Intuit client app key for payment tokenization.
- QuickBooks service item IDs and a non-PHI accounting design.
- Life File webhook secret and complete prescriber env.
- Spruce webhook secret if inbound Spruce webhooks are used.

## Final Recommendation

Do not merge to production for real patients yet. The app can support demos and continued integration testing, but production launch requires auth, storage, database, PracticeQ, PCI-safe payments, and PHI/accounting decisions to be resolved first.
