# AppSheet Pharmacy Gateway Plan

## Decision

Mission WLW should remain the stable system-facing gateway for pharmacy order and tracking workflows. AppSheet will sit behind Mission WLW as the operational pharmacy gateway once the AppSheet API details are provided.

Preferred flow:

```text
Mission WLW site
  -> AppSheet gateway
     -> pharmacy order workflow
     -> prior order lookup
     -> tracking/status updates
```

The pharmacy-facing webhook URL should stay stable:

```text
POST https://mission-wlw.vercel.app/api/webhooks/pharmacy/tracking
```

This keeps the pharmacy from needing a new URL every time the backend gateway changes.

## Why

- Pharmacy gets one stable Mission WLW URL.
- AppSheet URLs, tokens, tables, or actions can change later through Vercel env/config without contacting the pharmacy.
- Mission WLW can still save tracking/status updates locally, send patient notifications, and log failures.
- AppSheet can provide the operational gateway for sending new orders, viewing prior orders, and receiving future status updates.

## AppSheet Details Needed

```text
APPSHEET_APP_ID=
APPSHEET_API_KEY=
APPSHEET_BASE_URL=
```

Need table/action mapping:

```text
Orders table name:
Tracking/status table name:
Create order action name:
Read prior orders action/view:
Order ID field:
Tracking number field:
Status field:
LifeFile/pharmacy order ID field:
```

Need one sample AppSheet order row or payload shape. Redact PHI when possible.

## Implementation Direction

Once AppSheet details are available:

- Add an AppSheet service module for create/read/update operations.
- Send new pharmacy orders from Mission WLW to AppSheet instead of directly to pharmacy.
- Sync prior orders and tracking/status updates from AppSheet into Mission WLW.
- Keep `/api/webhooks/pharmacy/tracking` as the stable inbound tracking endpoint.
- Forward inbound pharmacy tracking events to AppSheet after Mission WLW records them.
- Log AppSheet failures without blocking local order status updates.

## Current State

The Basic Auth pharmacy tracking endpoint is already deployed:

```text
POST https://mission-wlw.vercel.app/api/webhooks/pharmacy/tracking
```

It accepts JSON like:

```json
{
  "orderId": "LIFEFILE_ORDER_ID",
  "status": "shipped",
  "trackingNumber": "1Z999999999"
}
```

Production envs already exist for:

```text
PHARMACY_WEBHOOK_USERNAME
PHARMACY_WEBHOOK_PASSWORD
```

