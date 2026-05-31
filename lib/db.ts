import * as Types from "@/types";

// Database keys
const KEYS = {
  PATIENTS: "tele_patients",
  PRODUCTS: "tele_products",
  ORDERS: "tele_orders",
  PAYMENTS: "tele_payments",
  UPLOADS: "tele_uploads",
  QUESTIONNAIRE_ANSWERS: "tele_questionnaire_answers",
  QUESTIONS: "tele_questions",
  CONSENT_RECORDS: "tele_consent_records",
  PHARMACY_ORDERS: "tele_pharmacy_orders",
  PRACTICEQ_PACKETS: "tele_practiceq_packets",
  QUICKBOOKS_RECORDS: "tele_quickbooks_records",
  SPRUCE_MESSAGES: "tele_spruce_messages",
  INTEGRATION_LOGS: "tele_integration_logs",
  CMS_CONTENT: "tele_cms_content",
  MESSAGE_TEMPLATES: "tele_message_templates",
  PROVIDER_REVIEWS: "tele_provider_reviews",
  PRACTICEQ_AUTOMATION_JOBS: "tele_practiceq_automation_jobs",
};

// PHI must not persist to disk. Use sessionStorage so data is cleared when the
// browser tab closes. localStorage is avoided for HIPAA compliance.
const getFromStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === "undefined") return defaultValue;
  const item = sessionStorage.getItem(key);
  if (!item) return defaultValue;
  try {
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
};

const setToStorage = <T>(key: string, value: T): void => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(value));
};

// Patient operations
export const patientDb = {
  getAll: (): Types.Patient[] => getFromStorage(KEYS.PATIENTS, []),
  getById: (id: string): Types.Patient | null => {
    const patients = patientDb.getAll();
    return patients.find((p) => p.id === id) || null;
  },
  getByEmail: (email: string): Types.Patient | null => {
    const patients = patientDb.getAll();
    return patients.find((p) => p.email.toLowerCase() === email.toLowerCase()) || null;
  },
  getByPhone: (phone: string): Types.Patient | null => {
    const digits = phone.replace(/\D/g, "");
    const alternateDigits = digits.length === 10 ? `1${digits}` : digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const patients = patientDb.getAll();
    return patients.find((p) => {
      const patientDigits = p.phone.replace(/\D/g, "");
      return patientDigits === digits || patientDigits === alternateDigits;
    }) || null;
  },
  create: (patient: Types.Patient): Types.Patient => {
    const patients = patientDb.getAll();
    patients.push(patient);
    setToStorage(KEYS.PATIENTS, patients);
    return patient;
  },
  update: (id: string, data: Partial<Types.Patient>): Types.Patient | null => {
    const patients = patientDb.getAll();
    const index = patients.findIndex((p) => p.id === id);
    if (index === -1) return null;
    patients[index] = { ...patients[index], ...data, updatedAt: new Date().toISOString() };
    setToStorage(KEYS.PATIENTS, patients);
    return patients[index];
  },
};

// Product operations
export const productDb = {
  getAll: (): Types.Product[] => getFromStorage(KEYS.PRODUCTS, []),
  getById: (id: string): Types.Product | null => {
    const products = productDb.getAll();
    return products.find((p) => p.id === id) || null;
  },
  getActive: (): Types.Product[] => {
    return productDb.getAll().filter((p) => p.isActive);
  },
  create: (product: Types.Product): Types.Product => {
    const products = productDb.getAll();
    products.push(product);
    setToStorage(KEYS.PRODUCTS, products);
    return product;
  },
  update: (id: string, data: Partial<Types.Product>): Types.Product | null => {
    const products = productDb.getAll();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return null;
    products[index] = { ...products[index], ...data };
    setToStorage(KEYS.PRODUCTS, products);
    return products[index];
  },
  delete: (id: string): boolean => {
    const products = productDb.getAll();
    const filtered = products.filter((p) => p.id !== id);
    if (filtered.length === products.length) return false;
    setToStorage(KEYS.PRODUCTS, filtered);
    return true;
  },
};

// Order operations
export const orderDb = {
  getAll: (): Types.Order[] => getFromStorage(KEYS.ORDERS, []),
  getById: (id: string): Types.Order | null => {
    const orders = orderDb.getAll();
    return orders.find((o) => o.id === id) || null;
  },
  getByIdentityUploadToken: (token: string): Types.Order | null => {
    const orders = orderDb.getAll();
    return orders.find((o) => o.identityUploadToken === token) || null;
  },
  getByPatient: (patientId: string): Types.Order[] => {
    return orderDb.getAll().filter((o) => o.patientId === patientId);
  },
  getByStatus: (status: Types.OrderStatus): Types.Order[] => {
    return orderDb.getAll().filter((o) => o.status === status);
  },
  create: (order: Types.Order): Types.Order => {
    const orders = orderDb.getAll();
    orders.push(order);
    setToStorage(KEYS.ORDERS, orders);
    return order;
  },
  update: (id: string, data: Partial<Types.Order>): Types.Order | null => {
    const orders = orderDb.getAll();
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...data, updatedAt: new Date().toISOString() };
    setToStorage(KEYS.ORDERS, orders);
    return orders[index];
  },
};

