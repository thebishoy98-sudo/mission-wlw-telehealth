# Telehealth Platform - Premium Medical E-commerce Demo

A fully-functional, production-quality demo of a modern medical e-commerce/telehealth platform similar to Hims, Ro, and Henry Meds. Complete with patient intake flow, provider dashboards, admin management, CMS, and mocked third-party integrations.

## 🎯 Project Overview

This demo showcases a complete end-to-end medical treatment ordering platform with:

- **Customer-facing website**: Landing page, products, intake flow
- **Provider dashboard**: Patient management and approval workflow
- **Admin dashboard**: Orders, analytics, CMS, integration management
- **Mocked integrations**: PracticeQ, QuickBooks, Life File, Spruce SMS
- **Real data persistence**: localStorage-based database with seed data
- **Premium UI**: Tailwind CSS with medical brand design
- **Complete workflow**: From intake to fulfillment with status tracking

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Modern browser

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:3000
```

The demo initializes automatically with seed data (5 patients, 5 orders) on first load.

## 📋 Features & Walkthroughs

### Customer-Facing Website

**Landing Page** (`/`)
- Hero section with trust messaging
- Product showcase
- How it works (4-step process)
- Benefits and trust badges
- FAQ section
- Medical disclaimers

**Products** (`/products`, `/products/[id]`)
- Browse available treatments
- View pricing and eligibility
- Detailed product information
- Dose options

**Get Started Flow** (`/start/...`)
- Multi-step intake with progress tracking
- Step 1: Patient info & product selection
- Step 2: Medical questionnaire (dynamically sourced)
- Step 3: Consent/waiver with e-signature
- Step 4: File uploads (ID & selfie)
- Step 5: Mock payment checkout
- Step 6: Order confirmation

**Patient Status Tracker** (`/status`)
- View all personal orders
- Real-time status updates
- Tracking information when available
- Recent SMS notifications

### Provider Dashboard

**Provider Home** (`/provider`)
- Overview stats (pending, approved, fulfilled)
- Orders awaiting review
- Full order list with filtering

**Patient Review** (`/provider/patients/[id]`)
- Complete patient information
- Questionnaire answers
- Document uploads (ID, selfie)
- Approve/reject workflow
- Provider notes
- Payment details

### Admin Dashboard

**Admin Overview** (`/admin`)
- Key metrics: Revenue, orders, patients, AOV
- 7-day revenue chart
- Order status distribution
- Quick action buttons
- Recent orders table

**Order Management** (`/admin/orders`)
- Real-time order list
- Pharmacy workflow controls
- Send to pharmacy button
- Add tracking numbers
- Trigger SMS notifications

**Product Management** (`/admin/products`)
- Add new products
- Edit existing products
- Delete products
- CRUD operations persist to localStorage

**Content Management** (`/admin/cms`)
- Edit landing page headline & subheadline
- Edit CTA button text
- Edit disclaimers & privacy notes
- Edit footer content
- Changes reflect on public site immediately

**Integration Logs** (`/admin/integrations`)
- View all system events
- Filter by integration (PracticeQ, QB, Life File, Spruce)
- Status indicators
- Timestamps and details

## 🗄️ Data Model

### Core Entities

```
Patient
  - Personal info, address
  - Contact info
  - Created/updated timestamps

Order
  - Patient reference
  - Product & dose selection
  - Status tracking (draft → pending_review → approved → sent_to_pharmacy → fulfilled → delivered)
  - Payment status
  - Pharmacy status
  - Provider notes

Product
  - Name, description, pricing
  - Dose options
  - Eligibility notes
  - FAQs
  - Active/inactive flag

QuestionnaireQuestion
  - Text, type (text/radio/checkbox)
  - Category (medical_history/medications/allergies/screening)
  - Required flag

QuestionnaireAnswer
  - Links question to order
  - Patient response

ConsentRecord
  - Full consent text
  - Acknowledgments (telehealth, pharmacy, payment, privacy)
  - Digital signature
  - Timestamp

Upload
  - Type (driver_license, selfie_video)
  - Base64 data for demo
  - Status (uploaded, verified)

Payment
  - Amount, currency
  - Card info (last 4, brand)
  - Transaction ID
  - Status (pending, completed, failed)

IntegrationLog
  - Timestamp of event
  - Integration name
  - Action description
  - Status (success/pending/error)
  - Details (JSON)
