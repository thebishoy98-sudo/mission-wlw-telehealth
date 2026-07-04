import type { Order } from "@/types";

/**
 * Order cadence rules.
 *
 * Feature: a patient may not place a fresh order too soon after their last paid
 * order (they still have supply). Subscription auto-refills are scheduled at the
 * correct cadence and bypass this rule entirely (they never go through the
 * interactive checkout that enforces it).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function clampDays(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Minimum gap (days) between a patient's paid orders. ~7 weeks by default. */
export const MIN_REORDER_INTERVAL_DAYS = clampDays(process.env.MIN_REORDER_INTERVAL_DAYS, 49);

type CountableOrder = Pick<Order, "id" | "status" | "paymentStatus" | "createdAt">;

/** A real purchase — the patient actually paid. Draft/failed shells do not count. */
export function isCountableOrder(order: Pick<Order, "status" | "paymentStatus">): boolean {
  if (order.status === "cancelled") return false;
  return order.paymentStatus === "completed";
}

export type CadenceEvaluation = {
  tooSoon: boolean;
  daysSinceLast: number | null;
  lastOrderAt: string | null;
  nextEligibleAt: string | null;
  priorCountableCount: number;
};

export function evaluateOrderCadence(
  orders: CountableOrder[],
  options: { now?: number; excludeOrderId?: string; minIntervalDays?: number } = {}
): CadenceEvaluation {
  const now = options.now ?? Date.now();
  const minDays = options.minIntervalDays ?? MIN_REORDER_INTERVAL_DAYS;

  const countable = orders
    .filter((order) => order.id !== options.excludeOrderId && isCountableOrder(order))
    .map((order) => ({ order, ts: Date.parse(order.createdAt) }))
    .filter((entry) => Number.isFinite(entry.ts) && entry.ts <= now)
    .sort((a, b) => b.ts - a.ts);

  const last = countable[0];
  if (!last) {
    return { tooSoon: false, daysSinceLast: null, lastOrderAt: null, nextEligibleAt: null, priorCountableCount: 0 };
  }

  const daysSinceLast = (now - last.ts) / DAY_MS;
  return {
    tooSoon: daysSinceLast < minDays,
    daysSinceLast,
    lastOrderAt: new Date(last.ts).toISOString(),
    nextEligibleAt: new Date(last.ts + minDays * DAY_MS).toISOString(),
    priorCountableCount: countable.length,
  };
}

/**
 * Feature: flag an order as "back-to-back" when the same patient has another
 * paid order within the minimum interval BEFORE it. Used for admin visibility.
 */
export function isBackToBackOrder(
  order: Pick<Order, "id" | "patientId" | "createdAt">,
  patientOrders: Array<Pick<Order, "id" | "patientId" | "status" | "paymentStatus" | "createdAt">>,
  minIntervalDays: number = MIN_REORDER_INTERVAL_DAYS
): boolean {
  const ts = Date.parse(order.createdAt);
  if (!Number.isFinite(ts)) return false;
  return patientOrders.some((other) => {
    if (other.id === order.id || other.patientId !== order.patientId) return false;
    if (!isCountableOrder(other)) return false;
    const otherTs = Date.parse(other.createdAt);
    if (!Number.isFinite(otherTs) || otherTs >= ts) return false; // only earlier orders
    return (ts - otherTs) / DAY_MS < minIntervalDays;
  });
}