// Payment operations
export const paymentDb = {
  getAll: (): Types.Payment[] => getFromStorage(KEYS.PAYMENTS, []),
  getById: (id: string): Types.Payment | null => {
    const payments = paymentDb.getAll();
    return payments.find((p) => p.id === id) || null;
  },
  getByOrder: (orderId: string): Types.Payment | null => {
    const payments = paymentDb.getAll();
    return payments.find((p) => p.orderId === orderId) || null;
  },
  create: (payment: Types.Payment): Types.Payment => {
    const payments = paymentDb.getAll();
    payments.push(payment);
    setToStorage(KEYS.PAYMENTS, payments);
    return payment;
  },
  update: (id: string, data: Partial<Types.Payment>): Types.Payment | null => {
    const payments = paymentDb.getAll();
    const index = payments.findIndex((p) => p.id === id);
    if (index === -1) return null;
    payments[index] = { ...payments[index], ...data };
    setToStorage(KEYS.PAYMENTS, payments);
    return payments[index];
  },
};

// Question operations
export const questionDb = {
  getAll: (): Types.Question[] => getFromStorage(KEYS.QUESTIONS, []),
  getByCategory: (category: string): Types.Question[] => {
    return questionDb.getAll().filter((q) => q.category === category);
  },
  create: (question: Types.Question): Types.Question => {
    const questions = questionDb.getAll();
    questions.push(question);
    setToStorage(KEYS.QUESTIONS, questions);
    return question;
  },
  update: (id: string, data: Partial<Types.Question>): Types.Question | null => {
    const questions = questionDb.getAll();
    const index = questions.findIndex((q) => q.id === id);
    if (index === -1) return null;
    questions[index] = { ...questions[index], ...data };
    setToStorage(KEYS.QUESTIONS, questions);
    return questions[index];
  },
  delete: (id: string): boolean => {
    const questions = questionDb.getAll();
    const filtered = questions.filter((q) => q.id !== id);
    if (filtered.length === questions.length) return false;
    setToStorage(KEYS.QUESTIONS, filtered);
    return true;
  },
};

// Questionnaire answer operations
export const answerDb = {
  getAll: (): Types.QuestionnaireAnswer[] =>
    getFromStorage(KEYS.QUESTIONNAIRE_ANSWERS, []),
  getByOrder: (orderId: string): Types.QuestionnaireAnswer[] => {
    return answerDb.getAll().filter((a) => a.orderId === orderId);
  },
  create: (answer: Types.QuestionnaireAnswer): Types.QuestionnaireAnswer => {
    const answers = answerDb.getAll();
    answers.push(answer);
    setToStorage(KEYS.QUESTIONNAIRE_ANSWERS, answers);
    return answer;
  },
};

// Consent operations
export const consentDb = {
  getAll: (): Types.ConsentRecord[] =>
    getFromStorage(KEYS.CONSENT_RECORDS, []),
  getByOrder: (orderId: string): Types.ConsentRecord | null => {
    const consents = consentDb.getAll();
    return consents.find((c) => c.orderId === orderId) || null;
  },
  create: (consent: Types.ConsentRecord): Types.ConsentRecord => {
    const consents = consentDb.getAll();
    consents.push(consent);
    setToStorage(KEYS.CONSENT_RECORDS, consents);
    return consent;
  },
};

// Upload operations
export const uploadDb = {
  getAll: (): Types.Upload[] => getFromStorage(KEYS.UPLOADS, []),
  getById: (id: string): Types.Upload | null =>
    uploadDb.getAll().find((u) => u.id === id) ?? null,
  getByOrder: (orderId: string): Types.Upload[] => {
    return uploadDb.getAll().filter((u) => u.orderId === orderId);
  },
  getByOrderAndType: (
    orderId: string,
    type: "driver_license" | "selfie_video"
  ): Types.Upload | null => {
    return (
      uploadDb.getAll().find((u) => u.orderId === orderId && u.type === type) ||
      null
    );
  },
  create: (upload: Types.Upload): Types.Upload => {
    const uploads = uploadDb.getAll();
    uploads.push(upload);
    setToStorage(KEYS.UPLOADS, uploads);
    return upload;
  },
};

