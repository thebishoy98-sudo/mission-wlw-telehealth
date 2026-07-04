# QuickBooks Existing-Card Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make checkout retry-safe by reusing an existing QuickBooks customer card and preserving a one-time token fallback before token consumption.

**Architecture:** Add a QuickBooks Payments card-list operation, then make subscription enrollment select an existing card before calling `createFromToken`. Return structured information about whether the token was consumed so the checkout route can safely choose the one-time fallback.

**Tech Stack:** Next.js App Router, TypeScript, Jest, QuickBooks Payments REST API.

---

### Task 1: List and reuse existing QuickBooks cards

**Files:**
- Modify: `services/quickbooks-payments.ts`
- Test: `__tests__/services/quickbooks-payments.test.ts`

**Step 1: Write failing tests**

Add mocked-fetch tests asserting `listCardsOnFile(customerId)` sends:

```text
GET /quickbooks/v4/customers/{customerId}/cards
```

and returns normalized card ID, last four digits, and brand.

**Step 2: Verify failure**

```powershell
npm test -- --runInBand __tests__/services/quickbooks-payments.test.ts
```

Expected: FAIL because `listCardsOnFile` does not exist.

**Step 3: Implement the card-list request**

Use the same OAuth token and card base URL as `storeCardOnFile`. Reject malformed
responses without exposing card data in errors.

**Step 4: Verify green**

Run the same test command. Expected: PASS.

### Task 2: Make save-and-charge retry-safe

**Files:**
- Modify: `lib/subscription-enroll.ts`
- Test: `__tests__/lib/subscription-enroll.test.ts`

**Step 1: Write failing tests**

Cover:

- any existing card is reused and `storeCardOnFile` is not called;
- no cards causes `storeCardOnFile` to run;
- duplicate creation causes a re-list and reuse;
- lookup failure is reported as safe for one-time fallback;
- failure after successful card creation is reported as token consumed.

**Step 2: Verify failure**

Run the focused test and confirm expected failures.

**Step 3: Implement minimal orchestration**

List cards first. Reuse the first valid card. Create only when none exist.
Track the token-consumption boundary in a typed error so callers cannot
accidentally reuse a consumed token.

**Step 4: Verify green**

Run the focused test. Expected: PASS.

### Task 3: Add the safe one-time checkout fallback

**Files:**
- Modify: `app/api/payments/charge/route.ts`
- Modify: `__tests__/app/api/payments/charge.test.ts`

**Step 1: Write failing checkout tests**

Assert pre-consumption card lookup/create failures fall through to
`qbPayments.chargeCard`, while post-creation charge failures return HTTP 402
without token reuse.

**Step 2: Verify failure**

Run the payment route tests and confirm expected failures.

**Step 3: Implement the fallback boundary**

Use the typed enrollment error to decide whether the token remains safe. Log
the fallback, charge once with the token, and enroll without a saved card after
capture.

**Step 4: Verify and release**

Run focused payment tests, the full Jest suite, lint, and production build.
Commit, push `main`, and confirm the remote commit.
