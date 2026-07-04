/** @jest-environment node */

import * as dbServer from "@/lib/db.server";
import * as qbPayments from "@/services/quickbooks-payments";
import * as spruceServer from "@/services/spruce.server";
import { createRefillOrder, fulfillChargedRefillOrder } from "@/lib/order-fulfillment";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/server-auth", () => ({ requireProviderOrAdmin: jest.fn(() => null) }));
jest.mock("@/lib/staff-session", () => ({
  getStaffSessionFromRequest: jest.fn(() => ({ name: "Test Admin" })),
}));
jest.mock("@/lib/db.server", () => ({
  subscriptionDb: { getById: jest.fn(), update: jest.fn() },
  patientDb: { getById: jest.fn() },
  productDb: { getById: jest.fn() },
  orderDb: { getById: jest.fn(), getByPatient: jest.fn(), update: jest.fn() },
  integrationLogDb: { create: jest.fn() },
}));
jest.mock("@/services/quickbooks-payments", () => ({ chargeStoredCard: jest.fn() }));
jest.mock("@/services/spruce.server", () => ({ sendMessage: jest.fn() }));
jest.mock("@/lib/order-fulfillment", () => ({
  createRefillOrder: jest.fn(),
  fulfillChargedRefillOrder: jest.fn(),
}));

const { POST } = require("@/app/api/provider/subscriptions/route");

const subscription = {
  id: "sub-1",
  patientId: "patient-1",
  productId: "product-1",
  doseId: "dose-low",
  status: "active",
  intervalDays: 56,
  leadDays: 7,
  lastOrderId: "refill-original",
  qbCustomerId: "customer-1",
  lastChargedAt: "2026-07-04T00:00:00.000Z",
};
const patient = {
  id: "patient-1",
  firstName: "Test",
  lastName: "Patient",
  qbCardId: "card-1",
  recurringConsentAt: "2026-05-16T00:00:00.000Z",
  cardLast4: "5151",
  cardBrand: "Visa",
};
const product = {
  id: "product-1",
  startingPrice: 299,
  doses: [
    { id: "dose-low", price: 299 },
    { id: "dose-high", price: 399 },
  ],
};
const previousOrder = { id: "refill-original", doseId: "dose-low", paymentStatus: "completed" };
const adjustmentOrder = {
  id: "refill-adjustment",
  patientId: patient.id,
  productId: product.id,
  doseId: "dose-high",
  isRefill: true,
  paymentStatus: "pending",
};

const request = (body: unknown) => ({ json: async () => body } as any);

describe("POST /api/provider/subscriptions dose adjustment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYMENT_CHARGE_AMOUNT_OVERRIDE = "";
    (dbServer.subscriptionDb.getById as jest.Mock).mockResolvedValue(subscription);
    (dbServer.subscriptionDb.update as jest.Mock).mockResolvedValue(subscription);
    (dbServer.patientDb.getById as jest.Mock).mockResolvedValue(patient);
    (dbServer.productDb.getById as jest.Mock).mockResolvedValue(product);
    (dbServer.orderDb.getById as jest.Mock).mockResolvedValue(previousOrder);
    (dbServer.orderDb.update as jest.Mock).mockResolvedValue(adjustmentOrder);
    (dbServer.integrationLogDb.create as jest.Mock).mockResolvedValue({});
    (createRefillOrder as jest.Mock).mockResolvedValue(adjustmentOrder);
    (qbPayments.chargeStoredCard as jest.Mock).mockResolvedValue({
      chargeId: "charge-adjustment",
      status: "CAPTURED",
      cardLast4: "5151",
      cardBrand: "Visa",
    });
    (spruceServer.sendMessage as jest.Mock).mockResolvedValue({});
    (fulfillChargedRefillOrder as jest.Mock).mockResolvedValue({ dispatched: true, warnings: [] });
  });

  it("charges the price difference and dispatches supplemental medication", async () => {
    const response = await POST(request({
      action: "charge_dose_adjustment",
      subscriptionId: subscription.id,
      doseId: "dose-high",
    }));

    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      amount: 100,
      calculatedDifference: 100,
      orderId: adjustmentOrder.id,
      dispatched: true,
    }));
    expect(qbPayments.chargeStoredCard).toHaveBeenCalledWith(
      adjustmentOrder.id,
      patient.id,
      100,
      expect.objectContaining({ cardId: patient.qbCardId, requestId: adjustmentOrder.id })
    );
    expect(fulfillChargedRefillOrder).toHaveBeenCalledWith(
      expect.objectContaining({ order: adjustmentOrder, amount: 100 })
    );
    expect(dbServer.subscriptionDb.update).toHaveBeenCalledWith(
      subscription.id,
      expect.objectContaining({ doseId: "dose-high", lastOrderId: adjustmentOrder.id })
    );
  });

  it("does not dispatch or change the subscription when the adjustment charge fails", async () => {
    (qbPayments.chargeStoredCard as jest.Mock).mockRejectedValue(new Error("Card declined"));

    const response = await POST(request({
      action: "charge_dose_adjustment",
      subscriptionId: subscription.id,
      doseId: "dose-high",
    }));

    expect(response.status).toBe(402);
    expect(fulfillChargedRefillOrder).not.toHaveBeenCalled();
    expect(dbServer.subscriptionDb.update).not.toHaveBeenCalled();
    expect(dbServer.orderDb.update).toHaveBeenCalledWith(adjustmentOrder.id, { paymentStatus: "failed" });
  });
});
