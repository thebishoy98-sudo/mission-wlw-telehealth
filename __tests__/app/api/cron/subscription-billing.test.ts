import * as dbServer from "@/lib/db.server";
import * as qbPayments from "@/services/quickbooks-payments";
import * as spruceServer from "@/services/spruce.server";
import { sendAdminNotification } from "@/services/admin-notifications";
import { createRefillOrder, fulfillChargedRefillOrder } from "@/lib/order-fulfillment";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/db.server", () => ({
  subscriptionDb: {
    listDue: jest.fn(),
    update: jest.fn(),
  },
  patientDb: {
    getById: jest.fn(),
  },
  productDb: {
    getById: jest.fn(),
  },
  orderDb: {
    getByPatient: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
  },
  integrationLogDb: {
    create: jest.fn(),
  },
}));

jest.mock("@/services/quickbooks-payments", () => ({
  chargeStoredCard: jest.fn(),
}));

jest.mock("@/services/spruce.server", () => ({
  sendMessage: jest.fn(),
}));

jest.mock("@/services/admin-notifications", () => ({
  sendAdminNotification: jest.fn(),
}));

jest.mock("@/lib/order-fulfillment", () => ({
  createRefillOrder: jest.fn(),
  fulfillChargedRefillOrder: jest.fn(),
}));

jest.mock("@/lib/payment-link", () => ({
  createPaymentLinkToken: jest.fn(() => ({ token: "pay-token" })),
  buildPaymentLinkUrl: jest.fn(() => "https://example.test/pay/order/pay-token"),
}));

jest.mock("@/lib/public-url", () => ({
  getPublicBaseUrl: jest.fn(() => "https://example.test"),
}));

const { GET } = require("@/app/api/cron/subscription-billing/route");

const now = "2026-07-04T12:00:00.000Z";
const subscription = {
  id: "sub-1",
  patientId: "patient-1",
  productId: "product-1",
  doseId: "dose-high",
  status: "active",
  intervalDays: 56,
  leadDays: 7,
  coversThrough: "2026-07-11T12:00:00.000Z",
  nextRunAt: now,
  qbCustomerId: "customer-1",
  lastOrderId: "initial-order",
};
const patient = {
  id: "patient-1",
  firstName: "Test",
  lastName: "Patient",
  qbCardId: "card-1",
  recurringConsentAt: "2026-05-16T12:00:00.000Z",
  cardLast4: "5151",
  cardBrand: "Visa",
};
const product = {
  id: "product-1",
  name: "Medication",
  startingPrice: 299,
  doses: [
    { id: "dose-low", label: "Low", price: 299 },
    { id: "dose-high", label: "High", price: 399 },
  ],
};
const initialOrder = {
  id: "initial-order",
  patientId: patient.id,
  productId: product.id,
  doseId: "dose-low",
  status: "paid",
  paymentStatus: "completed",
  createdAt: "2026-05-16T12:00:00.000Z",
};
const refillOrder = {
  ...initialOrder,
  id: "refill-order",
  doseId: subscription.doseId,
  status: "draft",
  paymentStatus: "pending",
  isRefill: true,
  subscriptionId: subscription.id,
};

function request() {
  return {
    headers: {
      get: (name: string) => name.toLowerCase() === "authorization" ? "Bearer cron-secret" : null,
    },
    nextUrl: { origin: "https://example.test" },
  } as any;
}

describe("GET /api/cron/subscription-billing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(now));
    process.env = {
      ...originalEnv,
      CRON_SECRET: "cron-secret",
      POSTGRES_URL: "postgres://configured",
      SUBSCRIPTION_AUTOCHARGE_ENABLED: "true",
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "",
    };
    (dbServer.subscriptionDb.listDue as jest.Mock).mockResolvedValue([subscription]);
    (dbServer.patientDb.getById as jest.Mock).mockResolvedValue(patient);
    (dbServer.productDb.getById as jest.Mock).mockResolvedValue(product);
    (dbServer.orderDb.getByPatient as jest.Mock).mockResolvedValue([initialOrder]);
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue(null);
    (dbServer.orderDb.update as jest.Mock).mockResolvedValue(refillOrder);
    (dbServer.subscriptionDb.update as jest.Mock).mockResolvedValue(subscription);
    (dbServer.integrationLogDb.create as jest.Mock).mockResolvedValue({});
    (createRefillOrder as jest.Mock).mockResolvedValue(refillOrder);
    (fulfillChargedRefillOrder as jest.Mock).mockResolvedValue({ dispatched: true, warnings: [] });
    (qbPayments.chargeStoredCard as jest.Mock).mockResolvedValue({
      chargeId: "charge-1",
      status: "CAPTURED",
      cardLast4: "5151",
      cardBrand: "Visa",
    });
    (spruceServer.sendMessage as jest.Mock).mockResolvedValue({});
    (sendAdminNotification as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  it("automatically charges the current dose and fulfills the refill at week seven", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(qbPayments.chargeStoredCard).toHaveBeenCalledWith(
      refillOrder.id,
      patient.id,
      399,
      expect.objectContaining({
        customerId: subscription.qbCustomerId,
        cardId: patient.qbCardId,
        requestId: refillOrder.id,
      })
    );
    expect(fulfillChargedRefillOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        order: refillOrder,
        patient,
        product,
        amount: 399,
        subscription,
      })
    );
    expect(dbServer.subscriptionDb.update).toHaveBeenCalledWith(
      subscription.id,
      expect.objectContaining({
        lastOrderId: refillOrder.id,
        lastChargedAt: now,
      })
    );
    expect(spruceServer.sendMessage).toHaveBeenCalledWith(
      patient,
      "subscription_charged",
      expect.objectContaining({ amount: "$399.00", cardLast4: "5151" })
    );
  });

  it("does not fulfill a failed charge and sends a payment link", async () => {
    (qbPayments.chargeStoredCard as jest.Mock).mockRejectedValue(new Error("Card declined"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(fulfillChargedRefillOrder).not.toHaveBeenCalled();
    expect(dbServer.orderDb.update).toHaveBeenCalledWith(refillOrder.id, { paymentStatus: "failed" });
    expect(spruceServer.sendMessage).toHaveBeenCalledWith(
      patient,
      "subscription_payment_failed",
      expect.objectContaining({ payUrl: "https://example.test/pay/order/pay-token" })
    );
    expect(sendAdminNotification).toHaveBeenCalledWith(
      "subscription_charge_alert",
      expect.objectContaining({ orderId: refillOrder.id, reason: expect.stringContaining("Card declined") })
    );
  });
});
