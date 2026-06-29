# Admin Paid Orders Only Design

## Problem

Order Management currently loads every order and hides only orders with a failed
payment. A checkout attempt can be persisted as `processing` with a `pending`
payment before a charge succeeds, so unpaid attempts appear beside paid orders.

## Decision

Order Management will show only orders whose `paymentStatus` is `completed`.
Refund behavior is out of scope because the business does not issue refunds.

## Design

Add one shared paid-order visibility predicate. Apply it in the admin dashboard
API before search and pagination so totals and page boundaries describe paid
orders only. Apply the same predicate defensively in the client in case local
fallback data is used.

Remove the "Show payment declined" control and its state because exposing unpaid
orders conflicts with the paid-only requirement. The separate abandoned-checkout
and payment-link workflows remain unchanged.

## Verification

Unit tests will cover completed, pending, failed, draft, and cancelled orders.
A page contract test will verify that the paid-only predicate is used and the
declined-payment control is absent. The focused tests, TypeScript check, and full
test suite will be run. One unrelated PracticeQ notification test is already
failing on the baseline and will be reported separately if it remains.
