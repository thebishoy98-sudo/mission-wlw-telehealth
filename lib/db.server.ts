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

import { Client } from "pg";
import type {
  Patient, Order, Payment, Product, Question, QuestionnaireAnswer,
  ConsentRecord, Upload, ProviderReview, PharmacyOrder, PracticeQPacket,
  QuickBooksRecord, SpruceMessage, MessageTemplate, IntegrationLog,
  PracticeQAutomationJob,
} from "@/types";

// ── Products ──────────────────────────────────────────────────────────────────

export const productDb = {
  async getById(id: string): Promise<Product | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToProduct(rows[0]) : null;
  },

  async getBySlug(slug: string): Promise<Product | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM products WHERE slug = ${slug} LIMIT 1`;
    return rows[0] ? rowToProduct(rows[0]) : null;
  },

  async getAll(): Promise<Product[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`SELECT * FROM products WHERE is_active = true ORDER BY name ASC`;
    return rows.map(rowToProduct);
  },

  async upsert(p: Product): Promise<void> {
    if (!isDbAvailable()) return;
    // Use slug as conflict target since IDs are generated client-side and may differ
    await sql`
      INSERT INTO products (id, name, slug, description, long_description, starting_price, image, doses, eligibility_note, is_active, faqs, created_at)
      VALUES (${p.id}, ${p.name}, ${p.slug}, ${p.description}, ${p.longDescription ?? null},
        ${p.startingPrice}, ${p.image}, ${JSON.stringify(p.doses)}::jsonb, ${p.eligibilityNote},
        ${p.isActive}, ${JSON.stringify(p.faqs ?? [])}::jsonb, ${p.createdAt})
      ON CONFLICT (slug) DO NOTHING
    `;
  },

  async update(id: string, data: Partial<Product>): Promise<Product | null> {
    if (!isDbAvailable()) return null;
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: Product = { ...existing, ...data, id: existing.id };
    await sql`
      UPDATE products SET
        name = ${updated.name},
        slug = ${updated.slug},
        description = ${updated.description},
        long_description = ${updated.longDescription ?? null},
        starting_price = ${updated.startingPrice},
        image = ${updated.image},
        doses = ${JSON.stringify(updated.doses)}::jsonb,
        eligibility_note = ${updated.eligibilityNote},
        is_active = ${updated.isActive},
        faqs = ${JSON.stringify(updated.faqs ?? [])}::jsonb
      WHERE id = ${id}
    `;
    return updated;
  },

  async archive(id: string): Promise<boolean> {
    if (!isDbAvailable()) return false;
    const { rowCount } = await sql`
      UPDATE products SET is_active = false WHERE id = ${id}
    `;
    return (rowCount ?? 0) > 0;
  },
};

const isDbAvailable = () => !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

async function sql(strings: TemplateStringsArray, ...values: any[]) {
  const text = strings.reduce((query, chunk, index) => {
    return `${query}${index > 0 ? `$${index}` : ""}${chunk}`;
  }, "");
  const client = new Client({
    connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

export const appSettingDb = {
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT value FROM cms_content WHERE key = ${key} LIMIT 1`;
    return rows[0]?.value ?? null;
  },

  async set<T = unknown>(key: string, value: T): Promise<T> {
    if (!isDbAvailable()) return value;
    await sql`
      INSERT INTO cms_content (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return value;
  },
};

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

  async getByPhone(phone: string): Promise<Patient | null> {
    if (!isDbAvailable()) return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits) return null;
    const alternateDigits = digits.length === 10 ? `1${digits}` : digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const { rows } = await sql`
      SELECT * FROM patients
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
         OR regexp_replace(phone, '[^0-9]', '', 'g') = ${alternateDigits}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return rows[0] ? rowToPatient(rows[0]) : null;
  },

  async getByIds(ids: string[]): Promise<Patient[]> {
    if (!isDbAvailable()) return [];
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (!uniqueIds.length) return [];
    const { rows } = await sql`
      SELECT * FROM patients WHERE id = ANY(${uniqueIds}::text[])
    `;
    return rows.map(rowToPatient);
  },

  async create(p: Patient): Promise<Patient> {
    if (!isDbAvailable()) return p;
    await sql`
      INSERT INTO patients (id, first_name, last_name, date_of_birth, gender, phone, email,
        address, shipping_address, emergency_contact, created_at, updated_at)
      VALUES (${p.id}, ${p.firstName}, ${p.lastName}, ${p.dateOfBirth}, ${p.gender},
        ${p.phone}, ${p.email}, ${JSON.stringify(p.address)}::jsonb, ${JSON.stringify(p.shippingAddress)}::jsonb,
        ${JSON.stringify(p.emergencyContact ?? null)}::jsonb, ${p.createdAt}, ${p.updatedAt})
      ON CONFLICT (id) DO NOTHING
    `;
    return p;
  },

  async update(id: string, data: Partial<Patient>): Promise<Patient | null> {
    if (!isDbAvailable()) return null;
    const now = new Date().toISOString();
    await sql`
      UPDATE patients SET
        first_name = COALESCE(${data.firstName ?? null}, first_name),
        last_name  = COALESCE(${data.lastName ?? null}, last_name),
        date_of_birth = COALESCE(${data.dateOfBirth ?? null}, date_of_birth),
        gender     = COALESCE(${data.gender ?? null}, gender),
        phone      = COALESCE(${data.phone ?? null}, phone),
        email      = COALESCE(${data.email ?? null}, email),
        address    = COALESCE(${data.address ? JSON.stringify(data.address) : null}::jsonb, address),
        shipping_address = COALESCE(${data.shippingAddress ? JSON.stringify(data.shippingAddress) : null}::jsonb, shipping_address),
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

  async getByIdentityUploadToken(token: string): Promise<Order | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM orders WHERE identity_upload_token = ${token} LIMIT 1`;
    return rows[0] ? rowToOrder(rows[0]) : null;
  },

  async getByPatient(patientId: string): Promise<Order[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM orders WHERE patient_id = ${patientId} ORDER BY created_at DESC
    `;
    return rows.map(rowToOrder);
  },

  async getByStatus(status: string): Promise<Order[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM orders WHERE status = ${status} ORDER BY created_at DESC
    `;
    return rows.map(rowToOrder);
  },

  async getAll(): Promise<Order[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
    return rows.map(rowToOrder);
  },

  async create(o: Order): Promise<Order> {
    if (!isDbAvailable()) return o;
    await sql`
      INSERT INTO orders (id, patient_id, product_id, dose_id, status, payment_status,
        pharmacy_status, practice_q_status, quickbooks_status, practiceq_client_id, identity_status,
        identity_reason, identity_reviewed_at, identity_reviewed_by, identity_ai_result,
        identity_upload_token, created_at, updated_at)
      VALUES (${o.id}, ${o.patientId}, ${o.productId}, ${o.doseId}, ${o.status},
        ${o.paymentStatus}, ${o.pharmacyStatus}, ${o.practiceQStatus}, ${o.quickbooksStatus}, ${o.practiceqClientId ?? null},
        ${o.identityStatus ?? null}, ${o.identityReason ?? null}, ${o.identityReviewedAt ?? null},
        ${o.identityReviewedBy ?? null}, ${o.identityAiResult ? JSON.stringify(o.identityAiResult) : null}::jsonb,
        ${o.identityUploadToken ?? null}, ${o.createdAt}, ${o.updatedAt})
    `;
    return o;
  },

  async update(id: string, data: Partial<Order>): Promise<Order | null> {
    if (!isDbAvailable()) return null;
    const now = new Date().toISOString();
    await sql`
      UPDATE orders SET
        status             = COALESCE(${data.status ?? null}, status),
        payment_status     = COALESCE(${data.paymentStatus ?? null}, payment_status),
        pharmacy_status    = COALESCE(${data.pharmacyStatus ?? null}, pharmacy_status),
        practice_q_status  = COALESCE(${data.practiceQStatus ?? null}, practice_q_status),
        quickbooks_status  = COALESCE(${data.quickbooksStatus ?? null}, quickbooks_status),
        practiceq_client_id = COALESCE(${data.practiceqClientId ?? null}, practiceq_client_id),
        submitted_at       = COALESCE(${data.submittedAt ?? null}, submitted_at),
        approved_at        = COALESCE(${data.approvedAt ?? null}, approved_at),
        provider_notes     = COALESCE(${data.providerNotes ?? null}, provider_notes),
        rejection_reason   = COALESCE(${data.rejectionReason ?? null}, rejection_reason),
        identity_status    = COALESCE(${data.identityStatus ?? null}, identity_status),
        identity_reason    = COALESCE(${data.identityReason ?? null}, identity_reason),
        identity_reviewed_at = COALESCE(${data.identityReviewedAt ?? null}, identity_reviewed_at),
        identity_reviewed_by = COALESCE(${data.identityReviewedBy ?? null}, identity_reviewed_by),
        identity_ai_result = COALESCE(${data.identityAiResult ? JSON.stringify(data.identityAiResult) : null}::jsonb, identity_ai_result),
        identity_upload_token = COALESCE(${data.identityUploadToken ?? null}, identity_upload_token),
        updated_at         = ${now}
      WHERE id = ${id}
    `;
    return this.getById(id);
  },
};

