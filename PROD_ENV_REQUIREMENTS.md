# Production Environment Requirements

This file is the production configuration inventory for Mission WLW. It lists every environment value or external service the code references, where it is used, and the current production-readiness status based on the codebase and `vercel env ls` for the linked `mission-wlw-dev` project.

Do not store real PHI or take real payments until all `BLOCKER` items are resolved.

## Core Runtime

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `NODE_ENV=production` | Next.js production behavior | Next/Vercel runtime, `components/SeedInit.tsx`, `middleware.ts` | Vercel-managed | Safe. Demo seed now stays off in production unless explicitly enabled. |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs in docs/scripts; recommended for emails/webhooks | `env.example`; code mostly uses request origin | Missing in Vercel env list | Add canonical production URL before sending patient links from background jobs. |
| `NEXT_PUBLIC_ENABLE_DEMO_SEED` | Optional demo seed data | `components/SeedInit.tsx` | Missing | Leave unset/false in production. Set only in demo environments. |

## Database

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `POSTGRES_URL` | Server DB reads/writes, cron using `@vercel/postgres` | `lib/db.server.ts`, `app/api/cron/identity-reminders/route.ts` | Present for Production only | Required for production. Must point to a BAA-covered Postgres service. |
| `POSTGRES_URL_NON_POOLING` | Direct server DB reads/writes through `pg` | `lib/db.server.ts`, `scripts/db-migrate.ts` | Present for Production, Preview, Development | Required for migrations and runtime writes. Dev previously resolved to localhost and caused 500s; verify each environment points to a real reachable DB. |
| `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NO_SSL`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` | Provider-generated DB metadata | `.env.example` only | Unknown/not used directly | Optional unless the selected DB provider requires them. |

Required database setup:
- Run `npm run db:migrate` with `POSTGRES_URL_NON_POOLING` or `POSTGRES_URL`.
- Confirm schema in `lib/schema.sql` exists in production.
- Seed real product/question rows through a controlled migration or admin import, not browser `localStorage`.
- Add database backups, retention policy, and access logging with a signed BAA.

## Authentication and Authorization

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `ADMIN_SECRET` | Middleware/API protection for `/admin` and admin-only identity actions | `middleware.ts`, `lib/server-auth.ts`, `app/api/auth/admin-login/route.ts`, `app/api/identity/*` | Present in Production | Required until real auth replaces it. Admin login now sets the protected httpOnly cookie after successful sign-in, but the username/password pair is still demo-grade and must be replaced. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin sign-in credentials for the temporary admin login bridge | `app/api/auth/admin-login/route.ts` | Missing in Vercel env list | BLOCKER. Set real values immediately or replace with proper IdP auth. Without these, the code falls back to demo credentials. |
| Provider auth secret/client IDs | Provider dashboard/API protection | Not implemented | Missing | BLOCKER. Provider pages and `/api/provider/*` need real session auth/authorization. |
| Patient auth client/session config | Patient portal access | `lib/auth.tsx` currently uses localStorage and demo passwords | Missing | BLOCKER. Replace with a real auth provider or PracticeQ-auth handoff. |

Current auth is not production-grade:
- Admin/provider credentials are still demo credentials.
- Patient password is hardcoded as `patient123`.
- Session state is client-side `localStorage`.
- API routes do not consistently enforce server-side authorization.
- Admin dashboard and identity review APIs now require the `ADMIN_SECRET` cookie/header.
- Identity approval/resend is admin-only. Provider can view submitted questionnaire answers in the patient chart, but provider identity review has been removed from the provider flow.

## QuickBooks / Intuit

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `USE_REAL_QUICKBOOKS` | Enables real QuickBooks accounting/payments | `lib/service-config.ts`, `services/quickbooks.ts`, `services/quickbooks-payments.ts` | Present in Production, Preview (dev), Development | Set deliberately per environment. |
| `QB_CLIENT_ID` | OAuth/token exchange | `lib/qb-oauth.ts`, OAuth routes, services | Present in Production, Preview (dev), Development | Secret/provider value required. |
| `QB_CLIENT_SECRET` | OAuth/token exchange | `lib/qb-oauth.ts`, OAuth callback, services | Present in Production, Preview (dev), Development | Secret required. Rotate values that were pasted into chat. |
| `QB_REFRESH_TOKEN` | Access token refresh | `lib/qb-oauth.ts` | Present in Production, Preview (dev), Development | Secret required. Rotate values that were pasted into chat. |
| `QB_REALM_ID` | Company ID and sandbox/prod endpoint selection | `services/quickbooks.ts`, `services/quickbooks-payments.ts` | Present in Production, Preview (dev), Development | Current known sandbox realm routes to sandbox endpoints. |
| `QB_ACCOUNTING_BASE_URL` | Override accounting API base | `services/quickbooks.ts` | Present in Production | Optional; normally inferred from realm/environment. |
| `QB_PAYMENTS_BASE_URL` | Override payments API base | `services/quickbooks-payments.ts` | Present in Production, Development | Missing for Preview (dev); inferred from realm if absent. |
| `QB_ALLOW_RAW_CARD_CHARGES` | Emergency opt-in for raw card server charges | `services/quickbooks-payments.ts`, `app/api/payments/charge/route.ts` | Missing | Leave unset in production. Live mode now requires an Intuit payment token unless this is explicitly set to `true`, which increases PCI scope. |
| `QB_SERVICE_ITEM_ID`, `QB_SERVICE_ITEM_NAME` | Invoice line item | `services/quickbooks.ts` | Missing | Required if using QuickBooks accounting. Defaults to item `1`/`Services`, which may be wrong. |
| `NEXT_PUBLIC_QB_PAYMENTS_APP_KEY` | Client-side Intuit tokenization | Payment comments/examples only | Missing | BLOCKER for PCI-safe production payments. Current payment form posts raw card fields to the server. |
| `QB_WEBHOOK_VERIFIER_TOKEN` | QuickBooks webhook validation | `app/api/webhooks/quickbooks/route.ts` | Missing in Vercel env list | Required before enabling QuickBooks webhooks. |

HIPAA note: QuickBooks Online should not receive PHI. Current code sends patient identity/contact data and treatment descriptions to QuickBooks accounting. Production must either limit QuickBooks to non-PHI accounting references or choose a HIPAA-appropriate billing workflow.

## PracticeQ

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `USE_REAL_PRACTICEQ` | Enables live PracticeQ submission | `lib/service-config.ts`, `services/practiceq.ts` | Present on `mission-wlw-dev`; not verified on live `mission-wlw` | Real mode calls the configured PracticeQ endpoint and fails loudly if credentials/config are missing. |
| `PRACTICEQ_API_KEY` | PracticeQ API auth | `lib/service-config.ts`, `services/practiceq.ts` | Present on `mission-wlw-dev`; not verified on live `mission-wlw` | Required when `USE_REAL_PRACTICEQ=true`. Rotate any key that was pasted into chat or logs. |
| `PRACTICEQ_BASE_URL` | PracticeQ/IntakeQ API base URL | `lib/service-config.ts`, `services/practiceq.ts` | Present on `mission-wlw-dev`; not verified on live `mission-wlw` | Required. Official API base is `https://intakeq.com/api/v1`. |
| `PRACTICEQ_INTAKE_ENDPOINT` | Send-questionnaire endpoint override | `lib/service-config.ts`, `services/practiceq.ts` | Present on `mission-wlw-dev`; not verified on live `mission-wlw` | Set to `https://intakeq.com/api/v1/intakes/send`. |
| `PRACTICEQ_QUESTIONNAIRE_ID` | Questionnaire template used for Mission WLW intake sends | `lib/service-config.ts`, `services/practiceq.ts` | Present on `mission-wlw-dev`; not verified on live `mission-wlw` | Set to the PracticeQ `Medical: Brief Intake Form` template ID. |
| `PRACTICEQ_WEBHOOK_KEY` | Inbound webhook validation if PracticeQ posts directly to Mission WLW | `app/api/webhooks/practiceq/route.ts`, `lib/webhook-auth.ts` | Present on live `mission-wlw`; not currently used by PracticeQ while AppSheet remains pharmacy gateway | Keep configured for later direct webhook use. Do not point PracticeQ directly here until AppSheet is connected through the official API or a forwarding bridge. |

Webhook URL currently configured in PracticeQ while AppSheet remains the pharmacy gateway:
- `https://script.google.com/macros/s/AKfycbyrWN7rWE3-gcGaQpx4xT0KGBeWEKWwl6U0vs6h2JfFRp98tqe92BTZZT7kx7JFfNxU/exec`

Future direct Mission WLW webhook URL after AppSheet API access is available:
- `https://<production-domain>/api/webhooks/practiceq?key=<PRACTICEQ_WEBHOOK_KEY>`

PracticeQ Developer API page observed on May 26, 2026:
- API access is enabled in PracticeQ under `More > Settings > Integrations > Developer API`.
- Current maximum request rate is `10 requests/min - 500/daily`; avoid bulk live fetches from list pages.
- The PracticeQ account currently has the Intake Form Webhook URL pointed at a Google Apps Script endpoint that feeds the AppSheet gateway. Keep this in place while AppSheet is the pharmacy/order gateway.
- Admin/provider PracticeQ detail panels fetch live data server-side with `PRACTICEQ_API_KEY`; the key must never be exposed to browser code.

## Life File

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `USE_REAL_LIFEFILE` | Enables real pharmacy submission | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Set deliberately. |
| `LIFEFILE_API_USERNAME`, `LIFEFILE_API_PASSWORD` | Basic auth | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Secret required. |
| `LIFEFILE_BASE_URL` | Life File API host | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Verify production vs sandbox host. |
| `LIFEFILE_VENDOR_ID`, `LIFEFILE_LOCATION_ID`, `LIFEFILE_API_NETWORK_ID` | Required Life File headers | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Required. |
| `LIFEFILE_PRACTICE_ID` | Practice reference | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Required. |
| `LIFEFILE_PRESCRIBER_NPI`, `LIFEFILE_PRESCRIBER_FIRST_NAME`, `LIFEFILE_PRESCRIBER_LAST_NAME`, `LIFEFILE_PRESCRIBER_PHONE`, `LIFEFILE_PRESCRIBER_EMAIL` | Prescriber block | `lib/service-config.ts`, `services/lifefile.ts` | NPI/name/email present; phone missing in Vercel env list | Add real prescriber phone and verify all prescriber data. Code has unsafe fallback placeholders if phone is missing. |
| `LIFEFILE_PRESCRIBER_LICENSE_NUMBER`, `LIFEFILE_PRESCRIBER_LICENSE_STATE` | License metadata | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Sent in the Life File prescriber payload. |
| `LIFEFILE_SHIPPING_SERVICE_ID` | Shipping service | `lib/service-config.ts`, `services/lifefile.ts` | Present in Production, Development | Required. |
| `LIFEFILE_WEBHOOK_SECRET` | Inbound webhook signature | `app/api/webhooks/lifefile/route.ts`, `app/api/webhooks/lifefile/order/[orderId]/status/route.ts` | Required/configured for production webhook rollout | Required before accepting real webhooks. Production webhook routes fail closed if missing. Share only the endpoint with the pharmacy; keep this secret private. |
| `PHARMACY_WEBHOOK_USERNAME` | Basic Auth username for pharmacy tracking webhook | `app/api/webhooks/pharmacy/tracking/route.ts`, `lib/webhook-auth.ts` | Required/configured for production rollout | Share with pharmacy. Rotate if exposed. |
| `PHARMACY_WEBHOOK_PASSWORD` | Basic Auth password for pharmacy tracking webhook | `app/api/webhooks/pharmacy/tracking/route.ts`, `lib/webhook-auth.ts` | Required/configured for production rollout | Share with pharmacy through a secure channel. Rotate if exposed. |
| `PHARMACY_PROVIDER` | Selects pharmacy dispatch integration | `services/pharmacy.ts` | Required/configured as `appsheet` for AppSheet rollout | Must be set anywhere pharmacy dispatch can run, including Vercel and the PracticeQ Render worker. |
| `USE_REAL_APPSHEET` | Enables live AppSheet writes | `services/appsheet.ts` | Required/configured as `true` for AppSheet rollout | Without this, AppSheet dispatch stays in mock mode. |
| `APPSHEET_ID` | AppSheet pharmacy gateway app id | `services/appsheet.ts` | Required/configured for production rollout | Store as secret/config. Do not hardcode in source. |
| `APPSHEET_API_KEY` | AppSheet API auth | `services/appsheet.ts` | Required/configured for production rollout | Store as secret. Rotate if exposed outside secure channels. |
| `APPSHEET_BASE_URL` | AppSheet API base override | `services/appsheet.ts` | Optional/defaults to `https://www.appsheet.com` | Keep default unless AppSheet provides a different API host. |
| `USE_PHARMACY_TRACKING_SCRIPT` | Enables Google Apps Script tracking bridge | `services/pharmacy-tracking-script.ts`, `app/api/cron/pharmacy-tracking-sync/route.ts` | Missing | Set to `true` after the script endpoint is ready for sync/forward payloads. |
| `PHARMACY_TRACKING_SCRIPT_URL` | Google Apps Script endpoint pharmacy is using for tracking | `services/pharmacy-tracking-script.ts` | Missing | Store from the pharmacy-provided webhook details. Do not hardcode. |
| `PHARMACY_TRACKING_SCRIPT_USERNAME` | Basic auth username for script endpoint | `services/pharmacy-tracking-script.ts` | Missing | Store as secret. Rotate because it was shared in screenshot/chat. |
| `PHARMACY_TRACKING_SCRIPT_PASSWORD` | Basic auth password for script endpoint | `services/pharmacy-tracking-script.ts` | Missing | Store as secret. Rotate because it was shared in screenshot/chat. |

Webhook URL:
- Basic Auth pharmacy tracking endpoint:
  `POST https://<production-domain>/api/webhooks/pharmacy/tracking`
- `https://<production-domain>/api/webhooks/lifefile`
- Raw Life File-style order status URL:
  `https://<production-domain>/api/webhooks/lifefile/order/{orderId}/status`
- Google Apps Script sync bridge:
  `GET/POST https://<production-domain>/api/cron/pharmacy-tracking-sync`

The provided Life File OpenAPI PDF does not document inbound webhooks or a polling/read endpoint for order status. It only documents `POST /order`, `PUT /order/{orderId}/status`, and `PUT /order/{orderId}/shipping`. Status callbacks require separate Life File/1stChoiceRx confirmation.

## Spruce

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `USE_REAL_SPRUCE` | Enables real Spruce messaging | `lib/service-config.ts`, `services/spruce.ts`, `services/spruce.server.ts` | Present in Production, Development | Set deliberately. |
| `SPRUCE_API_KEY`, `SPRUCE_ACCESS_ID` | Basic auth fallback | `services/spruce.ts`, `services/spruce.server.ts` | Present in Production, Development | Required unless `SPRUCE_AUTH_TOKEN` is used. |
| `SPRUCE_AUTH_TOKEN` | Bearer auth | `services/spruce.ts`, `services/spruce.server.ts` | Present in Production | Preferred if issued by Spruce. |
| `SPRUCE_INTERNAL_ENDPOINT_ID` | Conversation endpoint | `services/spruce.ts`, `services/spruce.server.ts` | Present in Production | Required to avoid endpoint discovery failures. |
| `SPRUCE_BASE_URL` | API base URL | `lib/service-config.ts`, `services/spruce.server.ts` | Missing; defaults to `https://api.sprucehealth.com/v1` | Optional if default is correct. |
| `SPRUCE_WEBHOOK_SECRET` | Inbound webhook signature | `app/api/webhooks/spruce/route.ts` | Missing in Vercel env list | Required before accepting real webhooks. Production webhook route now fails closed if missing. |

Webhook URL:
- `https://<production-domain>/api/webhooks/spruce`

## AI / Identity

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | AI chat, summaries, eligibility, identity verification | `app/api/ai/*`, `services/identity-verification.ts` | Present in Production | Required for real AI features. |
| `ANTHROPIC_MODEL` | Optional model override | `services/identity-verification.ts` | Missing | Defaults to `claude-opus-4-6`. Confirm model availability/cost before production. |

## Cron

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `CRON_SECRET` | Protects `/api/cron/identity-reminders` | `app/api/cron/identity-reminders/route.ts`, `vercel.json` | Required/configured for production rollout | Production cron route fails closed if this is missing. |

Cron URL:
- `GET/POST https://<production-domain>/api/cron/identity-reminders`

## Storage Buckets

Identity upload storage now has a production storage boundary. In production, `app/api/identity/upload/route.ts` and `app/api/payments/charge/route.ts` refuse identity media before persistence/payment unless `IDENTITY_STORAGE_PROVIDER` is configured.

| Value | Required for | Used in | Current status | Production note |
| --- | --- | --- | --- | --- |
| `IDENTITY_STORAGE_PROVIDER` | Selects identity media storage backend | `services/identity-storage.ts` | Missing | Set to `s3` for production. `database` is rejected in production. |
| `IDENTITY_STORAGE_BUCKET` | Private identity media bucket | `services/identity-storage.ts` | Missing | Required for `IDENTITY_STORAGE_PROVIDER=s3`. Use a BAA-covered bucket. |
| `IDENTITY_STORAGE_REGION` | S3 signing region | `services/identity-storage.ts` | Missing | Required for `IDENTITY_STORAGE_PROVIDER=s3`. |
| `IDENTITY_STORAGE_ACCESS_KEY_ID` | S3 write credential | `services/identity-storage.ts` | Missing | Required for `IDENTITY_STORAGE_PROVIDER=s3`. Use least-privilege write/read lifecycle permissions. |
| `IDENTITY_STORAGE_SECRET_ACCESS_KEY` | S3 write credential secret | `services/identity-storage.ts` | Missing | Required for `IDENTITY_STORAGE_PROVIDER=s3`. |
| `IDENTITY_STORAGE_ENDPOINT` | S3-compatible endpoint override | `services/identity-storage.ts` | Optional | Leave unset for AWS S3. |
| `IDENTITY_STORAGE_FORCE_PATH_STYLE` | S3-compatible path-style addressing | `services/identity-storage.ts` | Optional | Only needed for some S3-compatible providers. |

## Current Button/Flow Guardrails

- Public product, questionnaire, and status pages now load through server API routes.
- Admin product buttons now call authenticated server routes and surface database errors.
- Checkout payment is visibly disabled unless Intuit client-side payment tokenization is configured.
- Checkout refuses identity media before charging when production object storage is not configured.
- Browser-only CMS editing is disabled until content is persisted server-side and rendered by the public site.
- Refill and dose-increase requests are disabled until a real refill/payment/pharmacy workflow is implemented.

Production requirement:
- Add the BAA-covered private object storage credentials above.
- Store only signed/private object references in Postgres for new identity uploads.
- Add malware/file type/size validation and retention cleanup.

## Deployment Settings

| Setting | Current | Production requirement |
| --- | --- | --- |
| Framework | Next.js | OK. |
| Build command | `npm run build` | OK. |
| Install command | `npm install` | OK, though `npm ci` is preferred for CI determinism. |
| Region | `iad1` | Confirm acceptable for data residency and latency. |
| Node version | Vercel project metadata shows Node `24.x` | Confirm runtime support. Consider pinning an LTS version in Vercel/project settings. |
| Security headers | `next.config.ts` | Good baseline. CSP currently allows `unsafe-inline`/`unsafe-eval`; tighten after payment/tokenization scripts are finalized. |

