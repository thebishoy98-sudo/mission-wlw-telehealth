# AI Identity Verification and Pharmacy Dispatch Gate

## Goal

Allow patients to complete payment even if they skip ID and selfie video upload, while preventing pharmacy dispatch until identity is verified by AI or manually approved by provider/admin.

## Core Rules

- Payment can complete without ID/video.
- LifeFile dispatch must not happen until identity is verified or manually approved.
- Missing, failed, or uncertain identity verification moves the order to provider/admin review.
- Spruce sends the patient a reminder with a link to complete ID and video upload.
- Provider/admin can manually approve and release the order to pharmacy.

## Order Flow

1. Patient completes intake, consent, and optional upload step.
2. Patient pays.
3. Payment is captured through QuickBooks sandbox/dev configuration.
4. The app evaluates identity verification state:
   - If ID and video are present and AI passes, the order can dispatch to LifeFile.
   - If ID/video are missing, failed, or uncertain, the order becomes `pending_review` and `pharmacyStatus` stays `draft`.
5. Spruce sends a reminder SMS with a link to the upload page when uploads are missing.
6. Provider/admin dashboards show blocked orders and the identity reason.
7. Provider/admin can manually approve; after approval, pharmacy dispatch is allowed.

## Data Model

Add identity verification tracking to orders or a related verification record:

- `identityStatus`: `missing`, `pending`, `verified`, `needs_review`, `rejected`, `manual_approved`
- `identityReason`: short machine-readable reason for blocking/review
- `identityReviewedAt`
- `identityReviewedBy`
- `identityAiResult`: structured AI output with confidence, summary, and flags

Uploads remain separate records:

- `driver_license`
- `selfie_video`

The upload records should be persisted server-side, not only as browser state.

## Patient Upload Page

Create a resumable upload route for patients who skipped verification:

- Accept order identifier/token from reminder link.
- Upload ID photo.
- Upload or record selfie video.
- Submit uploads for AI verification.
- Show a simple confirmation after submission.

The page should avoid exposing admin/provider data and should only let a patient complete uploads for their own order token.

## AI Verification

Internal AI-assisted verification will compare the ID image against a representative selfie/video frame.

Outcomes:

- Pass: set `identityStatus=verified`.
- Uncertain: set `identityStatus=needs_review`.
- Fail: set `identityStatus=rejected`.

Any non-pass outcome keeps `pharmacyStatus=draft` and appears in provider/admin review.

## Spruce Reminder

When payment completes and uploads are missing:

- Send SMS via Spruce using the configured Spruce credential.
- Include a secure upload link.
- Message should say payment was received and identity upload is needed before pharmacy processing can continue.

Spruce failures should not undo payment. They should create an integration error log and keep the order blocked for manual follow-up.

## Provider/Admin UX

Provider/admin views should show:

- Identity status.
- Whether ID/video are missing.
- AI result summary and flags.
- Manual approve/reject controls.
- Pharmacy dispatch action only when identity is verified or manually approved.

## Safety

- Do not dispatch to LifeFile while identity is missing, uncertain, or rejected.
- Do not refund automatically.
- Do not rely on client-side upload flags.
- Do not expose raw credentials in source control.
- Use Vercel env vars for Spruce and AI credentials.

## Verification

Manual QA should cover:

- Patient skips upload, pays, receives reminder, no LifeFile order is created.
- Patient follows link, uploads files, AI passes, LifeFile order is created.
- AI fails/uncertain, order stays blocked and appears in provider/admin review.
- Provider manually approves, LifeFile order is created.
- Spruce failure logs error but does not dispatch pharmacy.
