import {
  evaluateOrderCadence,
  isBackToBackOrder,
  isCountableOrder,
  MIN_REORDER_INTERVAL_DAYS,
} from "@/lib/order-cadence";
import type { Order } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function order(partial: Partial<Order> & { id: string; createdAt: string }): Order {
  return {
    patientId: "p1",
    productId: "prod",
    doseId: "dose",
    status: "sent_to_pharmacy",
    paymentStatus: "completed",
    pharmacyStatus: "submitted",
    practiceQStatus: "completed",
    quickbooksStatus: "invoiced",
    updatedAt: partial.createdAt,
    ...partial,
  } as Order;
}

describe("order cadence", () => {
  const now = Date.parse("2026-07-03T00:00:00.000Z");

  it("defaults the minimum interval to ~7 weeks", () => {
    expect(MIN_REORDER_INTERVAL_DAYS).toBe(49);
  });

  it("only counts paid, non-cancelled orders", () => {
    expect(isCountableOrder({ status: "sent_to_pharmacy", paymentStatus: "completed" })).toBe(true);
    expect(isCountableOrder({ status: "draft", paymentStatus: "pending" })).toBe(false);
    expect(isCountableOrder({ status: "cancelled", paymentStatus: "completed" })).toBe(false);
    expect(isCountableOrder({ status: "pending_review", paymentStatus: "failed" })).toBe(false);
  });

  it("flags an order placed too soon after the last paid order", () => {
    const orders = [
      order({ id: "recent", createdAt: new Date(now - 10 * DAY_MS).toISOString() }),
    ];
    const result = evaluateOrderCadence(orders, { now, excludeOrderId: "new" });
    expect(result.tooSoon).toBe(true);
    expect(Math.round(result.daysSinceLast ?? 0)).toBe(10);
    expect(result.nextEligibleAt).toBe(new Date(now - 10 * DAY_MS + 49 * DAY_MS).toISOString());
  });

  it("allows an order once enough time has passed", () => {
    const orders = [
      order({ id: "old", createdAt: new Date(now - 60 * DAY_MS).toISOString() }),
    ];
    expect(evaluateOrderCadence(orders, { now }).tooSoon).toBe(false);
  });

  it("ignores the current order and unpaid shells", () => {
    const orders = [
      order({ id: "self", createdAt: new Date(now - 1 * DAY_MS).toISOString() }),
      order({ id: "draft", status: "draft", paymentStatus: "pending", createdAt: new Date(now - 2 * DAY_MS).toISOString() }),
    ];
    expect(evaluateOrderCadence(orders, { now, excludeOrderId: "self" }).tooSoon).toBe(false);
  });

  it("returns not-too-soon when the patient has no prior paid orders", () => {
    expect(evaluateOrderCadence([], { now })).toEqual({
      tooSoon: false,
      daysSinceLast: null,
      lastOrderAt: null,
      nextEligibleAt: null,
      priorCountableCount: 0,
    });
  });

  it("flags back-to-back orders for admin visibility", () => {
    const first = order({ id: "first", createdAt: new Date(now - 40 * DAY_MS).toISOString() });
    const second = order({ id: "second", createdAt: new Date(now).toISOString() });
    expect(isBackToBackOrder(second, [first, second])).toBe(true);
    // 60 days apart -> not back-to-back
    const older = order({ id: "older", createdAt: new Date(now - 60 * DAY_MS).toISOString() });
    expect(isBackToBackOrder(second, [older, second])).toBe(false);
  });
});
