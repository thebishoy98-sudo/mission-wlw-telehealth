# Pharmacy Dispatch Idempotency and One-Vial Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure each paid order reaches the pharmacy at most once and always requests one correctly sized vial.

**Architecture:** The server database atomically claims a pharmacy dispatch before the shared adapter calls LifeFile or AppSheet. PracticeQ and the manual endpoint preserve or reject existing dispatch state. Pharmacy payload builders derive one vial's volume from the selected package.

**Tech Stack:** Next.js, TypeScript, PostgreSQL, Jest

---

### Task 1: Correct one-vial payloads

**Files:**
- Modify: `services/lifefile.ts`
- Modify: `services/appsheet.ts`
- Modify: `__tests__/services/lifefile.test.ts`
- Modify: `__tests__/services/lifefile-generic-path.test.ts`
- Modify: `__tests__/services/appsheet.test.ts`

Write failing tests for every tirzepatide and retatrutide package, verify failure,
then derive a single vial line with quantity one and the approved 1/2/3 mL
strength. Run all three focused service test files.

### Task 2: Add an atomic dispatch claim

**Files:**
- Modify: `lib/db.server.ts`
- Modify: `services/pharmacy.ts`
- Create: `__tests__/services/pharmacy-idempotency.test.ts`

Write failing tests proving an existing pharmacy order is returned without
calling the provider. Add `orderDb.claimPharmacyDispatch`, use it in the shared
adapter, and release failed claims. Verify focused tests.

### Task 3: Close the known duplicate path

**Files:**
- Modify: `app/api/orders/dispatch/route.ts`
- Modify: `app/api/webhooks/practiceq/route.ts`
- Modify: `__tests__/app/admin-orders-dispatch-action.test.ts`
- Create: `__tests__/app/pharmacy-dispatch-idempotency-contract.test.ts`

Write failing contract tests requiring manual duplicate rejection and forbidding
PracticeQ from unconditionally resetting pharmacy status. Implement the minimum
route changes and verify focused tests.

### Task 4: Verify and commit

Run:

```text
npm test -- --runInBand __tests__/services/lifefile.test.ts __tests__/services/lifefile-generic-path.test.ts __tests__/services/appsheet.test.ts __tests__/services/pharmacy-idempotency.test.ts __tests__/app/pharmacy-dispatch-idempotency-contract.test.ts
npx tsc --noEmit
npm test -- --runInBand
```

Compare the full suite with the recorded baseline PracticeQ notification
failure. Review the diff and commit the pharmacy fix separately.
