// Patient and Demographics
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other";
  phone: string;
  email: string;
  address: Address;
  shippingAddress: Address;
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  /** Intuit QB Payments reusable stored-card id (card-on-file). No PAN stored. */
  qbCardId?: string;
  cardLast4?: string;
  cardBrand?: string;
  /** When the patient authorized recurring auto-billing (subscription). */
  recurringConsentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// Products
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  startingPrice: number;
  image: string;
  doses: DoseOption[];
  eligibilityNote: string;
  isActive: boolean;
  faqs?: FAQ[];
  createdAt: string;
}

export interface DoseOption {
  id: string;
  label: string;
  strength: string;
  quantity: number;
  quantityUnits?: string;
  price: number;
  durationWeeks?: number;
  daysSupply?: number;
  weeklyDoseMg?: number;
  injectionUnits?: number;
  drugForm?: string;
  prescriptionLabel?: string;
  patientDescription?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

// Orders and Workflow
export type OrderStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "sent_to_pharmacy"
  | "processing"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
export type PharmacyStatus =
  | "draft"
  | "submitted"
  | "received"
  | "processing"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "error";

export type IdentityStatus =
  | "missing"
  | "pending"
  | "verified"
  | "needs_review"
  | "rejected"
  | "manual_approved";

export interface IdentityAiResult {
  status: IdentityStatus;
  confidence: number;
  summary: string;
  flags: string[];
  checkedAt?: string;
}

/**
 * Prior-GLP-1 proof gate. When a patient orders a dose above the starting dose
 * we require documentation that they have taken GLP-1 before (their existing
 * script), which an admin must approve before pharmacy dispatch.
 *   not_required  — starting dose, refill, or established patient (no gate)
 *   pending_upload — proof required, patient has not uploaded yet
 *   submitted     — patient uploaded proof, awaiting admin approval
 *   approved      — admin approved the proof (dispatch may proceed)
 *   rejected      — admin rejected the proof (dispatch stays blocked)
 */
export type PriorMedStatus =
  | "not_required"
  | "pending_upload"
  | "submitted"
  | "approved"
  | "rejected";

/**
 * Back-to-back reorder review gate. When a patient orders again too soon after
 * their last paid order, the order is flagged for admin review instead of being
 * blocked. Dispatch is held until an admin approves (or rejects) it.
 *   flagged  — ordered too soon, awaiting admin decision (dispatch held)
 *   approved — admin allowed the early reorder (dispatch may proceed)
 *   rejected — admin rejected the early reorder (dispatch stays blocked)
 */
export type ReorderReviewStatus = "flagged" | "approved" | "rejected";

export interface Order {
  id: string;
  patientId: string;
  productId: string;
  doseId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pharmacyStatus: PharmacyStatus;
  practiceQStatus: "pending" | "submitted" | "completed" | "error" | "skipped";
  quickbooksStatus: "pending" | "created" | "invoiced" | "error" | "skipped";
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  providerNotes?: string;
  rejectionReason?: string;
  identityStatus?: IdentityStatus;
  identityReason?: string;
  identityReviewedAt?: string;
  identityReviewedBy?: string;
  identityAiResult?: IdentityAiResult;
  identityUploadToken?: string;
  /** Prior-GLP-1 proof gate (non-starting-dose orders). */
  priorMedStatus?: PriorMedStatus;
  priorMedReason?: string;
  priorMedUploadToken?: string;
  priorMedReviewedAt?: string;
  priorMedReviewedBy?: string;
  /** Back-to-back reorder review gate (ordered too soon since last order). */
  reorderReviewStatus?: ReorderReviewStatus;
  reorderReviewReason?: string;
  reorderReviewedAt?: string;
  reorderReviewedBy?: string;
  /** PracticeQ/IntakeQ client ID — used to look up patient PHI from PracticeQ API */
  practiceqClientId?: string;
  refCode?: string;
  /** Subscription auto-refill linkage. */
  subscriptionId?: string;
  isRefill?: boolean;
  /** Non-blocking provider acknowledgment of an auto-refill (does NOT gate dispatch). */
  providerAcknowledgedAt?: string;
  providerAcknowledgedBy?: string;
}

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription {
  id: string;
  patientId: string;
  productId: string;
  doseId: string;
  status: SubscriptionStatus;
  /** Nominal supply length / billing cadence in days (8 weeks = 56). */
  intervalDays: number;
  /** How many days before the supply runs out the billing cron fires. */
  leadDays: number;
  /** When the current supply runs out. */
  coversThrough?: string;
  /** When the billing cron should next fire (= coversThrough - leadDays). */
  nextRunAt?: string;
  lastOrderId?: string;
  lastChargedAt?: string;
  /** The order that originally enrolled this subscription. */
  sourceOrderId?: string;
  qbCustomerId?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /**
   * One-off billing adjustment applied on the NEXT billing run only (then cleared).
   * Used for accidental over-shipments: charge the card at the 7-week mark but do
   * NOT dispatch to the pharmacy (patient already has the supply).
   */
  skipNextDispatch?: boolean;
  /** Override the next charge amount (dollars) — e.g. a prorated partial charge. */
  nextChargeOverride?: number;
  /** Extra note appended to the patient's next charge SMS (explains the charge). */
  nextChargeNote?: string;
  createdAt: string;
  updatedAt: string;
}

// Intake and Medical Information
export interface QuestionnaireAnswer {
  id: string;
  orderId: string;
  questionId: string;
  answer: string;
  createdAt: string;
}

export interface Question {
  id: string;
  category: "medical_history" | "medications" | "allergies" | "screening" | "consent";
  text: string;
  type: "text" | "textarea" | "checkbox" | "radio" | "select";
  options?: string[];
  required: boolean;
  displayOrder: number;
  /** If set, answering with this exact value disqualifies the patient from GLP-1 treatment */
  disqualifying?: string;
  /** If set, answering with this exact value shows a provider-review warning (soft flag, does not block) */
  warnIf?: string;
}

export interface ConsentRecord {
  id: string;
  orderId: string;
  consentText: string;
  acknowledgments: {
    telehealth: boolean;
    pharmacy: boolean;
    payment: boolean;
    privacy: boolean;
  };
  signedName: string;
  signedAt: string;
  ipAddress?: string;
  userAgent?: string;
  consentVersion?: string;
}

// File Uploads
export interface Upload {
  id: string;
  orderId: string;
  type: "driver_license" | "selfie_video" | "prior_prescription";
  filename: string;
  fileSize: number;
  mimeType: string;
  storageUrl?: string;
  storageKey?: string;
  base64Data: string;
  uploadedAt: string;
  status: "uploaded" | "verified" | "rejected";
  verificationNotes?: string;
}

// Payment
export interface Payment {
  id: string;
  orderId: string;
  patientId: string;
  amount: number;
  currency: "USD";
  status: PaymentStatus;
  paymentMethod: "credit_card" | "debit_card";
  cardLast4: string;
  cardBrand: string;
  transactionId: string;
  createdAt: string;
  processedAt?: string;
  refundedAt?: string;
  refundAmount?: number;
}

// Third-party Integrations
export interface QuickBooksRecord {
  id: string;
  orderId: string;
  paymentId: string;
  customerRefId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  taxAmount: number;
  status: "created" | "invoiced" | "paid" | "error";
  syncedAt: string;
  lastError?: string;
}

export interface PracticeQPacket {
  id: string;
  orderId: string;
  patientId: string;
  submittedAt: string;
  packetData: {
    patientInfo: Partial<Patient>;
    questionnaireAnswers: QuestionnaireAnswer[];
    consentRecord: Partial<ConsentRecord>;
    uploads: Upload[];
    practiceQAnswerFile?: {
      fileId: string;
      filename: string;
      uploadedAt: string;
    };
    practiceQPdfFile?: {
      fileId: string;
      filename: string;
      uploadedAt: string;
    };
    practiceQIdentityFiles?: {
      fileId: string;
      filename: string;
      uploadedAt: string;
      type: Upload["type"];
    }[];
    productRequested: string;
    doseSelected: string;
  };
  status: "pending" | "submitted" | "completed" | "error";
  lastSyncAt?: string;
  lastError?: string;
}

export interface PracticeQMirrorAnswer {
  question: string;
  answer: string;
}

export interface PracticeQMirror {
  available: boolean;
  reason?: string;
  clientId?: string;
  intakeId?: string;
  status?: string;
  questionnaireName?: string;
  submittedAt?: string;
  clientName?: string;
  clientEmail?: string;
  practiceQUrl?: string;
  answerFileId?: string;
  pdfFileId?: string;
  answers: PracticeQMirrorAnswer[];
}

export interface PracticeQFormSummary {
  id: string;
  clientName?: string;
  clientEmail?: string;
  clientId?: string;
  status: string;
  createdAt?: string;
  submittedAt?: string;
  questionnaireName?: string;
  questionnaireId?: string;
  practitionerName?: string;
  externalClientId?: string;
  practiceQUrl: string;
}

export interface PracticeQFormFeed {
  available: boolean;
  reason?: string;
  completed: PracticeQFormSummary[];
  pending: PracticeQFormSummary[];
  all: PracticeQFormSummary[];
}

export interface PracticeQAutomationJob {
  id: string;
  orderId: string;
  patientId: string;
  status: "queued" | "running" | "awaiting_patient_signature" | "completed" | "failed";
  attempts: number;
  practiceQStartUrl: string;
  handoffToken: string;
  handoffExpiresAt: string;
  handoffUrl?: string;
  intakeId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}

export interface PharmacyOrder {
  id: string;
  orderId: string;
  patientId: string;
  lifeFileOrderId?: string; // Real Life File ID when connected
  status: PharmacyStatus;
  payload: {
    message: {
      id: string;
      sentTime: string;
    };
    order: {
      general: {
        referenceId: string;
        memo: string;
      };
      prescriber: {
        npi: string;
        name: string;
        phone: string;
      };
      practice: {
        npi: string;
        name: string;
        phone: string;
      };
      patient: Partial<Patient>;
      shipping: Address;
      billing: Address;
      rxs: Prescription[];
    };
  };
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  submittedAt?: string;
  lastError?: string;
}

export interface Prescription {
  drugName: string;
  drugStrength: string;
  quantity: number;
  directions: string;
  refills: number;
  daysSupply: number;
  dateWritten: string;
}

export interface SpruceMessage {
  id: string;
  orderId: string;
  patientId: string;
  templateKey: string;
  phoneNumber: string;
  messageText: string;
  status: "pending" | "scheduled" | "sent" | "failed";
  scheduledFor?: string;
  sentAt?: string;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  key: string;
  category: "intake" | "payment" | "pharmacy" | "reorder" | "other";
  subject: string;
  body: string;
  variables: string[]; // e.g., ["patientName", "trackingNumber"]
  createdAt: string;
}

export interface IntegrationLog {
  id: string;
  timestamp: string;
  integrationName: "practiceq" | "quickbooks" | "lifefile" | "appsheet" | "spruce" | "system";
  action: string;
  orderId?: string;
  patientId?: string;
  status: "success" | "pending" | "error";
  details: Record<string, any>;
  error?: string;
}

export interface DiscountCode {
  code: string;
  type: "flat" | "percent";
  amount: number;
  minOrder?: number;
  expiresAt?: string;
  active: boolean;
  /** Track redemptions by patient phone to enforce single-use */
  singleUsePerCustomer: boolean;
}

export type AdminNotificationEvent =
  | "identity_review_needed"
  | "reorder_review_needed"
  | "subscription_charge_alert"
  | "subscription_review_needed"
  | "order_received"
  | "pharmacy_shipped";

export interface AdminNotificationSettings {
  phones: string[];
  events: Record<AdminNotificationEvent, boolean>;
}

// CMS and Content
export interface CMSContent {
  landing: {
    heroHeadline: string;
    heroSubheadline: string;
    heroImage: string;
    ctaButtonText: string;
    howItWorksTitle: string;
    benefitsTitle: string;
    faqTitle: string;
    disclaimerText: string;
    privacyNote: string;
  };
  footer: {
    copyrightText: string;
    privacyLink: string;
    termsLink: string;
    supportEmail: string;
  };
  general: {
    siteName: string;
    supportPhone: string;
    companyName: string;
  };
}

export interface ProviderReview {
  id: string;
  orderId: string;
  patientId: string;
  reviewedAt?: string;
  reviewedBy?: string;
  status: "pending" | "approved" | "rejected" | "needs_more_info";
  notes?: string;
  approvedDose?: string;
  rejectionReason?: string;
  /** Timestamp when provider opened and viewed the patient chart (for audit trail) */
  chartViewedAt?: string;
  /** Name of provider who viewed the chart */
  chartViewedBy?: string;
  identityAiResult?: IdentityAiResult;
  identityReviewRequired?: boolean;
}
