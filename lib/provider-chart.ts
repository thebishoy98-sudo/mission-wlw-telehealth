import type {
  ConsentRecord,
  Order,
  Patient,
  Payment,
  PharmacyOrder,
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

  const [product, questionnaire, answers, consent, uploads, payment, pharmacyOrder, review] =
    await Promise.all([
      stores.products.getById(selectedOrder.productId),
      stores.questions.getAll(),
      stores.answers.getByOrder(selectedOrder.id),
      stores.consents.getByOrder(selectedOrder.id),
      stores.uploads.getByOrder(selectedOrder.id),
      stores.payments.getByOrder(selectedOrder.id),
      stores.pharmacyOrders?.getByOrder(selectedOrder.id) ?? null,
      stores.reviews.getByOrder(selectedOrder.id),
    ]);

  return {
    patient,
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
  };
}
