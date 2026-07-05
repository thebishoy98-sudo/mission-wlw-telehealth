# Database-Backed Referral Credits Design

## Problem

The confirmation page advertises “Give $50 off, earn $50 credit,” but the
current implementation only creates an affiliate tracking code. Checkout
stores `orders.ref_code` for reporting; it does not discount the referred
order, award credit, or spend credit on a later purchase.

The patient portal also constructs a different placeholder code in the
browser instead of loading the patient’s persisted referral record.

## Approved behavior

- A valid patient referral gives a friend $50 off their first successful order.
- If a promo code is also valid, checkout applies whichever discount is larger,
  never both.
- The referrer earns $50 only after the friend’s payment succeeds.
- Earned credit is automatically applied to the referrer’s next checkout,
  pay-link payment, or week-seven automatic subscription charge.
- Referral discount and credit cannot reduce a card charge below the existing
  $0.50 production payment floor.
- Self-referrals, repeat first-order discounts, duplicate rewards, duplicate
  credit spending, and patient-owned codes used as general affiliate codes are
  rejected.

## Data model

Extend `affiliates` with nullable `patient_id`. Admin-created affiliate links
remain analytics-only; only rows with `created_by = 'patient-referral'` and an
owner patient can produce the patient referral offer.

Add `referral_redemptions`, one row per referred patient:

- referral affiliate and referrer patient
- referred patient and successful referred order
- discount and earned-credit amounts
- unique referred patient and referred order constraints for idempotency

Add `referral_credit_ledger`, an immutable money ledger:

- patient, order, redemption, transaction type, and amount
- `earned` rows increase balance; `spent` rows decrease it
- unique earned redemption and spent order constraints prevent duplicates
- available balance is the sum of earned amounts minus spent amounts

Schema changes live in `lib/schema.sql`. Runtime `CREATE TABLE IF NOT EXISTS`
and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guards keep deployment safe for
the current migration model.

## Server behavior

`lib/referral-credit.server.ts` owns validation, quote calculation, earning,
spending, and balance reads. Pricing callers receive a quote containing the
winning discount source, amount to charge, available credit, and identifiers
needed to finalize only after payment capture.

Checkout resolves the canonical patient before calculating referral eligibility.
It compares the valid promo amount with the valid $50 friend discount, applies
the larger, and then applies any credit owned by the purchasing patient. After
the payment row is persisted, it consumes the winning promo when applicable,
records the friend redemption and earned referrer credit when applicable, and
records spent purchaser credit.

Subscription billing obtains the same credit quote before charging the stored
card. It records spending only after successful capture and passes the net
charged amount through fulfillment, accounting, messages, and logs. Failed
charges leave the credit untouched.

## Patient experience

The referral endpoint requires a paid order, derives the owner from that order,
and creates or returns one stable patient referral code. An authenticated
patient referral endpoint returns the real link and actual available balance.
The portal displays both. The post-purchase card continues to advertise the
offer only when a real persisted referral link is returned.

## Verification

Jest tests cover larger-discount selection, first-order and self-referral
validation, idempotent reward creation, balance calculation, post-capture
spending, failed-charge preservation, subscription credit application, secure
link ownership, and portal contracts. Full Jest, lint, and production build
must pass before merging and pushing `main`.
