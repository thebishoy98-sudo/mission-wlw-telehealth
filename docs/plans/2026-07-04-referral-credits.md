# Referral Credits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the advertised $50 friend discount and $50 referrer credit real, database-backed, automatic, and auditable.

**Architecture:** A single server module validates patient-owned referral codes, compares referral and promo discounts, calculates available ledger credit, and records idempotent post-payment ledger events. Checkout and subscription billing both use this module so credit is spent only after a successful card capture.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL via `@vercel/postgres`, Jest, QuickBooks Payments.

---

### Task 1: Add referral pricing rules

**Files:**
- Create: `lib/referral-pricing.ts`
- Test: `__tests__/lib/referral-pricing.test.ts`

**Step 1: Write failing tests**

Cover larger-of referral/promo selection, credit application after the winning
discount, the $0.50 payment floor, and zero/invalid balances.

**Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- --runInBand __tests__/lib/referral-pricing.test.ts
```

Expected: FAIL because the pricing module does not exist.

**Step 3: Implement minimal pure pricing functions**

Return the winning discount source, discount amount, credit amount, and final
charge without performing database work.

**Step 4: Run the test to verify it passes**

Run the focused command again. Expected: PASS.

**Step 5: Commit**

Commit the pricing rules and tests.

### Task 2: Add the referral database ledger

**Files:**
- Modify: `lib/schema.sql`
- Create: `lib/referral-credit.server.ts`
- Test: `__tests__/lib/referral-credit.server.test.ts`

**Step 1: Write failing tests**

Cover patient-owned code validation, self-referral rejection, existing paid
customer rejection, real balance calculation, idempotent redemption/earning,
and idempotent spending.

**Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- --runInBand __tests__/lib/referral-credit.server.test.ts
```

Expected: FAIL because the service and tables do not exist.

**Step 3: Implement schema and persistence**

Add `affiliates.patient_id`, `referral_redemptions`, and
`referral_credit_ledger`. Implement schema guards, offer lookup, balance lookup,
post-capture reward finalization, and post-capture credit spending with unique
constraints.

**Step 4: Run the test to verify it passes**

Run the focused command again. Expected: PASS.

**Step 5: Commit**

Commit the schema, service, and tests.

### Task 3: Secure and expose real referral links and balances

**Files:**
- Modify: `app/api/intake/referral/route.ts`
- Create: `app/api/patient/referral/route.ts`
- Modify: `app/patient/page.tsx`
- Modify: `app/start/confirmation/page.tsx`
- Test: `__tests__/app/api/intake/referral.test.ts`
- Test: `__tests__/app/api/patient/referral.test.ts`
- Test: `__tests__/app/referral-ui-contract.test.ts`

**Step 1: Write failing endpoint and UI tests**

Assert link creation derives the owner from a successfully paid order, returns
one stable code, rejects unverified orders, and the authenticated portal loads
the persisted link and numeric balance instead of constructing a browser code.

**Step 2: Verify the tests fail**

Run the three focused test files. Expected: FAIL on missing ownership, endpoint,
and balance UI behavior.

**Step 3: Implement the endpoints and UI**

Use the patient session for portal reads. Keep the confirmation endpoint
compatible with the existing post-payment call while resolving identity from
the canonical order.

**Step 4: Verify the tests pass**

Run the focused tests again. Expected: PASS.

**Step 5: Commit**

Commit referral ownership, API, UI, and tests.

### Task 4: Apply referral pricing to checkout

**Files:**
- Modify: `app/api/payments/charge/route.ts`
- Modify: `app/start/payment/page.tsx`
- Modify: `__tests__/app/api/payments/charge.test.ts`
- Create: `__tests__/app/referral-checkout-contract.test.ts`

**Step 1: Write failing checkout tests**

Cover a valid friend’s first-order discount, larger promo winning, larger
referral winning, self/refill/ineligible referral rejection, purchaser credit
application, reward finalization only after payment persistence, and no credit
spending after failed capture.

**Step 2: Verify the tests fail**

Run the focused payment tests. Expected: FAIL because checkout does not call the
referral service.

**Step 3: Integrate canonical server pricing**

Resolve the patient before final pricing. Use the original total as the pricing
base, apply only the winning acquisition discount, then owned credit. Persist
reward and spending events after successful payment persistence. Return the
pricing breakdown for confirmation and ensure the browser never decides the
charged amount.

**Step 4: Verify the tests pass**

Run the focused payment tests. Expected: PASS.

**Step 5: Commit**

Commit checkout integration and tests.

### Task 5: Apply credit to automatic subscription billing

**Files:**
- Modify: `app/api/cron/subscription-billing/route.ts`
- Modify: `__tests__/app/api/cron/subscription-billing.test.ts`

**Step 1: Write failing billing tests**

Assert available credit lowers the stored-card charge and fulfillment amount,
successful capture records the spend, failed capture records no spend, and
charge-only adjustments do not consume supply credit.

**Step 2: Verify the tests fail**

Run:

```powershell
npm test -- --runInBand __tests__/app/api/cron/subscription-billing.test.ts
```

Expected: FAIL because subscription billing charges the full amount.

**Step 3: Integrate referral credit**

Calculate the credit quote for normal refills, charge and fulfill the net
amount, and finalize the spend only after capture. Include the applied credit in
patient messages and integration logs.

**Step 4: Verify the tests pass**

Run the focused command again. Expected: PASS.

**Step 5: Commit**

Commit subscription integration and tests.

### Task 6: Verify and publish

**Files:**
- Review all modified files

**Step 1: Run focused referral tests**

Run every new and modified referral/payment/subscription test file.

**Step 2: Run full verification**

Run:

```powershell
npm test -- --runInBand
npm run lint
npm run build
```

Expected: all tests pass, lint exits zero, and the production build completes.

**Step 3: Review the diff and migration safety**

Confirm no unrelated files are included, no payment card data is persisted, all
credit writes occur post-capture, and schema guards are idempotent.

**Step 4: Merge and push**

Use `superpowers:finishing-a-development-branch`, merge the verified branch to
`main`, push `origin/main`, and confirm the remote commit.
