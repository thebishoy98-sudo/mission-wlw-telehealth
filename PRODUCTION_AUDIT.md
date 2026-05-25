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
- Added an admin login bridge that sets the httpOnly `admin_secret` cookie required by middleware.
- Made `/api/admin/dashboard` require admin authorization.
- Made identity approval/review/resend APIs admin-only.
- Removed provider identity approval/resend actions and redirected the old provider identity-review route to admin orders.
- Kept provider chart review focused on clinical questionnaire, consent, payment, and pharmacy details; identity proof review is now admin-owned.
- Removed public health endpoint disclosure of integration mock/live mode.
- Removed public copy that stated blanket HIPAA compliance before the remaining BAA/auth/storage blockers are resolved.
- Replaced the dead `/admin/questionnaire` dashboard link with the existing integrations/questionnaire source view.
- Disabled browser demo seeding in production unless `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`.
- Updated `app/api/orders/[id]/route.ts` to read from server Postgres first, then local fallback, instead of only reading the local mock DB from a server route.
- Replaced hardcoded PracticeQ mock constants with an env-driven live submission path:
  - `USE_REAL_PRACTICEQ=true`
  - `PRACTICEQ_API_KEY`
  - `PRACTICEQ_BASE_URL`
  - optional `PRACTICEQ_INTAKE_ENDPOINT`
- Updated PracticeQ live mode to match the official IntakeQ API contract:
  - Base URL `https://intakeq.com/api/v1`
  - Auth header `X-Auth-Key`
  - Client sync through `/clients`
  - Intake package send through `/intakes/send`
- Added `PRACTICEQ_QUESTIONNAIRE_ID` for selecting the PracticeQ intake template.
- Configured the PracticeQ Intake Form Webhook URL to call production with a secret query key.
- Added server Postgres persistence helpers for `practiceq_packets`.
- Made PracticeQ webhook updates persist to server Postgres when available.
- Made PracticeQ, Life File, and Spruce webhooks fail closed in production when webhook secrets are missing.
- Made Life File and Spruce signature comparisons length-safe and added invalid JSON handling.
- Made identity reminder cron fail closed in production when `CRON_SECRET` is missing.
- Blocked live QuickBooks Payments charges without an Intuit payment token unless `QB_ALLOW_RAW_CARD_CHARGES=true` is explicitly set.
- Added server-backed product/question read APIs for public intake and product pages.
- Wired admin product create/edit/delete buttons to authenticated API routes instead of browser-only storage.
- Made admin product writes fail visibly if production database persistence fails.
- Updated product detail pages to resolve both product IDs and slugs, fixing `/products/tirzepatide`.
- Replaced the public status page localStorage viewer with an order ID + email lookup against `/api/orders/[id]`.
- Disabled online refill/dose-increase actions until a real refill/payment/pharmacy backend exists.
- Disabled the old browser-only CMS editor instead of showing a fake "saved" success state.
- Wired admin integration activity to a server API backed by integration logs.
- Added required-question validation to the health questionnaire.
- Disabled the checkout payment form when Intuit client tokenization is not configured, instead of accepting a fake/live-broken payment attempt.
- Removed the remaining blanket HIPAA-compliance badge copy from the landing page.

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
- Admin/provider credentials are still demo credentials.
- Patient password is hardcoded as `patient123`.
- Sessions are stored in browser `localStorage`.
- `ProtectedRoute` is client-side only and does not protect API data.
- `/api/admin/dashboard` and identity APIs now require the admin cookie/header.
- Provider API routes still return PHI without server-side session authorization.

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
- Live mode now syncs the client and sends the configured questionnaire through the official IntakeQ API.
- Production Vercel has been configured with the PracticeQ API base URL, send endpoint, questionnaire ID, API key, and webhook key.

Needed:
- Run one real checkout/intake in production and confirm the client/form appears in PracticeQ and the webhook log receives the submitted intake event.

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
- Fixed for new server-side persistence: production identity uploads now require a configured storage provider before persistence or payment charge.
- Fixed for new S3-backed uploads: Postgres stores object references/metadata and not base64 payloads.
- Browser intake state still holds identity media before submit; this must be reduced before real patient launch.
- No BAA-covered object storage credentials, signed read URLs, retention cleanup, or malware scanning are configured yet.

