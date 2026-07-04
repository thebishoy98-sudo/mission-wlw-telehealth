/**
 * Subscription cadence + policy helpers (pure, no I/O).
 *
 * Billing model: a supply covers `intervalDays` (8 weeks = 56). We fire the
 * billing event `leadDays` (7) BEFORE the supply runs out so the refill ships
 * and arrives in time. The next cycle's coverage begins where the previous one
 * ends (continuous), so the charge cadence stays a true `intervalDays` with no
 * drift and no supply gap.
 *
 *   covers_through = supply_start + intervalDays
 *   next_run_at    = covers_through - leadDays   (when the cron fires)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_INTERVAL_DAYS = clampInt(process.env.SUBSCRIPTION_INTERVAL_DAYS, 56);
export const DEFAULT_LEAD_DAYS = clampInt(process.env.SUBSCRIPTION_LEAD_DAYS, 7);

function clampInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Auto-charge of stored cards is ON by default. Set
 * SUBSCRIPTION_AUTOCHARGE_ENABLED=false to make the cron notify-only (send
 * pay-links instead of charging) — useful as a kill switch.
 */
export function isAutochargeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SUBSCRIPTION_AUTOCHARGE_ENABLED !== "false";
}

/** First cycle for a freshly enrolled subscription, anchored to the supply start. */
export function computeInitialCycle(
  supplyStartIso: string,
  intervalDays = DEFAULT_INTERVAL_DAYS,
  leadDays = DEFAULT_LEAD_DAYS
): { coversThrough: string; nextRunAt: string } {
  const start = new Date(supplyStartIso).getTime();
  return {
    coversThrough: new Date(start + intervalDays * DAY_MS).toISOString(),
    nextRunAt: new Date(start + (intervalDays - leadDays) * DAY_MS).toISOString(),
  };
}

/**
 * Advance to the next cycle after a successful refill charge. The new supply
 * begins where the previous coverage ended (continuous) — but never in the past,
 * so a subscription that fell behind catches up from now instead of stacking
 * immediate charges.
 */
export function advanceCycle(
  currentCoversThroughIso: string | undefined,
  nowIso: string,
  intervalDays = DEFAULT_INTERVAL_DAYS,
  leadDays = DEFAULT_LEAD_DAYS
): { coversThrough: string; nextRunAt: string } {
  const now = new Date(nowIso).getTime();
  const previousEnd = currentCoversThroughIso ? new Date(currentCoversThroughIso).getTime() : now;
  const start = Math.max(previousEnd, now);
  return {
    coversThrough: new Date(start + intervalDays * DAY_MS).toISOString(),
    nextRunAt: new Date(start + (intervalDays - leadDays) * DAY_MS).toISOString(),
  };
}

/** Recurring-billing authorization shown on the pay page and recorded at enrollment. */
export const RECURRING_CONSENT_TEXT =
  "By paying, I authorize Mission WLW to securely save my payment method and enroll me in the " +
  "recurring 8-week treatment program. About a week before each 8-week refill, the care team " +
  "reviews my treatment (and may adjust my dose) and then charges my saved card and ships my " +
  "refill. I can cancel anytime from my patient portal or by contacting support.";

/** Inbound SMS bodies that signal an opt-out. */
export function isOptOutMessage(body: string): boolean {
  const normalized = body.trim().toLowerCase().replace(/[^a-z]/g, "");
  return ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "pause"].includes(normalized);
}
