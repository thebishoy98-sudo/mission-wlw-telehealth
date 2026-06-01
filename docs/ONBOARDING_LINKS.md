# Mission WLW Onboarding Links

Last updated: 2026-06-01

This runbook lists the operational links for the current Render deployment. Do not commit passwords, API keys, refresh tokens, or pharmacy credentials into this file. Passwords are stored in Render environment variables or the owner password vault.

## Current Mode

| Area | Current setting |
| --- | --- |
| Website | `https://mission-wlw-web.onrender.com` |
| Pharmacy provider | LifeFile |
| LifeFile mode | Sandbox |
| Payment mode | QuickBooks payments off, bypass enabled |
| PracticeQ | Enabled, PHI source of truth |
| Identity media | PracticeQ-backed storage |

## Customer Links

| Purpose | Link | Notes |
| --- | --- | --- |
| Public home page | `https://mission-wlw-web.onrender.com/` | Marketing/home entry point. |
| Products / place order | `https://mission-wlw-web.onrender.com/products` | Recommended customer start link. |
| Direct order intake | `https://mission-wlw-web.onrender.com/start/info` | Skips product landing and starts checkout intake. |
| Patient login / order history | `https://mission-wlw-web.onrender.com/login` | Phone OTP login. Login page is patient-only. |
| Direct patient login | `https://mission-wlw-web.onrender.com/login/patient?next=/patient` | Use when sending a patient back to order history. |
| Legacy status link | `https://mission-wlw-web.onrender.com/status` | Redirects to patient phone login. |
| Terms | `https://mission-wlw-web.onrender.com/terms` | Public legal terms. |
| Privacy | `https://mission-wlw-web.onrender.com/privacy` | Public privacy notice. |

## Provider Links

| Purpose | Link / Login | Notes |
| --- | --- | --- |
| Provider login | `https://mission-wlw-web.onrender.com/login/provider` | Direct staff URL. Not shown on main `/login`. |
| Provider dashboard | `https://mission-wlw-web.onrender.com/provider` | Shows all orders and lets provider mark charts reviewed. |
| Provider email | `Dotson@missionwlw.com` | Password is stored in Render env `PROVIDER_PASSWORD`. |
| Provider chart | `https://mission-wlw-web.onrender.com/provider/patients/{patientId}?orderId={orderId}` | Open from provider dashboard; do not hand-type unless debugging. |

Provider role rules:

- Provider can view charts, identity evidence, consent certificate, PracticeQ chart, and pharmacy/order details.
- Provider can mark one chart reviewed or mark all reviewed.
- Provider does not approve/deny orders and does not send orders to pharmacy.

## Admin Links

| Purpose | Link / Login | Notes |
| --- | --- | --- |
| Admin login | `https://mission-wlw-web.onrender.com/login/admin` | Direct admin URL. Not shown on main `/login`. |
| Admin dashboard | `https://mission-wlw-web.onrender.com/admin` | Revenue/order overview. |
| Order management | `https://mission-wlw-web.onrender.com/admin/orders` | Search orders, view chart details, add tracking, dispatch eligible orders. |
| Product management | `https://mission-wlw-web.onrender.com/admin/products` | Product/dose/pricing management. |
| Notifications | `https://mission-wlw-web.onrender.com/admin/notifications` | Admin/Spruce notification settings. |
| Admin email | `admin@telehealth.com` | Password is stored in Render env `ADMIN_PASSWORD`. |

Admin role rules:

- Admin handles identity manual approval and pharmacy dispatch controls.
- Admin can add tracking numbers and trigger patient updates.
- Admin can view operational integration logs and PracticeQ chart links.

## PracticeQ

| Purpose | Link / Value | Notes |
| --- | --- | --- |
| Hosted intake form | `https://intakeq.com/new/yjvht0` | Background automation fills/submits this form for new orders. |
| PracticeQ API base | `https://intakeq.com/api/v1` | Current `PRACTICEQ_BASE_URL`. |
| Wake endpoint | `https://mission-wlw-web.onrender.com/api/practiceq/wake` | Used to wake/check the remote PracticeQ worker. |
| PracticeQ chart source | Provider/admin chart screens | Mission stores minimal local refs after PracticeQ files attach. |