// ── Uploads ───────────────────────────────────────────────────────────────────

export const uploadDb = {
  async getById(id: string): Promise<Upload | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM uploads WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToUpload(rows[0]) : null;
  },
  async getByOrder(orderId: string): Promise<Upload[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM uploads WHERE order_id = ${orderId} ORDER BY uploaded_at ASC
    `;
    return rows.map(rowToUpload);
  },

  async create(upload: Upload): Promise<Upload> {
    if (!isDbAvailable()) return upload;
    try {
      await sql`
        INSERT INTO uploads (id, order_id, type, filename, file_size, mime_type,
          storage_url, storage_key, base64_data, uploaded_at, status, verification_notes)
        VALUES (${upload.id}, ${upload.orderId}, ${upload.type}, ${upload.filename},
          ${upload.fileSize}, ${upload.mimeType}, ${upload.storageUrl ?? ""}, ${upload.storageKey ?? null}, ${upload.base64Data ?? ""},
          ${upload.uploadedAt}, ${upload.status}, ${upload.verificationNotes ?? null})
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      if (!String((error as Error).message).includes("storage_key")) throw error;
      await sql`
        INSERT INTO uploads (id, order_id, type, filename, file_size, mime_type,
          storage_url, base64_data, uploaded_at, status, verification_notes)
        VALUES (${upload.id}, ${upload.orderId}, ${upload.type}, ${upload.filename},
          ${upload.fileSize}, ${upload.mimeType}, ${upload.storageUrl ?? ""}, ${upload.base64Data ?? ""},
          ${upload.uploadedAt}, ${upload.status}, ${upload.verificationNotes ?? null})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    return upload;
  },

  async markStoredInPracticeQ(id: string, fileId: string): Promise<Upload | null> {
    if (!isDbAvailable()) return null;
    await sql`
      UPDATE uploads SET
        storage_url = ${`practiceq://files/${fileId}`},
        storage_key = ${fileId},
        base64_data = ''
      WHERE id = ${id}
    `;
    return this.getById(id);
  },

  async purgeBase64ByOrder(orderId: string): Promise<number> {
    if (!isDbAvailable()) return 0;
    const { rowCount } = await sql`
      UPDATE uploads
      SET base64_data = ''
      WHERE order_id = ${orderId}
        AND COALESCE(base64_data, '') <> ''
        AND storage_url LIKE 'practiceq://files/%'
    `;
    return rowCount ?? 0;
  },
};

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentDb = {
  async getByOrder(orderId: string): Promise<Payment | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM payments WHERE order_id = ${orderId} LIMIT 1`;
    return rows[0] ? rowToPayment(rows[0]) : null;
  },

  async getByOrders(orderIds: string[]): Promise<Payment[]> {
    if (!isDbAvailable()) return [];
    const uniqueOrderIds = Array.from(new Set(orderIds.map((id) => id.trim()).filter(Boolean)));
    if (!uniqueOrderIds.length) return [];
    const { rows } = await sql`
      SELECT DISTINCT ON (order_id) *
      FROM payments
      WHERE order_id = ANY(${uniqueOrderIds}::text[])
      ORDER BY order_id, created_at DESC
    `;
    return rows.map(rowToPayment);
  },

  async create(p: Payment): Promise<Payment> {
    if (!isDbAvailable()) return p;
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
    if (!isDbAvailable()) return;
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
    if (!isDbAvailable()) return a;
    await sql`
      INSERT INTO questionnaire_answers (id, order_id, question_id, answer, created_at)
      VALUES (${a.id}, ${a.orderId}, ${a.questionId}, ${a.answer}, ${a.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
    return a;
  },

  async deleteByOrder(orderId: string): Promise<number> {
    if (!isDbAvailable()) return 0;
    const { rowCount } = await sql`
      DELETE FROM questionnaire_answers WHERE order_id = ${orderId}
    `;
    return rowCount ?? 0;
  },
};

// ── Consent Records ───────────────────────────────────────────────────────────

export const consentDb = {
  async getByOrder(orderId: string): Promise<ConsentRecord | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM consent_records WHERE order_id = ${orderId} LIMIT 1
    `;
    return rows[0] ? rowToConsent(rows[0]) : null;
  },
  async create(c: ConsentRecord): Promise<ConsentRecord> {
    if (!isDbAvailable()) return c;
    await sql`
      INSERT INTO consent_records (
        id, order_id, consent_text, acknowledgments, signed_name, signed_at,
        ip_address, user_agent, consent_version
      )
      VALUES (${c.id}, ${c.orderId}, ${c.consentText}, ${JSON.stringify(c.acknowledgments)},
        ${c.signedName}, ${c.signedAt}, ${c.ipAddress ?? null}, ${c.userAgent ?? null},
        ${c.consentVersion ?? "1.0"})
      ON CONFLICT (id) DO NOTHING
    `;
    return c;
  },

  async deleteByOrder(orderId: string): Promise<number> {
    if (!isDbAvailable()) return 0;
    const { rowCount } = await sql`
      DELETE FROM consent_records WHERE order_id = ${orderId}
    `;
    return rowCount ?? 0;
  },
};

