import { getDisplayOrderNumber, getDisplayPracticeQStatus, isPracticeQSkippedForOrder } from "@/lib/order-display";
import type { Order, PharmacyOrder } from "@/types";

const order = {
  id: "order_1780274917531",
} as Order;

describe("getDisplayOrderNumber", () => {
  it("uses the pharmacy order number when one exists", () => {
    expect(getDisplayOrderNumber(order, { lifeFileOrderId: "124156633" } as PharmacyOrder)).toBe("124156633");
  });

  it("falls back to the internal order suffix before pharmacy submission", () => {
    expect(getDisplayOrderNumber(order, null)).toBe("74917531");
  });
});

describe("getDisplayPracticeQStatus", () => {
  it("treats returning-patient identity reuse orders as PracticeQ skipped for legacy rows", () => {
    const legacyOrder = {
      ...order,
      practiceQStatus: "error",
      identityReason: "Returning patient identity reused from the patient's previous verified order.",
    } as Order;

    expect(isPracticeQSkippedForOrder(legacyOrder)).toBe(true);
    expect(getDisplayPracticeQStatus(legacyOrder)).toBe("skipped");
  });
});