Important PracticeQ note:

- PracticeQ standard API limits are low. Avoid running many chart/order-detail checks in parallel.
- New-order automation should complete PracticeQ and attach Mission chart files before local PHI purge.

## Pharmacy / LifeFile Sandbox

| Purpose | Link / Value | Notes |
| --- | --- | --- |
| Active pharmacy mode | Sandbox | `LIFEFILE_ENVIRONMENT=sandbox`. |
| LifeFile sandbox API endpoint | `https://host100-7.lifefile.net/lfapi/v1/order` | Current order API endpoint. |
| LifeFile sandbox base URL | `https://host100-7.lifefile.net/lfapi/v1` | Current API base. |
| Pharmacy webhook | `https://mission-wlw-web.onrender.com/api/webhooks/lifefile` | Inbound LifeFile-style status webhooks. |
| Order-specific status webhook | `https://mission-wlw-web.onrender.com/api/webhooks/lifefile/order/{orderId}/status` | Inbound status update path. |
| Tracking webhook | `https://mission-wlw-web.onrender.com/api/webhooks/pharmacy/tracking` | Stable inbound tracking update path. |
| Tracking sync cron/manual bridge | `https://mission-wlw-web.onrender.com/api/cron/pharmacy-tracking-sync` | Pulls/bridges tracking updates when configured. |

LifeFile sandbox account values are stored in Render env vars:

- `LIFEFILE_VENDOR_ID`
- `LIFEFILE_LOCATION_ID`
- `LIFEFILE_API_NETWORK_ID`
- `LIFEFILE_PRACTICE_ID`
- `LIFEFILE_USERNAME`
- `LIFEFILE_PASSWORD`

Do not send real patient orders while `LIFEFILE_ENVIRONMENT=sandbox`. The production LifeFile endpoint is not active in the current configuration.

## QuickBooks / Payments

| Purpose | Link / Value | Notes |
| --- | --- | --- |
| Current payment mode | Bypass / disabled | `USE_REAL_QUICKBOOKS=false`, `BYPASS_QB_PAYMENTS=true`, `NEXT_PUBLIC_QB_PAYMENTS_ENABLED=false`. |
| QuickBooks OAuth start | `https://mission-wlw-web.onrender.com/api/auth/qb/start` | Admin-only route for connecting QuickBooks. |
| QuickBooks callback | `https://mission-wlw-web.onrender.com/api/auth/qb/callback` | Must match Intuit redirect URI exactly. |
| QuickBooks status | `https://mission-wlw-web.onrender.com/api/admin/quickbooks/status` | Admin-only API status check. |

Before real customer launch:

- Enable real QuickBooks payments in Render.
- Confirm Intuit hosted/tokenized card flow works in production.
- Run one controlled low-dollar live payment test.

## Render / Deployment

| Purpose | Value |
| --- | --- |
| GitHub repo | `https://github.com/thebishoy98-sudo/mission-wlw-telehealth` |
| Web service | `mission-wlw-web` on Render |
| Remote PracticeQ worker | Render worker service configured separately |
| Production URL | `https://mission-wlw-web.onrender.com` |

Operational secrets live in Render env vars. Examples:

- `ADMIN_PASSWORD`
- `PROVIDER_PASSWORD`
- `ADMIN_SECRET`
- `PRACTICEQ_API_KEY`
- `LIFEFILE_*`
- `QB_*`
- `SPRUCE_*`
- `ANTHROPIC_API_KEY`

## Test / Smoke Commands

Run from the repo root:

```powershell
npm test -- --runInBand
npm run build
npm run smoke:launch
npm run smoke:customer-practiceq
```

Smoke tests need the correct local env values or temporary shell env variables:

- `E2E_BASE_URL=https://mission-wlw-web.onrender.com`
- `E2E_ADMIN_SECRET`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_PROVIDER_EMAIL`
- `E2E_PROVIDER_PASSWORD`

## Launch Gate

The app currently passes sandbox smoke testing, but it is not configured for real public launch while these are true:

- LifeFile is sandbox.
- QuickBooks payments are bypassed/off.

Switch those only when the owner explicitly approves a production cutover.
