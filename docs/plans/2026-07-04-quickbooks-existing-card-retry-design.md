# QuickBooks Existing-Card Retry Design

## Problem

A checkout can save a card in QuickBooks and then fail before the application
persists the returned card ID. Retrying checkout finds the existing QuickBooks
customer, calls `createFromToken` again, and receives "card already exists."
The customer cannot complete payment.

## Design

Before creating a card, checkout lists all cards attached to the QuickBooks
customer. If any valid card exists, it reuses that card and does not consume the
new checkout token. Only a customer with no saved cards uses
`createFromToken`.

The card-list request uses:

```text
GET /quickbooks/v4/customers/{customerId}/cards
```

If card creation reports a duplicate because another request created the card
between the list and create calls, checkout lists cards again and reuses the
existing card.

## Payment fallbacks

- Existing card found: charge it through `cardOnFile`.
- No card found: create the card from the token, then charge it.
- Card lookup fails before token consumption: use the one-time token charge,
  complete checkout, enroll without automatic charging, and log an alert.
- Card creation fails: attempt the one-time token charge. It can succeed only
  when Intuit did not consume the token.
- Stored-card charge fails after card creation: do not reuse the consumed token.
  Return the real charge error.

Payment, enrollment, or dispatch is never marked successful without a captured
QuickBooks charge. Bank declines and complete QuickBooks outages cannot be
guaranteed to succeed.

## Verification

Tests cover existing-card reuse, no unnecessary card creation, no-card
creation, duplicate race recovery, pre-consumption one-time fallback, and the
consumed-token safety boundary.
