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
  price: number;
  durationWeeks?: number;
  weeklyDoseMg?: number;
  injectionUnits?: number;
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

export interface Order {
  id: string;
  patientId: string;
  productId: string;
  doseId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pharmacyStatus: PharmacyStatus;
  practiceQStatus: "pending" | "submitted" | "completed" | "error";
  quickbooksStatus: "pending" | "created" | "invoiced" | "error";
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
}

// File Uploads
export interface Upload {
  id: string;
  orderId: string;
  type: "driver_license" | "selfie_video";
  filename: string;
  fileSize: number;
  mimeType: string;
  base64Data: string; // For demo, store base64 instead of file
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
    productRequested: string;
    doseSelected: string;
  };
  status: "pending" | "submitted" | "completed" | "error";
  lastSyncAt?: string;
  lastError?: string;
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
  integrationName: "practiceq" | "quickbooks" | "lifefile" | "spruce" | "system";
  action: string;
  orderId?: string;
  patientId?: string;
  status: "success" | "pending" | "error";
  details: Record<string, any>;
  error?: string;
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
