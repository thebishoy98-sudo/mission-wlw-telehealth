# Integration Guide

> **Current state:** All four integrations are **mocked** — they write structured data to localStorage and log every event, but make no real API calls. Each section below describes what the integration does today (mock), what it needs to do in production (real), and exactly where to add the production code.

---

## Overview — Order Lifecycle & Integration Touchpoints

```
Patient submits intake
        │
        ▼
[1] PracticeQ ◄─── Patient info + questionnaire + consent + uploads sent as packet
        │
        ▼
Provider reviews & approves
        │
        ├──► [2] QuickBooks ◄─── Invoice created on payment capture
        │
        ▼
[3] Life File (pharmacy) ◄─── Rx order transmitted with prescriber NPI, drug, dose, qty
        │
        ▼
Order ships / delivers
        │
        ▼
[4] Spruce SMS ◄─── Patient notified at every status change
```

All events are written to the **Integration Logs** table (`/admin/integrations`) so you have a full audit trail.

---

## 1. PracticeQ

**Purpose:** Electronic health record (EHR) / practice management. Receives the full patient intake packet so the provider can review it inside PracticeQ instead of (or in addition to) the custom provider dashboard.

### What the mock does
- Builds a `PracticeQPacket` object containing:
  - Patient demographics
  - Questionnaire answers
  - Signed consent record
  - Uploaded files (driver's license, selfie video)
  - Product and dose requested
- Stores the packet in localStorage (`tele_practiceq_packets`)
- Sets `order.practiceQStatus = "completed"`
- Writes a success log to Integration Logs

### What production needs
1. **API endpoint:** `POST https://app.practicq.com/api/v1/intakes` (confirm with PracticeQ)
2. **Auth:** Bearer token in `Authorization` header — store in env as `PRACTICEQ_API_KEY`
3. **Payload:** Map the `PracticeQPacket.packetData` to PracticeQ's intake schema
4. **File uploads:** Upload base64 files to PracticeQ's document endpoint before submitting the packet, then reference returned document IDs

### Where to add the code
```
lib/
  integrations/
    practiceq.ts      ← create this file
```

```ts
// lib/integrations/practiceq.ts
export async function submitIntakePacket(orderId: string): Promise<void> {
  const packet = db.practiceqDb.getByOrder(orderId);
  // TODO: POST packet.packetData to PracticeQ API
  // On success: db.orderDb.update(orderId, { practiceQStatus: "completed" })
  // On error:   db.orderDb.update(orderId, { practiceQStatus: "error" })
  // Always:     db.integrationLogDb.create({ integrationName: "practiceq", ... })
}
```

Call `submitIntakePacket(order.id)` after the patient completes the intake flow (currently triggered at the end of `app/start/payment/page.tsx`).

---

## 2. QuickBooks Online

**Purpose:** Accounting. Creates a customer record and invoice for every completed payment so revenue appears automatically in QuickBooks.

### What the mock does
- Creates a `QuickBooksRecord` with:
  - `customerRefId` — a stable ID per patient
  - `invoiceId` / `invoiceNumber` — generated locally
  - `amount` and `taxAmount`
  - `status: "created"`
- Stores in localStorage (`tele_quickbooks_records`)
- Writes a success log to Integration Logs

### What production needs
1. **OAuth 2.0:** QuickBooks uses OAuth — store `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, and the refresh token. Use the QBO Node SDK (`node-quickbooks` or `intuit-oauth`).
2. **Realm ID:** Each QBO company has a `realmId` — store as `QUICKBOOKS_REALM_ID`
3. **Flow:**
   - Find or create a QBO Customer matching the patient (`GET /v3/company/{realmId}/query?query=SELECT * FROM Customer WHERE DisplayName = '{name}'`)
   - Create an Invoice (`POST /v3/company/{realmId}/invoice`)
   - Mark invoice as paid with a Payment object (`POST /v3/company/{realmId}/payment`)

### Where to add the code
```
lib/
  integrations/
    quickbooks.ts     ← create this file
```

```ts
// lib/integrations/quickbooks.ts
export async function createInvoice(orderId: string, paymentId: string): Promise<void> {
  // TODO: Find/create QBO customer for patient
  // TODO: Create QBO invoice
  // TODO: Apply payment to invoice
  // On success: db.quickbooksDb.update(id, { status: "invoiced" })
  // Always:     db.integrationLogDb.create({ integrationName: "quickbooks", ... })
}
```

Call `createInvoice(order.id, payment.id)` inside the payment processing step, after the payment is marked `completed`.

---

## 3. Life File (Pharmacy)

**Purpose:** Compounding pharmacy partner. Receives the Rx order (prescriber NPI, drug, strength, qty, patient shipping address) and fulfills it.

### What the mock does
- Builds a `PharmacyOrder` payload with:
  - `prescriber` block — NPI, name, phone (currently hardcoded placeholders)
  - `practice` block — NPI, name, phone (currently hardcoded placeholders)
  - `patient` — full demographics
  - `shipping` — patient's shipping address
  - `rxs[]` — drug name, strength, quantity, directions, refills, days supply
- Stores in localStorage (`tele_pharmacy_orders`)
- Generates a fake tracking number once status reaches `shipped`
- Writes logs at submission and each status update

### What production needs
1. **API credentials:** Life File API key — store as `LIFE_FILE_API_KEY` and `LIFE_FILE_BASE_URL`
2. **Real prescriber NPI:** Replace the placeholder NPI `1234567890` with the actual licensed prescriber's NPI. Store as `PRESCRIBER_NPI`, `PRESCRIBER_NAME`, `PRESCRIBER_PHONE`.
3. **Real practice NPI:** Replace `0987654321` with the actual practice NPI. Store as `PRACTICE_NPI`, `PRACTICE_NAME`, `PRACTICE_PHONE`.
4. **Webhooks / polling:** Life File will either push status updates via webhook or require polling. Implement a webhook handler at `/api/webhooks/lifefile` that updates `pharmacyOrder.status` and `order.pharmacyStatus`, then triggers the Spruce SMS notification.

### Where to add the code
```
lib/
  integrations/
    lifefile.ts       ← create this file
app/
  api/
    webhooks/
      lifefile/
        route.ts      ← webhook handler
```

```ts
// lib/integrations/lifefile.ts
export async function submitPharmacyOrder(orderId: string): Promise<void> {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);
  // TODO: POST pharmacyOrder.payload to Life File API
  // On success: store lifeFileOrderId, update order.pharmacyStatus = "submitted"
  // Always:     log to integrationLogDb
}
```

Call `submitPharmacyOrder(order.id)` when a provider approves an order (currently in `app/provider/patients/[id]/page.tsx`).

---

## 4. Spruce SMS

**Purpose:** Patient communication. Sends SMS messages at every key status change so patients always know where their order is.

### What the mock does
- Creates `SpruceMessage` records for each event:
  | Template key | Trigger | Message |
  |---|---|---|
  | `intake_received` | Patient submits intake | "We've received your intake…" |
  | `payment_received` | Payment captured | "We've received your payment for $X…" |
  | `sent_to_pharmacy` | Order sent to Life File | "Your order has been sent to our pharmacy…" |
  | `fulfilled` | Pharmacy fulfills order | "Your order has been fulfilled…" |
  | `tracking` | Order shipped | "Your tracking info: UPS123456789…" |
- All messages have `status: "sent"` in the mock (no real API call)

### What production needs
1. **Spruce API key:** Store as `SPRUCE_API_KEY` and `SPRUCE_BASE_URL`
2. **From number:** Your Spruce practice phone number — store as `SPRUCE_FROM_NUMBER`
3. **Flow:** `POST /api/v1/messages` with `to`, `from`, and `body`
4. **Templates:** Message bodies are already stored as `MessageTemplate` records (editable via `/admin/cms`). At send time, interpolate variables like `{{patientName}}` and `{{trackingNumber}}`.

### Where to add the code
```
lib/
  integrations/
    spruce.ts         ← create this file
