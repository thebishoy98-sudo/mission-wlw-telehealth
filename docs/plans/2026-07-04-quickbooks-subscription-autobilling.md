# QuickBooks Subscription Auto-Billing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore successful initial purchases with saved QuickBooks cards, automatically charge subscriptions on day 49, and support supplemental dose-increase charges and shipments.

**Architecture:** Use Intuit's durable card ID through the top-level `cardOnFile` charge field and a stable request ID for payment idempotency. Checkout saves and charges the card before persisting enrollment; the due-subscription cron charges and fulfills automatically; the shared Subscription tab exposes dose updates and post-charge supplemental adjustments through the provider subscription API.

**Tech Stack:** Next.js App Router, TypeScript, React, Jest/ts-jest, QuickBooks Payments REST API, PostgreSQL persistence.

---

### Task 1: Correct stored-card charge requests

**Files:**
- Modify: `services/quickbooks-payments.ts:275-354`
- Test: `__tests__/services/quickbooks-payments.test.ts`

**Step 1: Write the failing stored-card payload test**

Add a live-mode mocked-fetch test that calls `chargeStoredCard` with a card ID
and asserts the JSON request contains:

```ts
{
  amount: "299.00",
  currency: "USD",
  capture: true,
  cardOnFile: "card-123",
}
```

Assert the request does not contain `card: { id: ... }` and does not expose the
customer ID or card metadata.

**Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- --runInBand __tests__/services/quickbooks-payments.test.ts
```

Expected: FAIL because the implementation currently sends `card.id`.

**Step 3: Implement the minimal payload correction**

Replace the stored-card request's `card` object with:

```ts
cardOnFile: details.cardId,
```

Retain amount, currency, capture, and ecommerce context. Add an optional stable
`requestId` to the input and use it for the `Request-Id` header.

**Step 4: Run the test to verify it passes**

Run the same targeted command. Expected: PASS.

**Step 5: Commit**

```powershell
git add -- services/quickbooks-payments.ts __tests__/services/quickbooks-payments.test.ts
git commit -m "fix(payments): charge QuickBooks cards on file correctly"
```

### Task 2: Restore save-and-enroll checkout by default

**Files:**
- Modify: `app/api/payments/charge/route.ts:427-479`
- Modify: `__tests__/app/api/payments/charge.test.ts`
- Test: `__tests__/lib/subscription-enroll.test.ts` or a new focused checkout contract test

**Step 1: Write the failing checkout test**

Assert that a tokenized, non-bypassed initial checkout attempts
`storeCardAndChargeStored` by default and does not require
`QB_SAVE_CARD_AT_CHECKOUT`. Assert that successful stored-card charging records
card metadata and enrolls the order.

**Step 2: Run the test to verify it fails**

```powershell
npm test -- --runInBand __tests__/app/api/payments/charge.test.ts
```

Expected: FAIL on the temporary opt-in guard.

**Step 3: Restore default saved-card checkout**

Remove the temporary `QB_SAVE_CARD_AT_CHECKOUT` requirement. Do not retry the
consumed token if card creation succeeded and the stored-card charge failed;
return the payment error so the customer can safely retry checkout with a fresh
token.

**Step 4: Run the focused tests**

Expected: PASS with default enrollment and no consumed-token fallback.

**Step 5: Commit**

```powershell
git add -- app/api/payments/charge/route.ts __tests__/app/api/payments/charge.test.ts
git commit -m "fix(payments): save cards and enroll buyers by default"
```

### Task 3: Automatically charge and fulfill due subscriptions

**Files:**
- Modify: `app/api/cron/subscription-billing/route.ts:70-176`
- Modify: `services/quickbooks-payments.ts`
- Test: `__tests__/app/api/cron/subscription-billing.test.ts`

**Step 1: Write failing cron behavior tests**

Cover:

- a due subscription with consent and a saved card is charged at its current
  dose price;
- the refill is fulfilled only after capture;
- the cycle advances after success;
- a failed charge is not dispatched and triggers the payment-link path;
- a retry reuses the refill order and the stable QuickBooks request ID.

**Step 2: Run the tests to verify they fail**

```powershell
npm test -- --runInBand __tests__/app/api/cron/subscription-billing.test.ts
```

Expected: FAIL because the cron currently creates a review hold instead of
charging.

**Step 3: Implement automatic billing**

Replace the normal review-hold branch with:

1. Reuse or create the cycle refill order.
2. Charge `patient.qbCardId` with request ID derived from the refill order.
3. Fulfill and dispatch only after capture.
4. Advance `coversThrough`, `nextRunAt`, `lastOrderId`, and `lastChargedAt`.
5. On failure, mark payment failed, log the sanitized error, send a payment
   link and staff alert, and schedule a dunning retry without dispatch.

Subscriptions without a saved card continue through the pay-link path.

**Step 4: Run focused cron and subscription tests**

```powershell
npm test -- --runInBand __tests__/app/api/cron/subscription-billing.test.ts __tests__/lib/subscription.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add -- app/api/cron/subscription-billing/route.ts services/quickbooks-payments.ts __tests__/app/api/cron/subscription-billing.test.ts
git commit -m "feat(subscriptions): autocharge refills at week seven"
```

### Task 4: Add dose adjustment calculation and API operations

**Files:**
- Create: `lib/subscription-adjustment.ts`
- Create: `__tests__/lib/subscription-adjustment.test.ts`
- Modify: `app/api/provider/subscriptions/route.ts`
- Test: `__tests__/app/api/provider/subscriptions.test.ts`

**Step 1: Write failing pure calculation tests**

Define and test a helper that:

```ts
calculateSupplementalCharge({
  previousCharge: 299,
  newDosePrice: 399,
  overrideAmount: undefined,
  overrideReason: undefined,
})
```

returns `100`, rejects non-positive differences, accepts a positive override
only with a non-empty reason, and rounds currency to cents.

**Step 2: Run the helper test to verify it fails**

```powershell
npm test -- --runInBand __tests__/lib/subscription-adjustment.test.ts
```

Expected: FAIL because the helper does not exist.

**Step 3: Implement the pure calculation helper**

Implement only the validated calculation and override rules.

**Step 4: Run the helper tests**

Expected: PASS.

**Step 5: Write failing provider API tests**

Cover two actions:

- `update_dose`: changes `subscription.doseId` before billing without charging;
- `charge_dose_adjustment`: resolves the prior completed refill payment,
  calculates/validates the difference, charges the saved card with an
  adjustment-order idempotency key, dispatches supplemental medication after
  capture, and updates the subscription dose.

Also assert failed charges do not dispatch or update the dose.

**Step 6: Run the API tests to verify they fail**

```powershell
npm test -- --runInBand __tests__/app/api/provider/subscriptions.test.ts
```

Expected: FAIL because both actions are absent.

**Step 7: Implement the API actions**

Use existing authentication, database, QuickBooks, fulfillment, notification,
and integration-log services. Store the adjustment reason and prior charge
reference in sanitized integration-log details.

**Step 8: Run helper and API tests**

Expected: PASS.

**Step 9: Commit**

```powershell
git add -- lib/subscription-adjustment.ts __tests__/lib/subscription-adjustment.test.ts app/api/provider/subscriptions/route.ts __tests__/app/api/provider/subscriptions.test.ts
git commit -m "feat(subscriptions): support supplemental dose charges"
```

### Task 5: Update the shared Subscription tab

**Files:**
- Modify: `components/subscriptions/SubscriptionsManager.tsx`
- Create or modify: `__tests__/app/subscriptions-manager-contract.test.ts`

**Step 1: Write the failing UI contract test**

Assert the manager exposes:

- editing the active dose before billing;
- a post-charge “Increase dose / add medication” action;
- calculated difference display;
- optional override amount;
- required override reason;
- confirmation text stating that payment and supplemental dispatch occur.

**Step 2: Run the test to verify it fails**

```powershell
npm test -- --runInBand __tests__/app/subscriptions-manager-contract.test.ts
```

Expected: FAIL because the adjustment UI is absent.

**Step 3: Implement the minimal UI**

Add row-scoped forms for `update_dose` and `charge_dose_adjustment`. Surface
server-calculated amounts and errors; disable duplicate submissions while a
request is active; reload the row after success. Update week-seven text to say
billing and fulfillment are automatic.

**Step 4: Run the UI contract test**

Expected: PASS.

**Step 5: Commit**

```powershell
git add -- components/subscriptions/SubscriptionsManager.tsx __tests__/app/subscriptions-manager-contract.test.ts
git commit -m "feat(subscriptions): add dose adjustment controls"
```

### Task 6: Verify checkout, billing, and deployment readiness

**Files:**
- Verify only

**Step 1: Run all payment and subscription tests**

```powershell
npm test -- --runInBand __tests__/services/quickbooks-payments.test.ts __tests__/app/api/payments/charge.test.ts __tests__/app/api/cron/subscription-billing.test.ts __tests__/app/api/provider/subscriptions.test.ts __tests__/lib/subscription.test.ts __tests__/lib/subscription-adjustment.test.ts __tests__/app/subscriptions-manager-contract.test.ts
```

Expected: all selected suites pass.

**Step 2: Run repository verification**

```powershell
npm run lint -- --no-cache
npm run build
```

Expected: both exit 0.

Run the full Jest suite excluding the untracked `.worktrees` directory and
report any unrelated baseline failures exactly.

**Step 3: Run a safe QuickBooks smoke test**

Confirm whether the environment is sandbox or production without printing
credentials. Use sandbox when configured. In production, require the existing
test-charge override and a designated test customer/order before submitting any
charge. Validate card creation, stored-card charge capture, and persistence.

**Step 4: Review and push**

Inspect the final diff and commit history, fetch `origin/main`, resolve only
in-scope conflicts, and push `main`.
