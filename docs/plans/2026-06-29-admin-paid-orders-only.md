# Admin Paid Orders Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show only successfully paid orders in Admin Order Management.

**Architecture:** A shared pure predicate defines paid-order visibility. The admin dashboard API filters with it before search and pagination, while the client applies it defensively to API or local fallback data.

**Tech Stack:** Next.js, React, TypeScript, Jest

---

### Task 1: Define paid-order visibility with tests

**Files:**
- Create: `lib/admin-order-visibility.ts`
- Create: `__tests__/lib/admin-order-visibility.test.ts`

**Step 1: Write the failing test**

Test that an order with `paymentStatus: "completed"` is visible and orders with
`pending`, `failed`, or `refunded` statuses are not.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/lib/admin-order-visibility.test.ts`
Expected: FAIL because `lib/admin-order-visibility.ts` does not exist.

**Step 3: Write minimal implementation**

Export:

```ts
export function isPaidAdminOrder(order: Pick<Order, "paymentStatus">): boolean {
  return order.paymentStatus === "completed";
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand __tests__/lib/admin-order-visibility.test.ts`
Expected: PASS.

### Task 2: Filter API results before pagination

**Files:**
- Modify: `app/api/admin/dashboard/route.ts`
- Modify: `__tests__/app/admin-dashboard-loading-contract.test.ts`

**Step 1: Write the failing contract assertion**

Require the route to filter `sortedAllOrders` with `isPaidAdminOrder` before
searching, counting, and slicing pages.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/app/admin-dashboard-loading-contract.test.ts`
Expected: FAIL because the route does not use the predicate.

**Step 3: Write minimal implementation**

Import `isPaidAdminOrder`, derive paid orders from `sortedAllOrders`, and perform
search/pagination on that paid collection.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand __tests__/app/admin-dashboard-loading-contract.test.ts`
Expected: PASS.

### Task 3: Enforce paid-only client fallback

**Files:**
- Modify: `app/admin/orders/page.tsx`
- Modify: `__tests__/app/admin-orders-declined-filter-contract.test.ts`

**Step 1: Update the page contract test**

Require `visibleOrders` to use `isPaidAdminOrder`; reject
`showDeclinedOrders` and the "Show payment declined" label.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand __tests__/app/admin-orders-declined-filter-contract.test.ts`
Expected: FAIL because the old toggle remains.

**Step 3: Write minimal implementation**

Import the predicate, remove declined-payment state and checkbox, and set
`visibleOrders` to `orders.filter(isPaidAdminOrder)`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand __tests__/app/admin-orders-declined-filter-contract.test.ts`
Expected: PASS.

### Task 4: Verify the change

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `npm test -- --runInBand __tests__/lib/admin-order-visibility.test.ts __tests__/app/admin-dashboard-loading-contract.test.ts __tests__/app/admin-orders-declined-filter-contract.test.ts`
Expected: PASS.

**Step 2: Run TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 3: Run full tests**

Run: `npm test -- --runInBand`
Expected: All change-related tests pass; compare any failures with the recorded
baseline PracticeQ notification failure.

**Step 4: Review diff and commit**

Stage only the files listed above and commit with:

```text
fix: show only paid admin orders
```
