import type {
  ConsentRecord,
  Order,
  Patient,
  Payment,
  PharmacyOrder,
  PracticeQMirror,
  PracticeQPacket,
  Product,
  ProviderReview,
  Question,
  QuestionnaireAnswer,
  Upload,
} from "@/types";

type MaybePromise<T> = T | Promise<T>;

export interface ProviderChartStores {
  patients: { getById(id: string): MaybePromise<Patient | null> };
  orders: { getByPatient(patientId: string): MaybePromise<Order[]> };
  products: { getById(id: string): MaybePromise<Product | null> };
  questions: { getAll(): MaybePromise<Question[]> };
  answers: { getByOrder(orderId: string): MaybePromise<QuestionnaireAnswer[]> };
  consents: { getByOrder(orderId: string): MaybePromise<ConsentRecord | null> };
  uploads: { getByOrder(orderId: string): MaybePromise<Upload[]> };
  payments: { getByOrder(orderId: string): MaybePromise<Payment | null> };
  pharmacyOrders?: { getByOrder(orderId: string): MaybePromise<PharmacyOrder | null> };
  reviews: { getByOrder(orderId: string): MaybePromise<ProviderReview | null> };
  practiceqPackets?: { getByOrder(orderId: string): MaybePromise<PracticeQPacket | null> };
  practiceqMirror?: {
    getForOrder(order: Order, packet?: PracticeQPacket | null): MaybePromise<PracticeQMirror>;
  };
}

export interface ProviderPatientChart {
  patient: Patient;
  orders: Order[];
  selectedOrder: Order;
  product: Product | null;
  questionnaire: Question[];
  answers: QuestionnaireAnswer[];
  consent: ConsentRecord | null;
  uploads: Upload[];
  payment: Payment | null;
  pharmacyOrder: PharmacyOrder | null;
  review: ProviderReview | null;
  practiceq: PracticeQMirror | null;
}

function answerValue(practiceq: PracticeQMirror | null | undefined, pattern: RegExp): string {
  if (!practiceq?.answers.length) return "";
  const answer = practiceq.answers.find((item) => pattern.test(item.question.toLowerCase()))?.answer?.trim() ?? "";
  return answer.toLowerCase() === "no answer" ? "" : answer;
}

function splitPracticeQName(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function hydratePatientFromPracticeQ(patient: Patient, practiceq: PracticeQMirror | null): Patient {
  if (!practiceq?.available) return patient;

  const splitName = splitPracticeQName(practiceq.clientName);
  const firstName = patient.firstName || answerValue(practiceq, /^first name\b/) || splitName.firstName;
  const lastName = patient.lastName || answerValue(practiceq, /^last name\b/) || splitName.lastName;
  const email = patient.email || practiceq.clientEmail || answerValue(practiceq, /^email\b/);
  const phone = patient.phone || answerValue(practiceq, /^phone/);
  const dateOfBirth = patient.dateOfBirth || answerValue(practiceq, /date of birth|dob/);
  const gender = patient.gender || answerValue(practiceq, /^gender\b/).toLowerCase() as Patient["gender"];
  const street1 = patient.address?.street1 || answerValue(practiceq, /address/);
  const city = patient.address?.city || answerValue(practiceq, /^city\b/);
  const state = patient.address?.state || answerValue(practiceq, /^state\b/);
  const zipCode = patient.address?.zipCode || answerValue(practiceq, /zip/);

  return {
    ...patient,
    firstName,
    lastName,
    dateOfBirth,
    gender,
    phone,
    email,
    address: {
      street1,
      street2: patient.address?.street2,
      city,
      state,
      zipCode,
      country: patient.address?.country || "US",
    },
    shippingAddress: {
      street1: patient.shippingAddress?.street1 || street1,
      street2: patient.shippingAddress?.street2,
      city: patient.shippingAddress?.city || city,
      state: patient.shippingAddress?.state || state,
      zipCode: patient.shippingAddress?.zipCode || zipCode,
      country: patient.shippingAddress?.country || "US",
    },
  };
}

export async function loadProviderPatientChart(
  patientId: string,
  stores: ProviderChartStores
): Promise<ProviderPatientChart | null> {
  const patient = await stores.patients.getById(patientId);
  if (!patient) return null;

  const orders = await stores.orders.getByPatient(patientId);
  const selectedOrder = orders[0];
  if (!selectedOrder) return null;

  const [product, questionnaire, answers, consent, uploads, payment, pharmacyOrder, review, practiceqPacket] =
    await Promise.all([
      stores.products.getById(selectedOrder.productId),
      stores.questions.getAll(),
      stores.answers.getByOrder(selectedOrder.id),
      stores.consents.getByOrder(selectedOrder.id),
      stores.uploads.getByOrder(selectedOrder.id),
      stores.payments.getByOrder(selectedOrder.id),
      stores.pharmacyOrders?.getByOrder(selectedOrder.id) ?? null,
      stores.reviews.getByOrder(selectedOrder.id),
      stores.practiceqPackets?.getByOrder(selectedOrder.id) ?? null,
    ]);
  const practiceq = stores.practiceqMirror
    ? await stores.practiceqMirror.getForOrder(selectedOrder, practiceqPacket)
    : null;
  const hydratedPatient = hydratePatientFromPracticeQ(patient, practiceq);

  return {
    patient: hydratedPatient,
    orders,
    selectedOrder,
    product,
    questionnaire,
    answers,
    consent,
    uploads,
    payment,
    pharmacyOrder,
    review,
    practiceq,
  };
}
