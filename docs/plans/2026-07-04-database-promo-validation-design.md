# Database Promo Validation Design

Promo codes are sourced exclusively from the `promo_codes` table. Checkout must
not contain hardcoded codes.

A shared server module performs case-insensitive lookup and validates `active`,
`expires_at`, `max_uses`, `uses`, discount type, and amount. It calculates the
flat or percentage discount from the undiscounted base amount.

A public POST endpoint accepts one code and a base amount and returns only the
validation result and calculated discount. It never lists promo codes. The
payment route calls the same shared validator before charging, so client output
is never trusted.

Checkout sends the undiscounted amount to the payment route. The server applies
the discount exactly once. After a captured payment, usage is incremented
atomically. Failed payments do not consume a use.

Tests cover active codes, case-insensitive matching, inactive/expired/exhausted
codes, flat and percent calculations, no hardcoded code maps, single discount
application, and post-capture usage increments.