```

All data stored in localStorage with dedicated database layer (lib/db.ts).

## 🔌 Mock Integrations

### PracticeQ (Compliance Management)
**File**: `services/practiceq.ts`

Simulates intake packet submission and status tracking:
```typescript
submitIntakePacket(order) → creates compliance packet
getPacketStatus(orderId) → returns submission status
```

**Notes**: Includes placeholder comments for production API endpoint and authentication.

### QuickBooks (Accounting)
**File**: `services/quickbooks.ts`

Simulates accounting records:
```typescript
createCustomerRecord(patient) → QB customer
createInvoice(order, payment) → QB invoice
recordPayment(invoiceId, amount) → payment record
getAccountingMetrics() → revenue dashboard data
```

**Notes**: Includes placeholder for OAuth 2.0 implementation.

### Life File (Pharmacy Fulfillment)
**File**: `services/lifefile.ts`

Simulates pharmacy order submission:
```typescript
createPharmacyOrder(order) → sends Rx to pharmacy
updateOrderStatus(orderId, status) → status updates
addTrackingNumber(orderId, tracking) → shipping info
getOrderStatus(lifeFileOrderId) → fulfillment status
```

**Production Placeholders**:
```
X-Vendor-ID: VENDOR_ID
X-Location-ID: LOCATION_ID
X-API-Network-ID: NETWORK_ID
Basic Auth: username/password
```

### Spruce (SMS & Messaging)
**File**: `services/spruce.ts`

Simulates patient notifications:
```typescript
sendMessage(patientId, templateKey, vars) → sends SMS
scheduleMessage(patientId, templateKey, scheduledFor) → schedules SMS
scheduleReorderReminder(orderId, daysFromNow) → 30-day reminder
```

**Message Templates**:
- `intake_received`: "we've received your intake"
- `payment_received`: payment confirmation with amount
- `sent_to_pharmacy`: order sent to fulfillment
- `fulfilled`: order fulfilled, tracking coming
- `tracking`: tracking number provided
- `reorder_reminder`: 30-day reorder prompt

## 🗂️ Project Structure

```
├── app/
│   ├── layout.tsx              # Root layout, initializes seed data
│   ├── page.tsx                # Landing page
│   ├── products/               # Product pages
│   ├── start/                  # Intake flow (6 steps)
│   ├── status/                 # Patient status tracker
│   ├── provider/               # Provider dashboard
│   └── admin/                  # Admin dashboard & CMS
│
├── components/
│   ├── ui/                     # Reusable buttons, inputs, cards
│   ├── layout/                 # Navbar, Footer, ProgressBar
│   └── charts/                 # Recharts visualizations
│
├── lib/
│   ├── db.ts                   # localStorage CRUD operations
│   ├── utils.ts                # Formatting & helper functions
│   ├── intake-store.ts         # Temporary form state
│   └── seed.ts                 # Demo data initialization
│
├── services/
│   ├── practiceq.ts            # PracticeQ mock integration
│   ├── quickbooks.ts           # QuickBooks mock integration
│   ├── lifefile.ts             # Life File mock integration
│   └── spruce.ts               # Spruce SMS mock integration
│
├── types/
│   └── index.ts                # All TypeScript interfaces
│
├── data/
│   └── seed-data.ts            # Demo patient/order records
│
└── styles/
    └── globals.css             # Tailwind & custom styles
```

## 🎨 Design System

**Colors**:
- Primary: `#0D9488` (teal-600) - Medical trust
- Background: `#F9FAFB` (gray-50) - Clean white
- Text: `#111827` (gray-900) - High contrast
- Accent: `#F0FDF4` (green-50) - Soft CTAs

**Typography**:
- Font: Inter
- Headings: Bold, clean hierarchy
- Body: 14-16px, readable

**Components**:
- Button sizes: sm, md, lg
- Variants: primary, secondary, outline, ghost
- Cards: white bg, subtle shadow, 12px border radius
- Responsive: Mobile-first design

## 💾 Data Persistence

All data stored in browser localStorage via dedicated db.ts layer:

```typescript
// Database keys
tele_patients
tele_products
tele_orders
tele_payments
tele_uploads
tele_questionnaire_answers
tele_questions
tele_consent_records
tele_pharmacy_orders
tele_practiceq_packets
tele_quickbooks_records
tele_spruce_messages
tele_integration_logs
tele_cms_content
tele_message_templates
tele_provider_reviews
```

**Seed Data Included**:
- 5 patients (various stages)
- 1 product (Tirzepatide with 3 doses)
- 5 orders in different states
- Realistic questionnaire questions
- Default SMS message templates
- Integration logs for all actions

Clear data with: `db.clearAllData()`

## 📊 Key Workflows

### Complete Customer Order Flow
1. Land on homepage
2. Review products
3. Click "Get Started"
4. Complete patient info + select product/dose
5. Answer medical questionnaire
6. Sign consent/waiver
7. Upload ID + selfie
8. Complete mock payment
9. See confirmation with order ID
10. Track order status in `/status`

