/**
 * Temporary intake form state management
 * Stores current order/patient info being created during intake flow
 */

export interface IntakeFormState {
  patientId?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  shippingAddress: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  productId: string;
  doseId: string;
  questionnaireAnswers: Record<string, string>;
  consentAcknowledged: boolean;
  signedName: string;
  consented: boolean;
  licenseUploaded: boolean;
  selfieUploaded: boolean;
  licenseImageData?: string;
  selfieFrameData?: string;
  paymentProcessed: boolean;
  orderId?: string;
}

const STORAGE_KEY = "tele_intake_form_state";

const getDefaultState = (): IntakeFormState => ({
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  address: {
    street1: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
  },
  shippingAddress: {
    street1: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
  },
  productId: "",
  doseId: "",
  questionnaireAnswers: {},
  consentAcknowledged: false,
  signedName: "",
  consented: false,
  licenseUploaded: false,
  selfieUploaded: false,
  paymentProcessed: false,
});

export const getIntakeState = (): IntakeFormState => {
  if (typeof window === "undefined") return getDefaultState();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return getDefaultState();
  try {
    return JSON.parse(stored);
  } catch {
    return getDefaultState();
  }
};

export const saveIntakeState = (state: Partial<IntakeFormState>): void => {
  if (typeof window === "undefined") return;
  const current = getIntakeState();
  const updated = { ...current, ...state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const clearIntakeState = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
};

export const getIntakeProgress = (): number => {
  const state = getIntakeState();
  let progress = 0;
  if (state.firstName && state.lastName && state.email) progress++;
  if (Object.keys(state.questionnaireAnswers).length > 0) progress++;
  if (state.consented) progress++;
  if (state.licenseUploaded && state.selfieUploaded) progress++;
  if (state.paymentProcessed) progress++;
  return progress;
};
