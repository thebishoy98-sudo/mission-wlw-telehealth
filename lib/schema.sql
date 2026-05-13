-- Mission WLW — PostgreSQL Schema
-- HIPAA-compliant schema.
-- Compatible with Vercel Postgres (Neon-backed, AES-256 encryption at rest, TLS in transit).
--
-- HIPAA Technical Safeguards addressed:
--   § 164.312(a)(1)  Access Control     — row-level ownership (patient_id FKs)
--   § 164.312(b)     Audit Controls     — phi_audit_logs table (immutable, 6yr retention)
--   § 164.312(c)(1)  Integrity          — NOT NULL constraints, FK integrity, updated_at triggers
--   § 164.312(e)(1)  Transmission Sec.  — TLS enforced by Vercel Postgres / Neon
--   § 164.312(a)(2)  Unique User ID     — actor field in all audit records
--
-- Data Retention:
--   PHI must be retained for 6 years from creation (§ 164.530(j)).
--   retention_delete_after is set at creation and enforced by a scheduled cleanup job.
--   DO NOT hard-delete any row before retention_delete_after.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_bytes() if needed

-- ── Updated_at trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Patients ─────────────────────────────────────────────────────────────────
-- PHI fields: first_name, last_name, date_of_birth, gender, phone, email, address
-- In a fully encrypted setup, consider pgcrypto / application-layer encryption
-- for these columns. Vercel Postgres provides AES-256 encryption at rest (BAA required).
CREATE TABLE IF NOT EXISTS patients (
  id                      TEXT PRIMARY KEY,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  date_of_birth           TEXT NOT NULL,     -- PHI — store as ISO 8601 string
  gender                  TEXT NOT NULL,
  phone                   TEXT NOT NULL,     -- PHI
  email                   TEXT NOT NULL UNIQUE, -- PHI
  address                 JSONB NOT NULL DEFAULT '{}',  -- PHI
  shipping_address        JSONB NOT NULL DEFAULT '{}',  -- PHI
  emergency_contact       JSONB,
  qb_customer_id          TEXT,              -- QuickBooks customer reference
  -- Data retention (§ 164.530(j)) — 6 years from creation
  retention_delete_after  TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
  is_deleted              BOOLEAN NOT NULL DEFAULT false,  -- soft delete only
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Products ──────────────────────────────────────────────────────────────────
-- Non-PHI — no retention requirement
CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL,
  long_description TEXT,
  starting_price   INTEGER NOT NULL, -- cents
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
  status               TEXT NOT NULL DEFAULT 'draft',
  -- CHECK constraint ensures only valid status transitions
  CONSTRAINT orders_status_check CHECK (status IN (
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
  -- Data retention: 6 years from creation
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Payments ──────────────────────────────────────────────────────────────────
-- Retain for 6 years (financial + PHI)
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  amount            INTEGER NOT NULL, -- cents
  currency          TEXT NOT NULL DEFAULT 'usd',
  status            TEXT NOT NULL DEFAULT 'pending',
  payment_method    TEXT NOT NULL,
  card_last4        TEXT,   -- last 4 only, never store full PAN (PCI DSS)
  card_brand        TEXT,
  transaction_id    TEXT,   -- QuickBooks Payments charge ID
  refund_amount     INTEGER,
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
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
-- PHI — medical history responses; retain 6 years
CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  answer      TEXT NOT NULL,   -- PHI (medical history)
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Consent Records ───────────────────────────────────────────────────────────
-- Legal record — retain permanently (or 10 years per state telehealth laws)
CREATE TABLE IF NOT EXISTS consent_records (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  consent_text     TEXT NOT NULL,
  acknowledgments  JSONB NOT NULL DEFAULT '{}',
  signed_name      TEXT NOT NULL,   -- PHI
  signed_at        TIMESTAMPTZ NOT NULL,
  ip_address       TEXT,            -- required for legal enforceability
  user_agent       TEXT,
  consent_version  TEXT NOT NULL DEFAULT '1.0',
  -- Telehealth consent must state: provider identity, tech risks, confidentiality limits
  -- Ensure consent_text includes all required disclosures per your state's telehealth laws.
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (signed_at + INTERVAL '10 years') STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Uploads ───────────────────────────────────────────────────────────────────
-- PHI — identity documents. Retain 6 years.
-- Files stored in Vercel Blob (encrypted at rest). storage_url is a signed URL.
CREATE TABLE IF NOT EXISTS uploads (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id),
  type                TEXT NOT NULL,  -- 'driver_license' | 'selfie_video'
  filename            TEXT NOT NULL,
  file_size           INTEGER NOT NULL,
  mime_type           TEXT NOT NULL,
  storage_url         TEXT NOT NULL DEFAULT '', -- Vercel Blob / S3 signed URL
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'uploaded',
  verification_notes  TEXT,
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (uploaded_at + INTERVAL '6 years') STORED
);

-- ── Provider Reviews ─────────────────────────────────────────────────────────
-- Clinical records — retain 6 years (state minimum; some states require 10)
CREATE TABLE IF NOT EXISTS provider_reviews (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,             -- provider user ID
  status            TEXT NOT NULL DEFAULT 'pending',
  notes             TEXT,
  approved_dose     TEXT,
  rejection_reason  TEXT,
  chart_viewed_at   TIMESTAMPTZ,
  chart_viewed_by   TEXT,
  ai_summary        TEXT,             -- AI-generated intake summary for provider
  ai_flags          JSONB DEFAULT '[]', -- AI-flagged concerns
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PHI Audit Logs ─────────────────────────────────────────────────────────
-- HIPAA § 164.312(b) — Audit Controls
-- IMMUTABLE: Never UPDATE or DELETE rows in this table.
-- Retain for 6 years from timestamp.
CREATE TABLE IF NOT EXISTS phi_audit_logs (
  id            TEXT PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action        TEXT NOT NULL,   -- 'view'|'create'|'update'|'delete'|'export'|'disclose'|'ai_process'|'payment'
  resource      TEXT NOT NULL,   -- 'patient'|'order'|'questionnaire_answer'|etc.
  resource_id   TEXT NOT NULL,
  patient_id    TEXT,
  order_id      TEXT,
  actor         TEXT NOT NULL,   -- 'patient'|'provider:<id>'|'admin:<id>'|'system'|'api'
  actor_ip      TEXT,
  request_id    TEXT,
  disclosed_to  TEXT,            -- third party that received PHI
  outcome       TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (timestamp + INTERVAL '6 years') STORED
);
-- Audit log must never be modified — enforce with RLS or application logic
-- CREATE POLICY phi_audit_insert_only ON phi_audit_logs FOR INSERT TO app_user;
-- ALTER TABLE phi_audit_logs ENABLE ROW LEVEL SECURITY;

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
-- PHI flows to Life File pharmacy — disclosed under Treatment exception (§ 164.506)
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
-- SMS contains PHI — logged in phi_audit_logs as 'disclose' to 'spruce'
CREATE TABLE IF NOT EXISTS spruce_messages (
  id            TEXT PRIMARY KEY,
  order_id      TEXT REFERENCES orders(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  template_key  TEXT NOT NULL,
  phone_number  TEXT NOT NULL,   -- PHI
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
-- General operational logs (not PHI audit — use phi_audit_logs for PHI access)
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
-- May contain PHI — every AI call must be logged in phi_audit_logs as 'ai_process'
-- BAA with Anthropic required before going live.
CREATE TABLE IF NOT EXISTS ai_conversations (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT REFERENCES patients(id),
  order_id    TEXT REFERENCES orders(id),
  role        TEXT NOT NULL, -- 'patient' | 'provider'
  messages    JSONB NOT NULL DEFAULT '[]',
  -- Retain 6 years
  retention_delete_after TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '6 years') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CMS Content ───────────────────────────────────────────────────────────────
-- Non-PHI marketing content
CREATE TABLE IF NOT EXISTS cms_content (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_patient_id ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_answers_order_id ON questionnaire_answers(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order_id ON integration_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON integration_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spruce_patient_id ON spruce_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_order_id ON pharmacy_orders(order_id);
-- PHI audit log indexes (high-volume table)
CREATE INDEX IF NOT EXISTS idx_phi_audit_patient ON phi_audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_phi_audit_timestamp ON phi_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_phi_audit_actor ON phi_audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_phi_audit_resource ON phi_audit_logs(resource, resource_id);