// Pharmacy order operations
export const pharmacyOrderDb = {
  getAll: (): Types.PharmacyOrder[] =>
    getFromStorage(KEYS.PHARMACY_ORDERS, []),
  getByOrder: (orderId: string): Types.PharmacyOrder | null => {
    const orders = pharmacyOrderDb.getAll();
    return orders.find((p) => p.orderId === orderId) || null;
  },
  create: (order: Types.PharmacyOrder): Types.PharmacyOrder => {
    const orders = pharmacyOrderDb.getAll();
    orders.push(order);
    setToStorage(KEYS.PHARMACY_ORDERS, orders);
    return order;
  },
  update: (id: string, data: Partial<Types.PharmacyOrder>):  Types.PharmacyOrder | null => {
    const orders = pharmacyOrderDb.getAll();
    const index = orders.findIndex((p) => p.id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...data };
    setToStorage(KEYS.PHARMACY_ORDERS, orders);
    return orders[index];
  },
};

// PracticeQ packet operations
export const practiceqDb = {
  getAll: (): Types.PracticeQPacket[] =>
    getFromStorage(KEYS.PRACTICEQ_PACKETS, []),
  getByOrder: (orderId: string): Types.PracticeQPacket | null => {
    const packets = practiceqDb.getAll();
    return packets.find((p) => p.orderId === orderId) || null;
  },
  create: (packet: Types.PracticeQPacket): Types.PracticeQPacket => {
    const packets = practiceqDb.getAll();
    packets.push(packet);
    setToStorage(KEYS.PRACTICEQ_PACKETS, packets);
    return packet;
  },
  update: (id: string, data: Partial<Types.PracticeQPacket>): Types.PracticeQPacket | null => {
    const packets = practiceqDb.getAll();
    const index = packets.findIndex((p) => p.id === id);
    if (index === -1) return null;
    packets[index] = { ...packets[index], ...data };
    setToStorage(KEYS.PRACTICEQ_PACKETS, packets);
    return packets[index];
  },
};

export const practiceqAutomationJobDb = {
  getAll: (): Types.PracticeQAutomationJob[] =>
    getFromStorage(KEYS.PRACTICEQ_AUTOMATION_JOBS, []),
  getByOrder: (orderId: string): Types.PracticeQAutomationJob | null => {
    return practiceqAutomationJobDb.getAll().find((job) => job.orderId === orderId) ?? null;
  },
  getQueued: (): Types.PracticeQAutomationJob[] => {
    return practiceqAutomationJobDb
      .getAll()
      .filter((job) => job.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  create: (job: Types.PracticeQAutomationJob): Types.PracticeQAutomationJob => {
    const jobs = practiceqAutomationJobDb.getAll();
    const existingIndex = jobs.findIndex((existing) => existing.id === job.id || existing.orderId === job.orderId);
    if (existingIndex >= 0) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...job, updatedAt: new Date().toISOString() };
    } else {
      jobs.push(job);
    }
    setToStorage(KEYS.PRACTICEQ_AUTOMATION_JOBS, jobs);
    return existingIndex >= 0 ? jobs[existingIndex] : job;
  },
  update: (
    id: string,
    data: Partial<Types.PracticeQAutomationJob>
  ): Types.PracticeQAutomationJob | null => {
    const jobs = practiceqAutomationJobDb.getAll();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) return null;
    jobs[index] = { ...jobs[index], ...data, updatedAt: new Date().toISOString() };
    setToStorage(KEYS.PRACTICEQ_AUTOMATION_JOBS, jobs);
    return jobs[index];
  },
};

// QuickBooks operations
export const quickbooksDb = {
  getAll: (): Types.QuickBooksRecord[] =>
    getFromStorage(KEYS.QUICKBOOKS_RECORDS, []),
  getByOrder: (orderId: string): Types.QuickBooksRecord | null => {
    const records = quickbooksDb.getAll();
    return records.find((q) => q.orderId === orderId) || null;
  },
  create: (record: Types.QuickBooksRecord): Types.QuickBooksRecord => {
    const records = quickbooksDb.getAll();
    records.push(record);
    setToStorage(KEYS.QUICKBOOKS_RECORDS, records);
    return record;
  },
  update: (id: string, data: Partial<Types.QuickBooksRecord>): Types.QuickBooksRecord | null => {
    const records = quickbooksDb.getAll();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], ...data };
    setToStorage(KEYS.QUICKBOOKS_RECORDS, records);
    return records[index];
  },
};