Needed:
- Private object storage bucket with BAA and `IDENTITY_STORAGE_PROVIDER=s3`.
- Signed upload/read URLs.
- Retention lifecycle and malware/file validation.

### 7. Cron route requires `CRON_SECRET` in production

File:
- `app/api/cron/identity-reminders/route.ts`

Finding:
- Fixed: if `CRON_SECRET` is unset in production, the route returns a configuration error instead of running.

Needed:
- Set `CRON_SECRET` in production.

## High Priority Issues

- `/api/provider/dashboard` is not server-authenticated.
- `/api/provider/patients/[id]` returns chart data without server-authenticated provider context.
- `/api/orders/[id]` exposes partial patient/order status; the public status page now requires matching email, but the API itself still needs real patient/session authorization.
- `SeedInit` previously seeded demo patients/orders on production client load; fixed to require explicit `NEXT_PUBLIC_ENABLE_DEMO_SEED=true`.
- `services/lifefile.ts` has fallback prescriber placeholders if env is missing.
- Admin questionnaire management is currently represented by PracticeQ/IntakeQ integration settings, not an in-app editable questionnaire builder.
- `app/api/health/route.ts` no longer reveals integration mode publicly.
- CSP allows `unsafe-inline` and `unsafe-eval`.
- Rate limiting uses in-memory Edge maps; this is not reliable across Vercel instances.
- `npm audit` reports 5 vulnerabilities after adding lint packages; review dependency risk before production.

## Medium Priority Issues

- Lint warnings remain for `<img>` usage where `next/image` would improve LCP.
- Lint warnings remain for several hook dependency arrays.
- E2E suite did not complete within tool timeout; needs test stability work.
- Product reads now use server APIs with seeded fallback. Patient portal auth/data still rely heavily on localStorage.
- Admin CMS is intentionally disabled until content is server-backed and consumed by the public site. Admin product changes are server-backed when Postgres is configured.
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
- Fresh local button-flow smoke on `localhost:3016`: `/`, `/products`, `/products/tirzepatide`, `/start/info`, `/start/questionnaire`, `/start/payment`, `/status`, `/patient/reorder`, `/login/admin`, `/admin/products`, `/admin/integrations`, and `/admin/cms` returned 200 and matched expected UI text. Verified questionnaire required validation, status lookup validation, admin login, Add Product form opening, disabled payment button, and disabled CMS notice. One recoverable Next dev console error appeared during admin navigation: RSC payload fetch failed and fell back to browser navigation.
- `npx tsc --noEmit`: passed on 2026-05-25 after the button-flow patch.
- `npm test -- --runInBand`: passed on 2026-05-25, 14 suites / 86 tests.
- `npm run lint`: passed on 2026-05-25 with warnings for `<img>` usage and one hook dependency warning.
- `npm run build`: passed on 2026-05-25 with the same warnings.
- Production deployment after commit `a52afdb`: Vercel status `Ready` for `mission-wlw`.
- Live production smoke on `https://mission-wlw.vercel.app`: `/`, `/products`, `/products/tirzepatide`, `/status`, and `/api/health` returned 200. Mobile browser smoke verified `/`, `/products/tirzepatide`, `/start/questionnaire`, `/start/payment`, and `/status` with no console errors; questionnaire required validation showed; payment button was disabled when Intuit tokenization was not configured.
- Live Life File raw status endpoint without signature returned `{"error":"Missing signature"}`, confirming it fails closed for unsigned calls.

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
- Life File/1stChoiceRx order status return path. The provided OpenAPI PDF does not define inbound webhooks or a `GET /order` polling endpoint; it only defines order create/update calls from us to Life File.
- Spruce webhook secret if inbound Spruce webhooks are used.

## Final Recommendation

Do not merge to production for real patients yet. The app can support demos and continued integration testing, but production launch requires auth, storage, database, PracticeQ, PCI-safe payments, and PHI/accounting decisions to be resolved first.
