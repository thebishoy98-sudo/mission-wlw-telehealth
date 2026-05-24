-- Mission WLW — PostgreSQL Schema
-- HIPAA-compliant. Compatible with Vercel Postgres / Neon.
--
-- HIPAA Technical Safeguards:
--   § 164.312(a)(1)  Access Control     — patient_id FKs enforce ownership
--   § 164.312(b)     Audit Controls     — phi_audit_logs (immutable, 6yr retention)
--   § 164.312(c)(1)  Integrity          — NOT NULL, FK constraints, CHECK constraints
--   § 164.312(e)(1)  Transmission Sec.  — TLS enforced by Neon/Vercel Postgres
--   Data Retention   § 164.530(j)       — retention_delete_after set at INSERT time

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Patients ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                      TEXT PRIMARY KEY,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  date_of_birth           TEXT NOT NULL,
  gender                  TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  address                 JSONB NOT NULL DEFAULT '{}',
  shipping_address        JSONB NOT NULL DEFAULT '{}',
  emergency_contact       JSONB,
  qb_customer_id          TEXT,
  retention_delete_after  TIMESTAMPTZ,
  is_deleted              BOOLEAN NOT NULL DEFAULT false,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Products ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL,
  long_description TEXT,
  starting_price   INTEGER NOT NULL,
  image            TEXT NOT NULL,
  doses            JSONB NOT NULL DEFAULT '[]',
  eligibility_note TEXT NOT NULL DEFAULT '',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  faqs             JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,
  patient_id           TEXT NOT NULL REFERENCES patients(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  dose_id              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','pending_review','approved','sent_to_pharmacy',
    'processing','shipped','delivered','cancelled','refunded'
  )),
  payment_status       TEXT NOT NULL DEFAULT 'pending',
  pharmacy_status      TEXT NOT NULL DEFAULT 'draft',
  practice_q_status    TEXT NOT NULL DEFAULT 'pending',
  quickbooks_status    TEXT NOT NULL DEFAULT 'pending',
  submitted_at         TIMESTAMPTZ,
  approved_at          TIMESTAMPTZ,
  provider_notes       TEXT,
  rejection_reason     TEXT,
  identity_status      TEXT,
  identity_reason      TEXT,
  identity_reviewed_at TIMESTAMPTZ,
  identity_reviewed_by TEXT,
  identity_ai_result   JSONB,
  identity_upload_token TEXT,
  retention_delete_after TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_reviewed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_reviewed_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_ai_result JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_upload_token TEXT;

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  amount            INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'usd',
  status            TEXT NOT NULL DEFAULT 'pending',
  payment_method    TEXT NOT NULL,
  card_last4        TEXT,
  card_brand        TEXT,
  transaction_id    TEXT,
  refund_amount     INTEGER,
  retention_delete_after TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  refunded_at       TIMESTAMPTZ
);

-- ── Questions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  text            TEXT NOT NULL,
  type            TEXT NOT NULL,
  options         JSONB DEFAULT '[]',
  required        BOOLEAN NOT NULL DEFAULT true,
  display_order   INTEGER NOT NULL DEFAULT 0,
  disqualifying   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Questionnaire Answers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  answer      TEXT NOT NULL,
  retention_delete_after TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Consent Records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_records (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  consent_text     TEXT NOT NULL,
  acknowledgments  JSONB NOT NULL DEFAULT '{}',
  signed_name      TEXT NOT NULL,
  signed_at        TIMESTAMPTZ NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  consent_version  TEXT NOT NULL DEFAULT '1.0',
  retention_delete_after TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Uploads ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id),
  type                TEXT NOT NULL,
  filename            TEXT NOT NULL,
  file_size           INTEGER NOT NULL,
  mime_type           TEXT NOT NULL,
  storage_url         TEXT NOT NULL DEFAULT '',
  base64_data         TEXT,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'uploaded',
  verification_notes  TEXT,
  retention_delete_after TIMESTAMPTZ
);

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS base64_data TEXT;

-- ── Provider Reviews ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_reviews (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  notes             TEXT,
  approved_dose     TEXT,
  rejection_reason  TEXT,
  chart_viewed_at   TIMESTAMPTZ,
  chart_viewed_by   TEXT,
  ai_summary        TEXT,
  ai_flags          JSONB DEFAULT '[]',
  identity_ai_result JSONB,
  identity_review_required BOOLEAN NOT NULL DEFAULT false,
  retention_delete_after TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_reviews ADD COLUMN IF NOT EXISTS identity_ai_result JSONB;
ALTER TABLE provider_reviews ADD COLUMN IF NOT EXISTS identity_review_required BOOLEAN NOT NULL DEFAULT false;

-- ── PHI Audit Logs ─────────────────────────────────────────────────────────────
-- HIPAA § 164.312(b) — INSERT ONLY. Never UPDATE or DELETE rows here.
-- Retain for 6 years from timestamp.
CREATE TABLE IF NOT EXISTS phi_audit_logs (
  id            TEXT PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action        TEXT NOT NULL,
  resource      TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  patient_id    TEXT,
  order_id      TEXT,
  actor         TEXT NOT NULL,
  actor_ip      TEXT,
  request_id    TEXT,
  disclosed_to  TEXT,
  outcome       TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  retention_delete_after TIMESTAMPTZ
);

-- ── PracticeQ Packets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practiceq_packets (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  patient_id      TEXT NOT NULL REFERENCES patients(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  packet_data     JSONB NOT NULL DEFAULT '{}',
  last_error      TEXT,
  last_sync_at    TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── QuickBooks Records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quickbooks_records (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  payment_id        TEXT REFERENCES payments(id),
  customer_ref_id   TEXT,
  invoice_id        TEXT,
  invoice_number    TEXT,
  amount            INTEGER NOT NULL,
  tax_amount        INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'created',
  last_error        TEXT,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pharmacy Orders ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacy_orders (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id),
  patient_id          TEXT NOT NULL REFERENCES patients(id),
  life_file_order_id  TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  payload             JSONB NOT NULL DEFAULT '{}',
  tracking_number     TEXT,
  shipped_at          TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  last_error          TEXT
);

-- ── Spruce Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spruce_messages (
  id            TEXT PRIMARY KEY,
  order_id      TEXT REFERENCES orders(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  template_key  TEXT NOT NULL,
  phone_number  TEXT NOT NULL,
  message_text  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Message Templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  variables   JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Integration Logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_logs (
  id                TEXT PRIMARY KEY,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  integration_name  TEXT NOT NULL,
  action            TEXT NOT NULL,
  order_id          TEXT,
  patient_id        TEXT,
  status            TEXT NOT NULL,
  details           JSONB DEFAULT '{}',
  error             TEXT
);

-- ── AI Conversations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT REFERENCES patients(id),
  order_id    TEXT REFERENCES orders(id),
  role        TEXT NOT NULL,
  messages    JSONB NOT NULL DEFAULT '[]',
  retention_delete_after TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CMS Content ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms_content (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_patient_id    ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_answers_order_id     ON questionnaire_answers(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order_id        ON integration_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp       ON integration_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spruce_patient_id    ON spruce_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_order_id    ON pharmacy_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_identity_status ON orders(identity_status);
CREATE INDEX IF NOT EXISTS idx_orders_identity_token ON orders(identity_upload_token);
CREATE INDEX IF NOT EXISTS idx_phi_audit_patient    ON phi_audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_phi_audit_timestamp  ON phi_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_phi_audit_actor      ON phi_audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_phi_audit_resource   ON phi_audit_logs(resource, resource_id);