// Spruce message operations
export const spruceDb = {
  getAll: (): Types.SpruceMessage[] =>
    getFromStorage(KEYS.SPRUCE_MESSAGES, []),
  getByOrder: (orderId: string): Types.SpruceMessage[] => {
    return spruceDb.getAll().filter((m) => m.orderId === orderId);
  },
  getByPatient: (patientId: string): Types.SpruceMessage[] => {
    return spruceDb.getAll().filter((m) => m.patientId === patientId);
  },
  create: (message: Types.SpruceMessage): Types.SpruceMessage => {
    const messages = spruceDb.getAll();
    messages.push(message);
    setToStorage(KEYS.SPRUCE_MESSAGES, messages);
    return message;
  },
  update: (id: string, data: Partial<Types.SpruceMessage>): Types.SpruceMessage | null => {
    const messages = spruceDb.getAll();
    const index = messages.findIndex((m) => m.id === id);
    if (index === -1) return null;
    messages[index] = { ...messages[index], ...data };
    setToStorage(KEYS.SPRUCE_MESSAGES, messages);
    return messages[index];
  },
};

// Integration log operations
export const integrationLogDb = {
  getAll: (): Types.IntegrationLog[] =>
    getFromStorage(KEYS.INTEGRATION_LOGS, []),
  create: (log: Types.IntegrationLog): Types.IntegrationLog => {
    const logs = integrationLogDb.getAll();
    logs.push(log);
    setToStorage(KEYS.INTEGRATION_LOGS, logs);
    return log;
  },
};

// CMS content operations
export const cmsDb = {
  getContent: (): Types.CMSContent => {
    return getFromStorage(KEYS.CMS_CONTENT, getDefaultCMSContent());
  },
  updateContent: (data: Partial<Types.CMSContent>): Types.CMSContent => {
    const current = cmsDb.getContent();
    const updated: Types.CMSContent = { ...current, ...data };
    setToStorage(KEYS.CMS_CONTENT, updated);
    return updated;
  },
};

export const getDefaultCMSContent = (): Types.CMSContent => ({
  landing: {
    heroHeadline: "Your Journey to a Healthier, Happier You Starts Here",
    heroSubheadline:
      "Medical weight management with GLP-1 therapy — personalized, supervised, and shipped directly to your door. No office visits. No waiting.",
    heroImage: "/hero-placeholder.svg",
    ctaButtonText: "Get Started Today",
    howItWorksTitle: "How It Works",
    benefitsTitle: "Why Mission WLW",
    faqTitle: "Frequently Asked Questions",
    disclaimerText:
      "GLP-1 medications are contraindicated for patients with personal or family history of thyroid cancer or MEN 2, and are not suitable during pregnancy or breastfeeding. Eligibility and dosage decisions are made by licensed providers.",
    privacyNote:
      "All data is HIPAA-compliant and encrypted in transit and at rest. We never sell or share your information.",
  },
  footer: {
    copyrightText: "© 2025 Mission Wellness & Weight Loss. All rights reserved.",
    privacyLink: "/privacy",
    termsLink: "/terms",
    supportEmail: "service@missionwlw.com",
  },
  general: {
    siteName: "Mission Wellness & Weight Loss",
    supportPhone: "",
    companyName: "Mission Wellness & Weight Loss",
  },
});

// Message template operations
export const messageTemplateDb = {
  getAll: (): Types.MessageTemplate[] =>
    getFromStorage(KEYS.MESSAGE_TEMPLATES, []),
  getByKey: (key: string): Types.MessageTemplate | null => {
    const templates = messageTemplateDb.getAll();
    return templates.find((t) => t.key === key) || null;
  },
  create: (template: Types.MessageTemplate): Types.MessageTemplate => {
    const templates = messageTemplateDb.getAll();
    templates.push(template);
    setToStorage(KEYS.MESSAGE_TEMPLATES, templates);
    return template;
  },
  update: (id: string, data: Partial<Types.MessageTemplate>): Types.MessageTemplate | null => {
    const templates = messageTemplateDb.getAll();
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) return null;
    templates[index] = { ...templates[index], ...data };
    setToStorage(KEYS.MESSAGE_TEMPLATES, templates);
    return templates[index];
  },
};

// Provider review operations
export const providerReviewDb = {
  getAll: (): Types.ProviderReview[] =>
    getFromStorage(KEYS.PROVIDER_REVIEWS, []),
  getByOrder: (orderId: string): Types.ProviderReview | null => {
    const reviews = providerReviewDb.getAll();
    return reviews.find((r) => r.orderId === orderId) || null;
  },
  create: (review: Types.ProviderReview): Types.ProviderReview => {
    const reviews = providerReviewDb.getAll();
    reviews.push(review);
    setToStorage(KEYS.PROVIDER_REVIEWS, reviews);
    return review;
  },
  update: (id: string, data: Partial<Types.ProviderReview>): Types.ProviderReview | null => {
    const reviews = providerReviewDb.getAll();
    const index = reviews.findIndex((r) => r.id === id);
    if (index === -1) return null;
    reviews[index] = { ...reviews[index], ...data };
    setToStorage(KEYS.PROVIDER_REVIEWS, reviews);
    return reviews[index];
  },
};

// Clear all data (for testing)
export const clearAllData = (): void => {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};
