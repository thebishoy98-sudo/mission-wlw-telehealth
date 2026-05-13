/**
 * Server-side database layer using Vercel Postgres.
 *
 * Used by all API routes. Falls back to localStorage-compatible mock
 * when DATABASE_URL is not set (local dev without a real DB).
 *
 * Setup:
 *   1. Vercel Dashboard → Storage → Create Postgres database
 *   2. Connect to your project (auto-sets POSTGRES_URL env var)
 *   3. Run: npx vercel env pull .env.local
 *   4. Run: npm run db:migrate
 */

import { sql } from "@vercel/postgres";
import type {
  Patient, Order, Payment, Product, Question, QuestionnaireAnswer,
  ConsentRecord, Upload, ProviderReview, PharmacyOrder, PracticeQPacket,
  QuickBooksRecord, SpruceMessage, MessageTemplate, IntegrationLog,
} from "@/types";

const isDbAvailable = () => !!process.env.POSTGRES_URL;

// ── Patients ──────────────────────────────────────────────────────────────────

export const patientDb = {
  async getById(id: string): Promise<Patient | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM patients WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToPatient(rows[0]) : null;
  },

  async getByEmail(email: string): Promise<Patient | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM patients WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
    return rows[0] ? rowToPatient(rows[0]) : null;
  },

  async create(p: Patient): Promise<Patient> {
    await sql`
      INSERT INTO patients (id, first_name, last_name, date_of_birth, gender, phone, email,
        address, shipping_address, emergency_contact, created_at, updated_at)
      VALUES (${p.id}, ${p.firstName}, ${p.lastName}, ${p.dateOfBirth}, ${p.gender},
        ${p.phone}, ${p.email}, ${JSON.stringify(p.address)}, ${JSON.stringify(p.shippingAddress)},
        ${JSON.stringify(p.emergencyContact ?? null)}, ${p.createdAt}, ${p.updatedAt})
      ON CONFLICT (id) DO NOTHING
    `;
    return p;
  },

  async update(id: string, data: Partial<Patient>): Promise<Patient | null> {
    const now = new Date().toISOString();
    await sql`
      UPDATE patients SET
        first_name = COALESCE(${data.firstName ?? null}, first_name),
        last_name  = COALESCE(${data.lastName ?? null}, last_name),
        phone      = COALESCE(${data.phone ?? null}, phone),
        email      = COALESCE(${data.email ?? null}, email),
        updated_at = ${now}
      WHERE id = ${id}
    `;
    return this.getById(id);
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────

export const orderDb = {
  async getById(id: string): Promise<Order | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToOrder(rows[0]) : null;
  },

  async getByPatient(patientId: string): Promise<Order[]> {
    const { rows } = await sql`
      SELECT * FROM orders WHERE patient_id = ${patientId} ORDER BY created_at DESC
    `;
    return rows.map(rowToOrder);
  },

  async getByStatus(status: string): Promise<Order[]> {
    const { rows } = await sql`
      SELECT * FROM orders WHERE status = ${status} ORDER BY created_at DESC
    `;
    return rows.map(rowToOrder);
  },

  async getAll(): Promise<Order[]> {
    const { rows } = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
    return rows.map(rowToOrder);
  },

  async create(o: Order): Promise<Order> {
    await sql`
      INSERT INTO orders (id, patient_id, product_id, dose_id, status, payment_status,
        pharmacy_status, practice_q_status, quickbooks_status, created_at, updated_at)
      VALUES (${o.id}, ${o.patientId}, ${o.productId}, ${o.doseId}, ${o.status},
        ${o.paymentStatus}, ${o.pharmacyStatus}, ${o.practiceQStatus}, ${o.quickbooksStatus},
        ${o.createdAt}, ${o.updatedAt})
    `;
    return o;
  },

  async update(id: string, data: Partial<Order>): Promise<Order | null> {
    const now = new Date().toISOString();
    await sql`
      UPDATE orders SET
        status             = COALESCE(${data.status ?? null}, status),
        payment_status     = COALESCE(${data.paymentStatus ?? null}, payment_status),
        pharmacy_status    = COALESCE(${data.pharmacyStatus ?? null}, pharmacy_status),
        practice_q_status  = COALESCE(${data.practiceQStatus ?? null}, practice_q_status),
        quickbooks_status  = COALESCE(${data.quickbooksStatus ?? null}, quickbooks_status),
        submitted_at       = COALESCE(${data.submittedAt ?? null}, submitted_at),
        approved_at        = COALESCE(${data.approvedAt ?? null}, approved_at),
        provider_notes     = COALESCE(${data.providerNotes ?? null}, provider_notes),
        rejection_reason   = COALESCE(${data.rejectionReason ?? null}, rejection_reason),
        updated_at         = ${now}
      WHERE id = ${id}
    `;
    return this.getById(id);
  },
};

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentDb = {
  async getByOrder(orderId: string): Promise<Payment | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM payments WHERE order_id = ${orderId} LIMIT 1`;
    return rows[0] ? rowToPayment(rows[0]) : null;
  },

  async create(p: Payment): Promise<Payment> {
    await sql`
      INSERT INTO payments (id, order_id, patient_id, amount, currency, status,
        payment_method, card_last4, card_brand, transaction_id, created_at, processed_at)
      VALUES (${p.id}, ${p.orderId}, ${p.patientId}, ${p.amount}, ${p.currency},
        ${p.status}, ${p.paymentMethod}, ${p.cardLast4}, ${p.cardBrand},
        ${p.transactionId}, ${p.createdAt}, ${p.processedAt ?? null})
    `;
    return p;
  },

  async update(id: string, data: Partial<Payment>): Promise<void> {
    await sql`
      UPDATE payments SET
        status         = COALESCE(${data.status ?? null}, status),
        processed_at   = COALESCE(${data.processedAt ?? null}, processed_at),
        refunded_at    = COALESCE(${data.refundedAt ?? null}, refunded_at),
        refund_amount  = COALESCE(${data.refundAmount ?? null}, refund_amount)
      WHERE id = ${id}
    `;
  },
};

// ── Questionnaire Answers ─────────────────────────────────────────────────────

export const answerDb = {
  async getByOrder(orderId: string): Promise<QuestionnaireAnswer[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM questionnaire_answers WHERE order_id = ${orderId}
    `;
    return rows.map((r) => ({
      id: r.id, orderId: r.order_id, questionId: r.question_id,
      answer: r.answer, createdAt: r.created_at,
    }));
  },

  async create(a: QuestionnaireAnswer): Promise<QuestionnaireAnswer> {
    await sql`
      INSERT INTO questionnaire_answers (id, order_id, question_id, answer, created_at)
      VALUES (${a.id}, ${a.orderId}, ${a.questionId}, ${a.answer}, ${a.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
    return a;
  },
};

// ── Questions ─────────────────────────────────────────────────────────────────

export const questionDb = {
  async getAll(): Promise<Question[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`SELECT * FROM questions ORDER BY display_order ASC`;
    return rows.map((r) => ({
      id: r.id, category: r.category, text: r.text, type: r.type,
      options: r.options ?? [], required: r.required,
      displayOrder: r.display_order, disqualifying: r.disqualifying ?? undefined,
    }));
  },
};

// ── Provider Reviews ──────────────────────────────────────────────────────────

export const providerReviewDb = {
  async getByOrder(orderId: string): Promise<ProviderReview | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM provider_reviews WHERE order_id = ${orderId} LIMIT 1
    `;
    return rows[0] ? rowToReview(rows[0]) : null;
  },

  async getAll(): Promise<ProviderReview[]> {
    const { rows } = await sql`SELECT * FROM provider_reviews ORDER BY created_at DESC`;
    return rows.map(rowToReview);
  },

  async create(r: ProviderReview): Promise<ProviderReview> {
    await sql`
      INSERT INTO provider_reviews (id, order_id, patient_id, status, reviewed_at,
        reviewed_by, notes, rejection_reason, chart_viewed_at, chart_viewed_by,
        ai_summary, ai_flags, created_at)
      VALUES (${r.id}, ${r.orderId}, ${r.patientId}, ${r.status},
        ${r.reviewedAt ?? null}, ${r.reviewedBy ?? null}, ${r.notes ?? null},
        ${r.rejectionReason ?? null}, ${r.chartViewedAt ?? null},
        ${r.chartViewedBy ?? null}, ${(r as any).aiSummary ?? null},
        ${JSON.stringify((r as any).aiFlags ?? [])}, ${new Date().toISOString()})
    `;
    return r;
  },

  async update(id: string, data: Partial<ProviderReview> & { aiSummary?: string; aiFlags?: any[] }): Promise<ProviderReview | null> {
    await sql`
      UPDATE provider_reviews SET
        status           = COALESCE(${data.status ?? null}, status),
        reviewed_at      = COALESCE(${data.reviewedAt ?? null}, reviewed_at),
        reviewed_by      = COALESCE(${data.reviewedBy ?? null}, reviewed_by),
        notes            = COALESCE(${data.notes ?? null}, notes),
        rejection_reason = COALESCE(${data.rejectionReason ?? null}, rejection_reason),
        chart_viewed_at  = COALESCE(${data.chartViewedAt ?? null}, chart_viewed_at),
        chart_viewed_by  = COALESCE(${data.chartViewedBy ?? null}, chart_viewed_by),
        ai_summary       = COALESCE(${data.aiSummary ?? null}, ai_summary),
        ai_flags         = COALESCE(${data.aiFlags ? JSON.stringify(data.aiFlags) : null}::jsonb, ai_flags)
      WHERE id = ${id}
    `;
    return this.getByOrder(id);
  },
};

