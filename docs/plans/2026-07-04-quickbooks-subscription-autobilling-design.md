# QuickBooks Subscription Auto-Billing Design

## Goal

Every successful initial checkout saves the customer's payment method with
QuickBooks, enrolls the customer in the eight-week subscription, and schedules
the next refill charge for day 49. Customers must be able to complete checkout
immediately. Staff must also be able to increase a subscription dose before or
after the automatic refill charge.

## QuickBooks payment flow

Checkout creates or finds the QuickBooks customer, exchanges the client token
for a durable card-on-file ID, and charges the initial order using that saved
card. QuickBooks expects the charge payload to contain the card ID in the
top-level `cardOnFile` field. The current `{ card: { id } }` payload is invalid
for a stored-card charge.

The application persists the QuickBooks customer ID, card ID, masked card
metadata, recurring consent, and subscription only after QuickBooks captures
the charge. It never stores a PAN or CVC.

## Week-seven automatic refill

The subscription cycle remains 56 days with a seven-day lead. The daily billing
job processes subscriptions whose `nextRunAt` is due:

1. Resolve the subscription's current dose and price.
2. Create or reuse one refill order for the cycle.
3. Charge the saved card with a stable idempotency key.
4. Only after capture, fulfill and dispatch the refill.
5. Advance coverage and the next billing date by one cycle.

If payment fails, no medication is dispatched. The system records the failure,
alerts staff, and sends the customer a payment link.

## Dose changes and supplemental charges

Before the week-seven charge, changing the subscription dose updates its
`doseId`. The automatic charge therefore uses the new dose price.

After the refill is charged, the Subscription tab supports a supplemental dose
adjustment:

1. Staff selects the new higher dose.
2. The server calculates `new dose price - amount already charged`.
3. Staff may override the calculated positive amount but must provide a reason.
4. The server charges the saved card using a unique adjustment order and stable
   idempotency key.
5. After capture, it creates and dispatches the supplemental medication order
   and updates the subscription dose.

Non-positive adjustments are rejected by this workflow. Refunds or dose
reductions remain separate operations.

## Consistency and failure handling

- Checkout, refill, and adjustment operations use deterministic idempotency
  keys so retries cannot create duplicate QuickBooks charges.
- A charge must be captured before payment records, cycle advancement, or
  pharmacy dispatch are finalized.
- Failed charges leave the order unpaid and undispatched.
- Integration logs record sanitized request context, QuickBooks request IDs,
  outcomes, and errors without card data.
- Existing payment-link fallback remains available when a stored card cannot be
  charged.

## Verification

Automated tests cover:

- the exact QuickBooks `cardOnFile` request payload;
- successful and failed stored-card charges;
- initial checkout saving the card and enrolling by default;
- day-49 automatic charging and fulfillment;
- pre-charge dose changes affecting the automatic price;
- post-charge difference calculation, override validation, supplemental
  charging, and dispatch;
- duplicate request protection.

Verification also includes payment-focused tests, lint, and a production build.
An external payment smoke test must use QuickBooks sandbox or the configured
test-charge override; it must not submit an uncontrolled live customer charge.
