# Comp Checkout And Pharmacy Dose Admin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let full-discount promo codes submit orders without card details, and let admins edit dose strength and pharmacy instructions that are sent to the pharmacy.

**Architecture:** Reuse existing product dose JSON fields: `strength` becomes the pharmacy vial/strength text and `prescriptionLabel` becomes the pharmacy directions/SIG. Add a comped payment branch in the existing payment route after server-side promo validation, so all identity, provider review, accounting, SMS, subscription, and pharmacy gates continue to run from the same workflow.

**Tech Stack:** Next.js App Router, TypeScript, Jest, existing Postgres-backed product JSON, QuickBooks Payments integration.

---

### Task 1: Add Failing Contracts

**Files:**
- Modify: `__tests__/lib/referral-pricing.test.ts`
- Modify: `__tests__/app/payment-page-copy-contract.test.ts`
- Modify: `__tests__/app/api/payments/charge.test.ts`
- Create or modify: `__tests__/app/admin-products-dose-pharmacy-contract.test.ts`

**Steps:**
1. Add a pricing test for a full promo discount returning `chargeAmount: 0`.
2. Add payment-page source contracts for `isCompedCheckout`, hidden card fields, and `Submit free order`.
3. Add route contracts that full-promo checkout skips QuickBooks charge and records a `promo_comp` payment.
4. Add admin page contract for editable dose `strength` and `prescriptionLabel`.
5. Run targeted tests and confirm they fail.

### Task 2: Implement Comp Checkout

**Files:**
- Modify: `lib/referral-pricing.ts`
- Modify: `types/index.ts`
- Modify: `app/start/payment/page.tsx`
- Modify: `app/api/payments/charge/route.ts`

**Steps:**
1. Allow `minimumCharge: 0` in pricing and use it only for full promo discounts.
2. On the payment page, detect `total <= 0 && appliedCode`, hide card fields, skip tokenization, allow submit, and send the promo code with the original `baseTotal`.
3. In the charge route, compute comp eligibility after promo validation. If `chargeAmount === 0`, create a completed `promo_comp` payment with no QuickBooks payment charge.
4. Keep downstream workflow unchanged except skip card-on-file enrollment/accounting charge assumptions where appropriate.

### Task 3: Implement Admin Dose Editing

**Files:**
- Modify: `app/admin/products/page.tsx`
- Existing APIs already persist `doses` JSON.

**Steps:**
1. Store the selected product's `doses` in form state when editing.
2. Render each dose with editable `label`, `strength`, `price`, and `prescriptionLabel`.
3. Send `doses` in the admin product PATCH/POST body.
4. Reset form state after save/cancel.

### Task 4: Verify And Ship

**Commands:**
- `npm test -- __tests__/lib/referral-pricing.test.ts __tests__/app/payment-page-copy-contract.test.ts __tests__/app/api/payments/charge.test.ts __tests__/app/admin-products-dose-pharmacy-contract.test.ts --runInBand`
- `npm test -- --runInBand`
- `npm run build`
- `git diff --check`
- Commit and push to `origin/main`.