```

```ts
// lib/integrations/spruce.ts
export async function sendSMS(
  patientId: string,
  orderId: string,
  templateKey: string,
  variables: Record<string, string>
): Promise<void> {
  const template = db.messageTemplateDb.getByKey(templateKey);
  const patient = db.patientDb.getById(patientId);
  // TODO: Interpolate template.body with variables
  // TODO: POST to Spruce API
  // On success: db.spruceDb.update(id, { status: "sent", sentAt: now })
  // On error:   db.spruceDb.update(id, { status: "failed" })
  // Always:     log to integrationLogDb
}
```

---

## Environment Variables (production)

```env
# PracticeQ
PRACTICEQ_API_KEY=

# QuickBooks Online
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REALM_ID=
QUICKBOOKS_REFRESH_TOKEN=

# Life File Pharmacy
LIFE_FILE_API_KEY=
LIFE_FILE_BASE_URL=
PRESCRIBER_NPI=
PRESCRIBER_NAME=
PRESCRIBER_PHONE=
PRACTICE_NPI=
PRACTICE_NAME=
PRACTICE_PHONE=

# Spruce SMS
SPRUCE_API_KEY=
SPRUCE_BASE_URL=
SPRUCE_FROM_NUMBER=
```

---

## Integration Log Schema

Every integration call (mock or real) should write a log entry:

```ts
{
  id: string;
  timestamp: string;                  // ISO 8601
  integrationName: "practiceq" | "quickbooks" | "lifefile" | "spruce" | "system";
  action: string;                     // human-readable, e.g. "Intake packet submitted"
  orderId?: string;
  patientId?: string;
  status: "success" | "pending" | "error";
  details: Record<string, any>;       // response data, IDs, amounts, etc.
  error?: string;                     // error message if status === "error"
}
```

Logs are viewable at **Admin → Integration Logs** (`/admin/integrations`) with filter buttons per integration.

---

## Switching from Mock to Real (checklist)

- [ ] Create `lib/integrations/practiceq.ts` and call it after intake submission
- [ ] Create `lib/integrations/quickbooks.ts` and call it after payment captured
- [ ] Create `lib/integrations/lifefile.ts` and call it after provider approval; add webhook handler
- [ ] Create `lib/integrations/spruce.ts` and replace mock `SpruceMessage` creation with real API calls
- [ ] Add all env variables above to `.env.local` (dev) and hosting platform (prod)
- [ ] Replace hardcoded prescriber/practice NPI placeholders in `lib/seed.ts` and the pharmacy order builder
- [ ] Test each integration in sandbox/test mode before going live
