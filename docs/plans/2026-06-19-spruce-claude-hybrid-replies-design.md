# Spruce Claude Hybrid Replies Design

## Goal

Use Claude to respond to inbound Spruce patient SMS messages while limiting automatic replies to low-risk operational questions.

## Recommended Approach

Use a hybrid reply flow. Inbound Spruce replies continue to arrive at `/api/webhooks/spruce`. The webhook identifies the patient from the originating Spruce message or phone number, asks Claude to classify the inbound text, and only sends an automatic Spruce reply when the message is clearly operational.

Clinical, safety, unclear, or provider-directed messages are escalated instead of answered by AI. If configured, the system sends a short acknowledgement telling the patient the clinical team will review it.

## Classification

Claude returns one of these decisions:

- `auto_reply`: safe operational response can be sent automatically.
- `clinical_escalation`: symptoms, side effects, emergency terms, dose changes, pregnancy, allergy, or medication-specific clinical advice.
- `staff_review`: unclear, sensitive, billing dispute, complaint, or anything that should not be automated.
- `ignore`: STOP/opt-out, empty text, or non-actionable short acknowledgement.

## Data Flow

1. Spruce posts a `message.reply` webhook.
2. Existing webhook signature validation runs first.
3. Existing opt-out handling runs before AI automation.
4. The webhook resolves the patient and order from the Spruce message or patient phone.
5. The AI service builds a conservative prompt with available order context.
6. Claude returns structured JSON containing a decision, confidence, reply text, and reason.
7. For `auto_reply`, the system sends the reply with `sendTextToPhone`.
8. For `clinical_escalation`, the system optionally sends a safe acknowledgement.
9. All decisions are written to `integration_logs`.

## Safety Rules

Claude may explain logistics and program process, but must not diagnose, recommend medication changes, advise on side-effect severity, or replace a provider. Clinical and uncertain replies are escalated.

## Configuration

- `SPRUCE_AI_REPLIES=true` enables the feature.
- `SPRUCE_AI_AUTO_REPLY=false` disables automatic operational sends while still logging decisions.
- `SPRUCE_AI_ESCALATION_ACK=false` disables acknowledgement texts for escalations.
- `ANTHROPIC_API_KEY` is required for AI classification.

## Testing

Add focused unit tests for classification parsing, clinical keyword fallback, opt-out skipping, auto-reply send behavior, and escalation acknowledgement behavior. Run the Spruce-focused tests and a production build before pushing.
