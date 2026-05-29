import * as quickbooks from "@/services/quickbooks";
import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import type { Order, Patient, Payment } from "@/types";

jest.mock("@/lib/qb-oauth", () => ({
  getQBAccessToken: jest.fn(async () => "qb_access_token"),
}));

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
  const originalUseRealQuickBooks = process.env.USE_REAL_QUICKBOOKS;
  const originalRealmId = process.env.QB_REALM_ID;
  const originalUseMock = serviceConfig.quickbooks.useMock;

  afterEach(() => {
    process.env.USE_REAL_QUICKBOOKS = originalUseRealQuickBooks;
    process.env.QB_REALM_ID = originalRealmId;
    serviceConfig.quickbooks.useMock = originalUseMock;
    jest.restoreAllMocks();
  });

  it("returns a QB customer ID string", async () => {
    const patient = db.patientDb.getById("p1")!;
    const customerId = await quickbooks.createCustomerRecord(patient);
    expect(customerId).toMatch(/^QB_CUST_/);
  });

  it("creates an integration log", async () => {
    const patient = db.patientDb.getById("p1")!;
    await quickbooks.createCustomerRecord(patient);
    const logs = db.integrationLogDb.getAll();
    const qbLog = logs.find((l) => l.integrationName === "quickbooks");
    expect(qbLog).toBeDefined();
    expect(qbLog?.status).toBe("success");
  });

  it("retries with a unique display name when QuickBooks rejects a duplicate name", async () => {
    process.env.USE_REAL_QUICKBOOKS = "true";
    process.env.QB_REALM_ID = "9341457089968240";
    serviceConfig.quickbooks.useMock = false;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ QueryResponse: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        text: async () => JSON.stringify({
          Fault: {
            Error: [{ Message: "Duplicate Name Exists Error", code: "6240" }],
            type: "ValidationFault",
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Customer: { Id: "123" } }),
      } as Response);
    (global as any).fetch = fetchMock;

    const customerId = await quickbooks.createCustomerRecord(db.patientDb.getById("p1")!);

    expect(customerId).toBe("123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(retryBody.DisplayName).toMatch(/^Dan Brown - p1-[a-z0-9]{6}$/);
  });
});

describe("quickbooks.createInvoice", () => {
  beforeEach(seedData);

  it("creates an invoice and returns invoice ID", async () => {
    const order = db.orderDb.getById("o1")!;
    const invoiceId = await quickbooks.createInvoice(order, makePayment());
    expect(typeof invoiceId).toBe("string");
    expect(invoiceId.length).toBeGreaterThan(0);
  });

  it("logs invoice creation to integrationLogDb", async () => {
    const order = db.orderDb.getById("o1")!;
    await quickbooks.createInvoice(order, makePayment());
    const logs = db.integrationLogDb.getAll();
    const invoiceLog = logs.find((l) => l.action?.includes("invoice"));
    expect(invoiceLog).toBeDefined();
    expect(invoiceLog?.status).toBe("success");
    expect(invoiceLog?.orderId).toBe("o1");
  });

  it("throws when patient not found", async () => {
    const badOrder = { ...db.orderDb.getById("o1")!, patientId: "bad" };
    await expect(quickbooks.createInvoice(badOrder, makePayment())).rejects.toThrow();
  });
});

describe("quickbooks.recordPayment", () => {
  beforeEach(seedData);

  it("records payment and creates log", async () => {
    const order = db.orderDb.getById("o1")!;
    const payment = makePayment();
    const invoiceId = await quickbooks.createInvoice(order, payment);
    await quickbooks.recordPayment(invoiceId, payment.amount);
    const logs = db.integrationLogDb.getAll();
    const paymentLog = logs.find((l) => l.action?.includes("payment"));
    expect(paymentLog).toBeDefined();
  });
});

describe("quickbooks.getCompanyInfo", () => {
  const originalRealmId = process.env.QB_REALM_ID;
  const originalUseMock = serviceConfig.quickbooks.useMock;

  afterEach(() => {
    process.env.QB_REALM_ID = originalRealmId;
    serviceConfig.quickbooks.useMock = originalUseMock;
    jest.restoreAllMocks();
  });

  it("performs a read-only company info request", async () => {
    process.env.QB_REALM_ID = "realm_1";
    serviceConfig.quickbooks.useMock = false;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ CompanyInfo: { CompanyName: "Mission WLW" } }),
    } as Response));
    (global as any).fetch = fetchMock;

    const info = await quickbooks.getCompanyInfo();

    expect(info.CompanyInfo.CompanyName).toBe("Mission WLW");
    expect(fetchMock.mock.calls[0][0]).toContain("/companyinfo/realm_1");
  });
});