// ── Pharmacy Orders ───────────────────────────────────────────────────────────

export const pharmacyOrderDb = {
  async getByOrder(orderId: string): Promise<PharmacyOrder | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM pharmacy_orders WHERE order_id = ${orderId} LIMIT 1
    `;
    return rows[0] ? rowToPharmacyOrder(rows[0]) : null;
  },

  async getByLifeFileId(lifeFileOrderId: string): Promise<PharmacyOrder | null> {
    const { rows } = await sql`
      SELECT * FROM pharmacy_orders WHERE life_file_order_id = ${lifeFileOrderId} LIMIT 1
    `;
    return rows[0] ? rowToPharmacyOrder(rows[0]) : null;
  },

  async create(o: PharmacyOrder): Promise<PharmacyOrder> {
    await sql`
      INSERT INTO pharmacy_orders (id, order_id, patient_id, life_file_order_id, status,
        payload, submitted_at)
      VALUES (${o.id}, ${o.orderId}, ${o.patientId}, ${o.lifeFileOrderId ?? null},
        ${o.status}, ${JSON.stringify(o.payload)}, ${o.submittedAt ?? new Date().toISOString()})
    `;
    return o;
  },

  async update(id: string, data: Partial<PharmacyOrder>): Promise<void> {
    await sql`
      UPDATE pharmacy_orders SET
        status           = COALESCE(${data.status ?? null}, status),
        tracking_number  = COALESCE(${data.trackingNumber ?? null}, tracking_number),
        shipped_at       = COALESCE(${data.shippedAt ?? null}, shipped_at),
        delivered_at     = COALESCE(${data.deliveredAt ?? null}, delivered_at),
        last_error       = COALESCE(${data.lastError ?? null}, last_error)
      WHERE id = ${id}
    `;
  },
};

// ── Integration Logs ──────────────────────────────────────────────────────────

export const integrationLogDb = {
  async create(log: IntegrationLog): Promise<void> {
    await sql`
      INSERT INTO integration_logs (id, timestamp, integration_name, action, order_id,
        patient_id, status, details, error)
      VALUES (${log.id}, ${log.timestamp}, ${log.integrationName}, ${log.action},
        ${log.orderId ?? null}, ${log.patientId ?? null}, ${log.status},
        ${JSON.stringify(log.details)}, ${log.error ?? null})
    `;
  },

  async getAll(): Promise<IntegrationLog[]> {
    const { rows } = await sql`
      SELECT * FROM integration_logs ORDER BY timestamp DESC LIMIT 500
    `;
    return rows.map((r) => ({
      id: r.id, timestamp: r.timestamp, integrationName: r.integration_name,
      action: r.action, orderId: r.order_id, patientId: r.patient_id,
      status: r.status, details: r.details, error: r.error,
    }));
  },
};

// ── Message Templates ─────────────────────────────────────────────────────────

export const messageTemplateDb = {
  async getByKey(key: string): Promise<MessageTemplate | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM message_templates WHERE key = ${key} LIMIT 1
    `;
    return rows[0] ? {
      id: rows[0].id, key: rows[0].key, category: rows[0].category,
      subject: rows[0].subject, body: rows[0].body,
      variables: rows[0].variables, createdAt: rows[0].created_at,
    } : null;
  },
};

