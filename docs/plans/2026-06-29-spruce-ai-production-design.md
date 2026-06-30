# Spruce AI Production Webhook Design

## Root Cause

Production has no registered Spruce webhook endpoint, the AI reply code was
never merged to `main`, and its draft parser expected a legacy
`message.reply` payload. Spruce currently publishes inbound SMS messages as
`conversationItem.created` events. Webhook signatures are Base64-encoded
HMAC-SHA256 digests.

## Design

- Register `https://mission-wlw.com/api/webhooks/spruce` with Spruce.
- Verify `X-Spruce-Signature` using the endpoint secret and Base64 HMAC-SHA256.
- Accept only inbound, non-internal `conversationItem.created` events.
- Resolve the patient phone from the conversation's external phone participant.
- Return HTTP 200 immediately and process classification through Next.js `after`
  so Spruce's five-second response deadline is respected.
- Process STOP/CANCEL before AI.
- Use Claude only for operational questions. Clinical or medication messages
  receive a neutral escalation acknowledgement; unclear messages are logged for
  staff review without an automatic answer.
- Use the Spruce conversation-item ID as the outbound idempotency key.
- Log every inbound message and AI decision.

## Production Configuration

- `SPRUCE_AI_REPLIES=true`
- `SPRUCE_AI_AUTO_REPLY=true`
- `SPRUCE_AI_ESCALATION_ACK=true`
- `SPRUCE_WEBHOOK_SECRET=<secret returned by endpoint registration>`

