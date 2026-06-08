# QuickBooks Production One-Cent Test

This configuration is for charging real QuickBooks production payments while all visible product and dose prices are set to `$0.01`.

## Render Environment Variables

Set these values on the Render web service:

```env
USE_REAL_QUICKBOOKS=true
BYPASS_QB_PAYMENTS=false
NEXT_PUBLIC_QB_PAYMENTS_ENABLED=true
NEXT_PUBLIC_QB_PAYMENTS_ENVIRONMENT=production
```

Set these production QuickBooks secrets from the Intuit production app and connected production QuickBooks company:

```env
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REALM_ID=
QB_REFRESH_TOKEN=
NEXT_PUBLIC_QB_PAYMENTS_APP_KEY=
QB_WEBHOOK_VERIFIER_TOKEN=
```

## Payment Amount

For this selected approach, leave these unset unless an additional emergency override is intentionally needed:

```env
PAYMENT_CHARGE_AMOUNT_OVERRIDE=
NEXT_PUBLIC_PAYMENT_CHARGE_AMOUNT_OVERRIDE=
```

The application will charge the product/dose price. During this test, those prices are `$0.01`.

## Restore Real Pricing

The original production prices are preserved in:

```text
docs/original-product-pricing.md
```

When testing is complete, restore only product `startingPrice` and dose `price` values. Do not change dose IDs, labels, strengths, prescription labels, or pharmacy-facing metadata.

## Fulfillment Behavior

Successful `$0.01` production QuickBooks payments continue through the normal order flow. PracticeQ and sandbox pharmacy dispatch remain enabled.

