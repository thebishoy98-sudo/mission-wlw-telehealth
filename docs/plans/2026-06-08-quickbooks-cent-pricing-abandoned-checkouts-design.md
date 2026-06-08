# QuickBooks One-Cent Pricing and Abandoned Checkouts Design

## Approved Direction

Use visible one-cent product pricing during production QuickBooks testing.

All customer-facing product and dose prices will be changed to `$0.01`. The original production pricing and dose mapping will be preserved in a Markdown reference file so the prices can be restored after testing.

## QuickBooks Production Testing

The application will use real QuickBooks production credentials and production QuickBooks Payments. The payment amount will come from the selected product/dose price, which will be `$0.01` during testing.

Required Render environment posture:

- `USE_REAL_QUICKBOOKS=true`
- `BYPASS_QB_PAYMENTS=false`
- `NEXT_PUBLIC_QB_PAYMENTS_ENABLED=true`
- `NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT=production`
- production `QB_CLIENT_ID`
- production `QB_CLIENT_SECRET`
- production `QB_REALM_ID`
- production `QB_REFRESH_TOKEN`
- production `NEXT_PUBLIC_QB_PAYMENTS_APP_KEY`

Do not set `PAYMENT_CHARGE_AMOUNT_OVERRIDE` for this approach unless an additional override is intentionally needed.

## Pricing Preservation

Create `docs/original-product-pricing.md` with:

- Product name and slug.
- Original starting price.
- Each dose ID.
- Dose label and strength.
- Original dose price.
- Notes that pharmacy dose labels and prescription instructions remain unchanged.

This file is the restoration source after testing.

## Product Pricing Change

Update `data/products.ts`:

- Set each product `startingPrice` to `0.01`.
- Set every dose `price` to `0.01`.
- Keep dose IDs, labels, strengths, quantities, duration, weekly dose, injection units, and prescription labels unchanged.

This preserves pharmacy and PracticeQ behavior while making checkout visually and operationally one cent.

## Abandoned Checkout Visibility

The existing `partial_intakes` table already tracks started checkout records and reminder flags. Extend it so admins can see more useful checkout abandonment information:

- Product selected.
- Dose selected.
- Current checkout step.
- Last activity time.
- Completed status.
- Time on site, calculated from `started_at` to `last_seen_at`.

The existing `/api/intake/save-partial` endpoint will accept these fields and upsert them without blocking the customer flow.

Add an admin page at `/admin/abandoned-checkouts` that lists incomplete partial intakes. The page will show:

- Name, phone, and email.
- Treatment and dose.
- Step reached.
- Started time.
- Last activity.
- Time on site.
- Whether the 1-hour and 24-hour reminders were sent.

Add an admin navigation link labeled `Abandoned`.

## Reminder Flow

Keep the current `intake-abandonment` cron. It will continue to send scheduled Spruce reminders for incomplete partial intakes. The admin page is for visibility and manual follow-up decisions.

## Fulfillment

Successful `$0.01` production QuickBooks payments should continue through the existing downstream flow. PracticeQ and sandbox pharmacy dispatch remain enabled.