export const patientLoginOtpDb = {
  async create(entry: {
    id: string;
    phoneNumber: string;
    patientId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }) {
    if (!isDbAvailable()) return entry;
    await sql`
      INSERT INTO patient_login_otps (
        id, phone_number, patient_id, code_hash, expires_at, attempts, consumed_at, created_at
      ) VALUES (
        ${entry.id}, ${entry.phoneNumber}, ${entry.patientId}, ${entry.codeHash},
        ${entry.expiresAt}, 0, NULL, ${entry.createdAt}
      )
    `;
    return entry;
  },

  async getActive(phoneNumber: string) {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM patient_login_otps
      WHERE phone_number = ${phoneNumber}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async incrementAttempts(id: string) {
    if (!isDbAvailable()) return;
    await sql`
      UPDATE patient_login_otps
      SET attempts = attempts + 1
      WHERE id = ${id}
    `;
  },

  async consume(id: string) {
    if (!isDbAvailable()) return;
    await sql`
      UPDATE patient_login_otps
      SET consumed_at = NOW()
      WHERE id = ${id}
    `;
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

  async upsert(question: Question): Promise<Question> {
    if (!isDbAvailable()) return question;
    await sql`
      INSERT INTO questions (id, category, text, type, options, required, display_order, disqualifying)
      VALUES (
        ${question.id}, ${question.category}, ${question.text}, ${question.type},
        ${JSON.stringify(question.options ?? [])}::jsonb, ${question.required},
        ${question.displayOrder}, ${question.disqualifying ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        text = EXCLUDED.text,
        type = EXCLUDED.type,
        options = EXCLUDED.options,
        required = EXCLUDED.required,
        display_order = EXCLUDED.display_order,
        disqualifying = EXCLUDED.disqualifying
    `;
    return question;
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
    if (!isDbAvailable()) return [];
    const { rows } = await sql`SELECT * FROM provider_reviews ORDER BY created_at DESC`;
    return rows.map(rowToReview);
  },

  async create(r: ProviderReview): Promise<ProviderReview> {
    if (!isDbAvailable()) return r;
    await sql`
      INSERT INTO provider_reviews (id, order_id, patient_id, status, reviewed_at,
        reviewed_by, notes, rejection_reason, chart_viewed_at, chart_viewed_by,
        ai_summary, ai_flags, identity_ai_result, identity_review_required, created_at)
      VALUES (${r.id}, ${r.orderId}, ${r.patientId}, ${r.status},
        ${r.reviewedAt ?? null}, ${r.reviewedBy ?? null}, ${r.notes ?? null},
        ${r.rejectionReason ?? null}, ${r.chartViewedAt ?? null},
        ${r.chartViewedBy ?? null}, ${(r as any).aiSummary ?? null},
        ${JSON.stringify((r as any).aiFlags ?? [])}::jsonb,
        ${r.identityAiResult ? JSON.stringify(r.identityAiResult) : null}::jsonb,
        ${r.identityReviewRequired ?? false}, ${new Date().toISOString()})
    `;
    return r;
  },

  async update(id: string, data: Partial<ProviderReview> & { aiSummary?: string; aiFlags?: any[] }): Promise<ProviderReview | null> {
    if (!isDbAvailable()) return null;
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
        ai_flags         = COALESCE(${data.aiFlags ? JSON.stringify(data.aiFlags) : null}::jsonb, ai_flags),
        identity_ai_result = COALESCE(${data.identityAiResult ? JSON.stringify(data.identityAiResult) : null}::jsonb, identity_ai_result),
        identity_review_required = COALESCE(${data.identityReviewRequired ?? null}, identity_review_required)
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
      SELECT * FROM pharmacy_orders WHERE order_id = ${orderId} ORDER BY submitted_at DESC NULLS LAST LIMIT 1
    `;
    return rows[0] ? rowToPharmacyOrder(rows[0]) : null;
  },

  async getByOrders(orderIds: string[]): Promise<PharmacyOrder[]> {
    if (!isDbAvailable()) return [];
    const uniqueOrderIds = Array.from(new Set(orderIds.map((id) => id.trim()).filter(Boolean)));
    if (!uniqueOrderIds.length) return [];
    const { rows } = await sql`
      SELECT DISTINCT ON (order_id) *
      FROM pharmacy_orders
      WHERE order_id = ANY(${uniqueOrderIds}::text[])
      ORDER BY order_id, submitted_at DESC NULLS LAST
    `;
    return rows.map(rowToPharmacyOrder);
  },

  async getByLifeFileId(lifeFileOrderId: string): Promise<PharmacyOrder | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM pharmacy_orders WHERE life_file_order_id = ${lifeFileOrderId} LIMIT 1
    `;
    return rows[0] ? rowToPharmacyOrder(rows[0]) : null;
  },

  async create(o: PharmacyOrder): Promise<PharmacyOrder> {
    if (!isDbAvailable()) return o;
    await sql`
      INSERT INTO pharmacy_orders (id, order_id, patient_id, life_file_order_id, status,
        payload, submitted_at, last_error)
      VALUES (${o.id}, ${o.orderId}, ${o.patientId}, ${o.lifeFileOrderId ?? null},
        ${o.status}, ${JSON.stringify(o.payload)}::jsonb, ${o.submittedAt ?? new Date().toISOString()},
        ${o.lastError ?? null})
    `;
    return o;
  },

  async update(id: string, data: Partial<PharmacyOrder>): Promise<void> {
    if (!isDbAvailable()) return;
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
    if (!isDbAvailable()) return;
    await sql`
      INSERT INTO integration_logs (id, timestamp, integration_name, action, order_id,
        patient_id, status, details, error)
      VALUES (${log.id}, ${log.timestamp}, ${log.integrationName}, ${log.action},
        ${log.orderId ?? null}, ${log.patientId ?? null}, ${log.status},
        ${JSON.stringify(log.details)}::jsonb, ${log.error ?? null})
    `;
  },

  async getAll(): Promise<IntegrationLog[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM integration_logs ORDER BY timestamp DESC LIMIT 500
    `;
    return rows.map((r) => ({
      id: r.id, timestamp: r.timestamp, integrationName: r.integration_name,
      action: r.action, orderId: r.order_id, patientId: r.patient_id,
      status: r.status, details: r.details, error: r.error,
    }));
  },

  async getByOrder(orderId: string): Promise<IntegrationLog[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM integration_logs WHERE order_id = ${orderId} ORDER BY timestamp DESC LIMIT 50
    `;
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      integrationName: r.integration_name,
      action: r.action,
      orderId: r.order_id,
      patientId: r.patient_id,
      status: r.status,
      details: r.details,
      error: r.error,
    }));
  },
};

