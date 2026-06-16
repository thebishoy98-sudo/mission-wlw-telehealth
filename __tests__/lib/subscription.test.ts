import {
  computeInitialCycle,
  advanceCycle,
  isAutochargeEnabled,
  isOptOutMessage,
} from "@/lib/subscription";

const DAY = 24 * 60 * 60 * 1000;

describe("subscription cadence", () => {
  it("anchors the first cycle: covers_through = start + 56d, next_run = 7d before that", () => {
    const start = "2026-01-01T00:00:00.000Z";
    const { coversThrough, nextRunAt } = computeInitialCycle(start, 56, 7);
    expect(coversThrough).toBe(new Date(Date.parse(start) + 56 * DAY).toISOString());
    expect(nextRunAt).toBe(new Date(Date.parse(start) + 49 * DAY).toISOString());
  });

  it("advances continuously: next coverage begins where the previous ended (no drift)", () => {
    // Charged 7 days early, so coversThrough is ~7 days in the future.
    const now = "2026-03-01T00:00:00.000Z";
    const currentCoversThrough = new Date(Date.parse(now) + 7 * DAY).toISOString();
    const { coversThrough, nextRunAt } = advanceCycle(currentCoversThrough, now, 56, 7);
    // New supply starts at the old end → exactly one interval later, true 8-week cadence.
    expect(coversThrough).toBe(new Date(Date.parse(currentCoversThrough) + 56 * DAY).toISOString());
    expect(nextRunAt).toBe(new Date(Date.parse(currentCoversThrough) + 49 * DAY).toISOString());
  });

  it("catches up from now when a subscription fell behind (no stacked charges)", () => {
    const now = "2026-03-01T00:00:00.000Z";
    const stale = new Date(Date.parse(now) - 30 * DAY).toISOString(); // coverage ended 30d ago
    const { coversThrough } = advanceCycle(stale, now, 56, 7);
    expect(coversThrough).toBe(new Date(Date.parse(now) + 56 * DAY).toISOString());
  });
});

describe("autocharge flag", () => {
  it("is ON by default and only OFF when explicitly disabled", () => {
    expect(isAutochargeEnabled({})).toBe(true);
    expect(isAutochargeEnabled({ SUBSCRIPTION_AUTOCHARGE_ENABLED: "true" })).toBe(true);
    expect(isAutochargeEnabled({ SUBSCRIPTION_AUTOCHARGE_ENABLED: "false" })).toBe(false);
  });
});

describe("SMS opt-out detection", () => {
  it("recognizes opt-out keywords regardless of case/punctuation", () => {
    for (const body of ["STOP", "stop", " Stop! ", "CANCEL", "unsubscribe", "Pause", "quit"]) {
      expect(isOptOutMessage(body)).toBe(true);
    }
  });

  it("does not treat normal replies as opt-out", () => {
    for (const body of ["thanks!", "when will it ship?", "yes please", "great"]) {
      expect(isOptOutMessage(body)).toBe(false);
    }
  });
});