### Provider Review Workflow
1. Navigate to `/provider`
2. See orders awaiting review
3. Click patient to review details
4. Review questionnaire answers, documents, payment
5. Click "Approve Order"
6. System sends order to pharmacy
7. Patient receives SMS notifications

### Admin Management Workflow
1. Navigate to `/admin`
2. View revenue, metrics, order distribution
3. Go to `/admin/orders`
4. Select order, click "Send to Pharmacy"
5. Add tracking number when received
6. See SMS sent to patient
7. Check `/admin/integrations` for audit trail
8. Edit products, content, and templates

## 🧪 Testing Scenarios

### Happy Path (Full Order)
- Patient: Alice Chen (order_1)
- Status: Delivered, shipped with tracking
- Action: View in `/status`, see all integration logs

### Provider Review Pending
- Patient: Bob Martinez (order_2)
- Status: Awaiting provider review
- Action: Go to `/provider`, approve order

### Payment Pending
- Patient: Carol Johnson (order_3)
- Status: Approved, payment pending
- Action: Complete payment flow

### Pharmacy Processing
- Patient: David Kim (order_4)
- Status: At pharmacy, processing
- Action: Admin add tracking and trigger SMS

### Fresh Intake
- Patient: Emma Wilson (order_5)
- Status: Draft/just created
- Action: Go through full intake flow

### Create New Order
1. Start fresh intake at `/start/info`
2. Fill patient info & select product
3. Complete questionnaire, consent, uploads, payment
4. See confirmation
5. Watch appear in provider/admin dashboards

### Test CMS
1. Go to `/admin/cms`
2. Edit landing page headline
3. Go back to `/` and see it updated immediately
4. Edit footer text
5. Refresh and verify changes persist

### Test Product Management
1. Go to `/admin/products`
2. Add new product
3. Go to `/products` and see it listed
4. Edit product price
5. View in product detail page

## 🚢 Deployment Notes

### Environment Variables
None required for demo mode. In production:

```env
# PracticeQ
PRACTICEQ_API_KEY=sk_live_...
PRACTICEQ_API_URL=https://api.practiceq.com

# QuickBooks
QB_REALM_ID=...
QB_ACCESS_TOKEN=...
QB_OAUTH_ENDPOINTS=...

# Life File
LIFEFILE_API_KEY=...
LIFEFILE_VENDOR_ID=...
LIFEFILE_LOCATION_ID=...

# Spruce
SPRUCE_API_KEY=...

# Payment Processor (Stripe, etc.)
STRIPE_SECRET_KEY=...
STRIPE_PUBLISHABLE_KEY=...
```

### Production Checklist
- [ ] Replace mock services with real API calls
- [ ] Implement real authentication (OAuth/SSO)
- [ ] Add HIPAA-compliant encryption
- [ ] Use database (Postgres, MongoDB) instead of localStorage
- [ ] Implement real file storage (S3, GCS)
- [ ] Add HTTPS only
- [ ] Configure CORS properly
- [ ] Add audit logging to database
- [ ] Implement real payment processing
- [ ] Add compliance reporting
- [ ] Setup error tracking (Sentry, etc)
- [ ] Configure monitoring and alerts

## 🎯 Acceptance Criteria Coverage

✅ All 24 acceptance criteria from requirements:
1. ✅ Edit homepage from CMS → reflects immediately
2. ✅ Add product → appears in catalog
3. ✅ Full intake flow → 6-step process with data persistence
4. ✅ Confirmation page → shows order ID
5. ✅ Provider dashboard → shows orders, allows approval
6. ✅ Admin dashboard → shows metrics & orders
7. ✅ Send to pharmacy → updates status
8. ✅ Add tracking → sends SMS to patient
9. ✅ Fulfill order → updates status in dashboards
10. ✅ Export CSV → works from any dashboard table
11. ✅ Integration logs → shows all actions with timestamps
12. ... (plus 13 more, all implemented)

## 📞 Support & Documentation

For production implementation or customization:
- **Architecture**: See plan at `C:\Users\BishoyKamel\.claude\plans/humble-prancing-coral.md`
- **Memory notes**: See `C:\Users\BishoyKamel\.claude\projects\C--Repo-Tele\memory\MEMORY.md`
- **Types**: Full TypeScript documentation in `types/index.ts`
- **Services**: Inline comments show where production APIs connect

## 📝 License

Demo project for educational and commercial use.

---

**Built with**: Next.js 14, Tailwind CSS, TypeScript, Recharts, Lucide Icons

**Status**: ✅ Complete & Fully Functional - Ready for Demo