// ── Spruce Messages ───────────────────────────────────────────────────────────

export const spruceMessageDb = {
  async create(message: SpruceMessage): Promise<SpruceMessage> {
    if (!isDbAvailable()) return message;
    await sql`
      INSERT INTO spruce_messages (id, order_id, patient_id, template_key, phone_number,
        message_text, status, scheduled_for, sent_at, created_at)
      VALUES (${message.id}, ${message.orderId || null}, ${message.patientId}, ${message.templateKey},
        ${message.phoneNumber}, ${message.messageText}, ${message.status},
        ${message.scheduledFor ?? null}, ${message.sentAt ?? null}, ${message.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
    return message;
  },

  async update(id: string, data: Partial<SpruceMessage>): Promise<void> {
    if (!isDbAvailable()) return;
    await sql`
      UPDATE spruce_messages SET
        status = COALESCE(${data.status ?? null}, status),
        sent_at = COALESCE(${data.sentAt ?? null}, sent_at),
        scheduled_for = COALESCE(${data.scheduledFor ?? null}, scheduled_for)
      WHERE id = ${id}
    `;
  },

  async getByOrder(orderId: string): Promise<SpruceMessage[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM spruce_messages WHERE order_id = ${orderId} ORDER BY created_at DESC
    `;
    return rows.map(rowToSpruceMessage);
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
    if (!isDbAvailable()) return data;
    const now = new Date().toISOString();
    await sql`
      INSERT INTO ai_conversations (id, patient_id, order_id, role, messages, created_at, updated_at)
      VALUES (${data.id}, ${data.patientId ?? null}, ${data.orderId ?? null},
        ${data.role}, ${JSON.stringify(data.messages)}::jsonb, ${now}, ${now})
    `;
    return data;
  },

  async appendMessage(id: string, message: { role: string; content: string }) {
    if (!isDbAvailable()) return;
    await sql`
      UPDATE ai_conversations
      SET messages   = messages || ${JSON.stringify([message])}::jsonb,
          updated_at = NOW()
      WHERE id = ${id}
    `;
  },
};

