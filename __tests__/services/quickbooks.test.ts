import * as quickbooks from "@/services/quickbooks";
import * as db from "@/lib/db";
import type { Order, Patient, Payment } from "@/types";

const seedData = () => {
  db.patientDb.create({
    id: "p1",
    firstName: "Dan",
    lastName: "Brown",
    dateOfBirth: "1982-09-12",
    gender: "male",
    phone: "5552223333",
    email: "dan@example.com",
    address: { street1: "100 Pine", city: "Houston", state: "TX", zipCode: "77001", country: "US" },
    shippingAddress: { street1: "100 Pine", city: "Houston", state: "TX", zipCode: "77001", country: "US" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.productDb.create({
    id: "prod_1",
    name: "Tirzepatide",
    slug: "tirzepatide",
    description: "GLP-1",
    startingPrice: 299,
    image: "/img.svg",
    doses: [{ id: "dose_1", label: "2.5mg Starter", strength: "2.5mg", quantity: 1, price: 299 }],
    eligibilityNote: "BMI ≥ 27",
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  db.orderDb.create({
    id: "o1",
    patientId: "p1",
    productId: "prod_1",
    doseId: "dose_1",
    status: "sent_to_pharmacy",
    paymentStatus: "completed",
    pharmacyStatus: "submitted",
    practiceQStatus: "submitted",
    quickbooksStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

const makePayment = (): Payment => ({
  id: "pay_1",
  orderId: "o1",
  patientId: "p1",
  amount: 299,
  currency: "USD",
  status: "completed",
  paymentMethod: "credit_card",
  cardLast4: "4242",
  cardBrand: "Visa",
  transactionId: "txn_123",
  createdAt: new Date().toISOString(),
  processedAt: new Date().toISOString(),
});

describe("quickbooks.createCustomerRecord", () => {
  beforeEach(seedData);

  it("returns a QB customer ID string", () => {
    const patient = db.patientDb.getById("p1")!;
    const customerId = quickbooks.createCustomerRecord(patient);
    expect(customerId).toMatch(/^QB_CUST_/);
  });

  it("creates an integration log", () => {
    const patient = db.patientDb.getById("p1")!;
    quickbooks.createCustomerRecord(patient);
    const logs = db.integrationLogDb.getAll();
    const qbLog = logs.find((l) => l.integrationName === "quickbooks");
    expect(qbLog).toBeDefined();
    expect(qbLog?.status).toBe("success");
  });
});

describe("quickbooks.createInvoice", () => {
  beforeEach(seedData);

  it("creates an invoice and returns invoice ID", () => {
    const order = db.orderDb.getById("o1")!;
    const invoiceId = quickbooks.createInvoice(order, makePayment());
    expect(typeof invoiceId).toBe("string");
    expect(invoiceId.length).toBeGreaterThan(0);
  });

  it("saves QB record to quickbooksDb", () => {
    const order = db.orderDb.getById("o1")!;
    quickbooks.createInvoice(order, makePayment());
    const record = db.quickbooksDb.getByOrder("o1");
    expect(record).not.toBeNull();
    expect(record?.status).toBe("invoiced");
    expect(record?.amount).toBe(299);
  });

  it("throws when patient not found", () => {
    const badOrder = { ...db.orderDb.getById("o1")!, patientId: "bad" };
    expect(() => quickbooks.createInvoice(badOrder, makePayment())).toThrow();
  });
});

describe("quickbooks.recordPayment", () => {
  beforeEach(seedData);

  it("records payment and creates log", () => {
    const order = db.orderDb.getById("o1")!;
    const payment = makePayment();
    const invoiceId = quickbooks.createInvoice(order, payment);
    quickbooks.recordPayment(invoiceId, payment.amount);
    const logs = db.integrationLogDb.getAll();
    const paymentLog = logs.find((l) => l.action?.includes("Payment"));
    expect(paymentLog).toBeDefined();
    // QB record should now be "paid"
    const record = db.quickbooksDb.getByOrder("o1");
    expect(record?.status).toBe("paid");
  });
});