// ── AI Conversations ──────────────────────────────────────────────────────────

export const aiConversationDb = {
  async get(id: string) {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM ai_conversations WHERE id = ${id} LIMIT 1`;
    return rows[0] ?? null;
  },

  async create(data: { id: string; patientId?: string; orderId?: string; role: string; messages: any[] }) {
    const now = new Date().toISOString();
    await sql`
      INSERT INTO ai_conversations (id, patient_id, order_id, role, messages, created_at, updated_at)
      VALUES (${data.id}, ${data.patientId ?? null}, ${data.orderId ?? null},
        ${data.role}, ${JSON.stringify(data.messages)}, ${now}, ${now})
    `;
    return data;
  },

  async appendMessage(id: string, message: { role: string; content: string }) {
    await sql`
      UPDATE ai_conversations
      SET messages   = messages || ${JSON.stringify([message])}::jsonb,
          updated_at = NOW()
      WHERE id = ${id}
    `;
  },
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToPatient(r: any): Patient {
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name,
    dateOfBirth: r.date_of_birth, gender: r.gender, phone: r.phone, email: r.email,
    address: r.address, shippingAddress: r.shipping_address,
    emergencyContact: r.emergency_contact ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowToOrder(r: any): Order {
  return {
    id: r.id, patientId: r.patient_id, productId: r.product_id, doseId: r.dose_id,
    status: r.status, paymentStatus: r.payment_status, pharmacyStatus: r.pharmacy_status,
    practiceQStatus: r.practice_q_status, quickbooksStatus: r.quickbooks_status,
    submittedAt: r.submitted_at ?? undefined, approvedAt: r.approved_at ?? undefined,
    providerNotes: r.provider_notes ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowToPayment(r: any): Payment {
  return {
    id: r.id, orderId: r.order_id, patientId: r.patient_id,
    amount: r.amount, currency: r.currency, status: r.status,
    paymentMethod: r.payment_method, cardLast4: r.card_last4, cardBrand: r.card_brand,
    transactionId: r.transaction_id, createdAt: r.created_at,
    processedAt: r.processed_at ?? undefined, refundedAt: r.refunded_at ?? undefined,
    refundAmount: r.refund_amount ?? undefined,
  };
}

function rowToReview(r: any): ProviderReview {
  return {
    id: r.id, orderId: r.order_id, patientId: r.patient_id, status: r.status,
    reviewedAt: r.reviewed_at ?? undefined, reviewedBy: r.reviewed_by ?? undefined,
    notes: r.notes ?? undefined, approvedDose: r.approved_dose ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    chartViewedAt: r.chart_viewed_at ?? undefined,
    chartViewedBy: r.chart_viewed_by ?? undefined,
  };
}

function rowToPharmacyOrder(r: any): PharmacyOrder {
  return {
    id: r.id, orderId: r.order_id, patientId: r.patient_id,
    lifeFileOrderId: r.life_file_order_id ?? undefined,
    status: r.status, payload: r.payload,
    trackingNumber: r.tracking_number ?? undefined,
    shippedAt: r.shipped_at ?? undefined, deliveredAt: r.delivered_at ?? undefined,
    submittedAt: r.submitted_at ?? undefined, lastError: r.last_error ?? undefined,
  };
}

// ── PHI Audit Logs ────────────────────────────────────────────────────────────
// HIPAA § 164.312(b) — INSERT ONLY. Never update or delete rows in this table.

export const phiAuditDb = {
  async create(entry: {
    id: string; timestamp: string; action: string; resource: string;
    resourceId: string; patientId?: string; orderId?: string;
    actor: string; actorIp?: string; requestId?: string;
    disclosedTo?: string; outcome: string; errorMessage?: string;
  }): Promise<void> {
    if (!isDbAvailable()) return;
    await sql`
      INSERT INTO phi_audit_logs (
        id, timestamp, action, resource, resource_id, patient_id, order_id,
        actor, actor_ip, request_id, disclosed_to, outcome, error_message
      ) VALUES (
        ${entry.id}, ${entry.timestamp}, ${entry.action}, ${entry.resource},
        ${entry.resourceId}, ${entry.patientId ?? null}, ${entry.orderId ?? null},
        ${entry.actor}, ${entry.actorIp ?? null}, ${entry.requestId ?? null},
        ${entry.disclosedTo ?? null}, ${entry.outcome}, ${entry.errorMessage ?? null}
      )
    `;
  },

  async getByPatient(patientId: string, limit = 200) {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM phi_audit_logs
      WHERE patient_id = ${patientId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return rows;
  },

  async getRecent(limit = 500) {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM phi_audit_logs ORDER BY timestamp DESC LIMIT ${limit}
    `;
    return rows;
  },
};