// ── PracticeQ Packets ─────────────────────────────────────────────────────────

export const practiceqPacketDb = {
  async getByOrder(orderId: string): Promise<PracticeQPacket | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM practiceq_packets WHERE order_id = ${orderId} ORDER BY submitted_at DESC LIMIT 1`;
    return rows[0] ? rowToPracticeQPacket(rows[0]) : null;
  },

  async create(packet: PracticeQPacket): Promise<PracticeQPacket> {
    if (!isDbAvailable()) return packet;
    await sql`
      INSERT INTO practiceq_packets (id, order_id, patient_id, status, packet_data, last_error, last_sync_at, submitted_at)
      VALUES (${packet.id}, ${packet.orderId}, ${packet.patientId}, ${packet.status},
        ${JSON.stringify(packet.packetData)}::jsonb, ${packet.lastError ?? null},
        ${packet.lastSyncAt ?? null}, ${packet.submittedAt})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        packet_data = EXCLUDED.packet_data,
        last_error = EXCLUDED.last_error,
        last_sync_at = EXCLUDED.last_sync_at,
        submitted_at = EXCLUDED.submitted_at
    `;
    return packet;
  },

  async update(id: string, data: Partial<PracticeQPacket>): Promise<PracticeQPacket | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    await this.create(updated);
    return updated;
  },

  async getById(id: string): Promise<PracticeQPacket | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`SELECT * FROM practiceq_packets WHERE id = ${id} LIMIT 1`;
    return rows[0] ? rowToPracticeQPacket(rows[0]) : null;
  },
};

export const practiceqAutomationJobDb = {
  async create(job: PracticeQAutomationJob): Promise<PracticeQAutomationJob> {
    if (!isDbAvailable()) return job;
    await sql`
      INSERT INTO practiceq_automation_jobs (
        id, order_id, patient_id, status, attempts, practiceq_start_url,
        handoff_token, handoff_expires_at, handoff_url, intake_id, last_error, created_at, updated_at, locked_at
      ) VALUES (
        ${job.id}, ${job.orderId}, ${job.patientId}, ${job.status}, ${job.attempts},
        ${job.practiceQStartUrl}, ${job.handoffToken}, ${job.handoffExpiresAt},
        ${job.handoffUrl ?? null}, ${job.intakeId ?? null},
        ${job.lastError ?? null}, ${job.createdAt}, ${job.updatedAt}, ${job.lockedAt ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        attempts = EXCLUDED.attempts,
        practiceq_start_url = EXCLUDED.practiceq_start_url,
        handoff_token = EXCLUDED.handoff_token,
        handoff_expires_at = EXCLUDED.handoff_expires_at,
        handoff_url = EXCLUDED.handoff_url,
        intake_id = EXCLUDED.intake_id,
        last_error = EXCLUDED.last_error,
        updated_at = EXCLUDED.updated_at,
        locked_at = EXCLUDED.locked_at
    `;
    return job;
  },

  async getByOrder(orderId: string): Promise<PracticeQAutomationJob | null> {
    if (!isDbAvailable()) return null;
    const { rows } = await sql`
      SELECT * FROM practiceq_automation_jobs WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1
    `;
    return rows[0] ? rowToPracticeQAutomationJob(rows[0]) : null;
  },

  async getQueued(limit = 10): Promise<PracticeQAutomationJob[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM practiceq_automation_jobs
      WHERE status = 'queued'
         OR (status = 'running' AND attempts < 10 AND locked_at < NOW() - INTERVAL '10 minutes')
         OR (
           status = 'failed'
           AND intake_id IS NULL
           AND attempts < 10
           AND COALESCE(last_error, '') NOT LIKE 'Missing required patient vitals for IntakeQ:%'
           AND COALESCE(last_error, '') NOT LIKE 'PracticeQ choice selection step timed out.%'
           AND COALESCE(last_error, '') NOT LIKE 'PracticeQ text field fill step timed out.%'
         )
      ORDER BY
        CASE
          WHEN status = 'queued' THEN 0
          WHEN status = 'running' THEN 1
          ELSE 2
        END,
        created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(rowToPracticeQAutomationJob);
  },

  async getFailedWithNoIntake(): Promise<PracticeQAutomationJob[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM practiceq_automation_jobs
      WHERE status = 'failed'
        AND intake_id IS NULL
        AND COALESCE(last_error, '') NOT LIKE 'Missing required patient vitals for IntakeQ:%'
        AND COALESCE(last_error, '') NOT LIKE 'PracticeQ choice selection step timed out.%'
        AND COALESCE(last_error, '') NOT LIKE 'PracticeQ text field fill step timed out.%'
      ORDER BY created_at ASC
    `;
    return rows.map(rowToPracticeQAutomationJob);
  },

  async getAdminCompletionRetryCandidates(limit = 5): Promise<PracticeQAutomationJob[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM practiceq_automation_jobs
      WHERE status = 'failed'
        AND intake_id IS NOT NULL
        AND attempts < 15
        AND last_error LIKE 'PracticeQ admin Set as Completed failed%'
      ORDER BY updated_at ASC
      LIMIT ${limit}
    `;
    return rows.map(rowToPracticeQAutomationJob);
  },

  async update(id: string, data: Partial<PracticeQAutomationJob>): Promise<PracticeQAutomationJob | null> {
    if (!isDbAvailable()) return null;
    const existingRows = await sql`SELECT * FROM practiceq_automation_jobs WHERE id = ${id} LIMIT 1`;
    if (!existingRows.rows[0]) return null;
    const existing = rowToPracticeQAutomationJob(existingRows.rows[0]);
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await this.create(updated);
    return updated;
  },

  async getStatusSummary(): Promise<{ status: string; count: number; lastError?: string | null }[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT status, COUNT(*)::int AS count, MAX(last_error) AS last_error
      FROM practiceq_automation_jobs
      GROUP BY status
      ORDER BY status
    `;
    return rows.map((r) => ({ status: r.status, count: r.count, lastError: r.last_error ?? null }));
  },

  async getRecent(limit = 10): Promise<PracticeQAutomationJob[]> {
    if (!isDbAvailable()) return [];
    const { rows } = await sql`
      SELECT * FROM practiceq_automation_jobs
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToPracticeQAutomationJob);
  },
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToProduct(r: any): Product {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    longDescription: r.long_description ?? undefined,
    startingPrice: r.starting_price,
    image: r.image,
    doses: r.doses ?? [],
    eligibilityNote: r.eligibility_note ?? "",
    isActive: r.is_active,
    faqs: r.faqs ?? [],
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

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
    identityStatus: r.identity_status ?? undefined,
    identityReason: r.identity_reason ?? undefined,
    identityReviewedAt: r.identity_reviewed_at ?? undefined,
    identityReviewedBy: r.identity_reviewed_by ?? undefined,
    identityAiResult: r.identity_ai_result ?? undefined,
    identityUploadToken: r.identity_upload_token ?? undefined,
    practiceqClientId: r.practiceq_client_id === undefined || r.practiceq_client_id === null ? undefined : String(r.practiceq_client_id),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowToUpload(r: any): Upload {
  return {
    id: r.id,
    orderId: r.order_id,
    type: r.type,
    filename: r.filename,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    storageUrl: r.storage_url ?? undefined,
    storageKey: r.storage_key ?? undefined,
    base64Data: r.base64_data ?? "",
    uploadedAt: r.uploaded_at,
    status: r.status,
    verificationNotes: r.verification_notes ?? undefined,
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

function rowToConsent(r: any): ConsentRecord {
  return {
    id: r.id,
    orderId: r.order_id,
    consentText: r.consent_text,
    acknowledgments: r.acknowledgments ?? {},
    signedName: r.signed_name,
    signedAt: r.signed_at,
    ipAddress: r.ip_address ?? undefined,
    userAgent: r.user_agent ?? undefined,
    consentVersion: r.consent_version ?? undefined,
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
    identityAiResult: r.identity_ai_result ?? undefined,
    identityReviewRequired: r.identity_review_required ?? undefined,
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

function rowToPracticeQPacket(r: any): PracticeQPacket {
  return {
    id: r.id,
    orderId: r.order_id,
    patientId: r.patient_id,
    submittedAt: r.submitted_at,
    packetData: r.packet_data ?? {},
    status: r.status,
    lastSyncAt: r.last_sync_at ?? undefined,
    lastError: r.last_error ?? undefined,
  };
}

function rowToPracticeQAutomationJob(r: any): PracticeQAutomationJob {
  return {
    id: r.id,
    orderId: r.order_id,
    patientId: r.patient_id,
    status: r.status,
    attempts: Number(r.attempts ?? 0),
    practiceQStartUrl: r.practiceq_start_url,
    handoffToken: r.handoff_token,
    handoffExpiresAt: r.handoff_expires_at,
    handoffUrl: r.handoff_url ?? undefined,
    intakeId: r.intake_id ?? undefined,
    lastError: r.last_error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lockedAt: r.locked_at ?? undefined,
  };
}

function rowToSpruceMessage(r: any): SpruceMessage {
  return {
    id: r.id,
    orderId: r.order_id ?? "",
    patientId: r.patient_id,
    templateKey: r.template_key,
    phoneNumber: r.phone_number,
    messageText: r.message_text,
    status: r.status,
    scheduledFor: r.scheduled_for ?? undefined,
    sentAt: r.sent_at ?? undefined,
    createdAt: r.created_at,
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

export const adminMaintenanceDb = {
  async deleteSmokeTestData() {
    if (!isDbAvailable()) {
      return { patients: 0, orders: 0 };
    }

    const patientRows = await sql`
      SELECT id FROM patients
      WHERE LOWER(first_name) = 'smoke'
         OR (
           LOWER(first_name) = 'pq'
           AND LOWER(last_name) LIKE 'check%'
           AND LOWER(email) LIKE 'pq-real-check%@missionwlw.com'
         )
         OR LOWER(email) LIKE 'practiceq-smoke-%@missionwlw.com'
         OR LOWER(email) LIKE 'smoke-%@missionwlw.com'
    `;
    const patientIds = patientRows.rows.map((row) => row.id);
    if (!patientIds.length) return { patients: 0, orders: 0 };

    const orderRows = await sql`
      SELECT id FROM orders WHERE patient_id = ANY(${patientIds})
    `;
    const orderIds = orderRows.rows.map((row) => row.id);

    if (orderIds.length) {
      await sql`DELETE FROM spruce_messages WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM integration_logs WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM practiceq_automation_jobs WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM practiceq_packets WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM provider_reviews WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM pharmacy_orders WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM quickbooks_records WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM uploads WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM consent_records WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM questionnaire_answers WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM payments WHERE order_id = ANY(${orderIds})`;
      await sql`DELETE FROM orders WHERE id = ANY(${orderIds})`;
    }

    const deletedPatients = await sql`DELETE FROM patients WHERE id = ANY(${patientIds})`;
    return {
      patients: deletedPatients.rowCount ?? 0,
      orders: orderIds.length,
    };
  },
};
