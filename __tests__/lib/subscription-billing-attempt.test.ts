/** @jest-environment node */
jest.mock("@/lib/db.server", () => ({ sql: jest.fn() }));
import { sql } from "@/lib/db.server";
import { reserveSubscriptionAttempt } from "@/lib/subscription-billing-attempt";

const query = sql as jest.Mock;
beforeEach(() => query.mockReset());
test.each([0, 1, 2])("allows attempt after %i prior attempts", async count => {
  query.mockResolvedValue({ rows: [{ previous_attempts: count }] });
  expect(await reserveSubscriptionAttempt("sub")).toEqual({ allowed: true, exhausted: false, attempt: count + 1 });
});
test.each([3, 8])("blocks an already exhausted subscription (%i)", async count => {
  query.mockResolvedValue({ rows: [{ previous_attempts: count }] });
  expect(await reserveSubscriptionAttempt("sub")).toMatchObject({ allowed: false, exhausted: true });
});
test("does not charge a subscription claimed by another run or paused by staff", async () => {
  query.mockResolvedValue({ rows: [] });
  expect(await reserveSubscriptionAttempt("sub")).toMatchObject({ allowed: false, exhausted: false });
});
test("fails closed if the attempt cannot be persisted", async () => {
  query.mockRejectedValue(new Error("database offline"));
  await expect(reserveSubscriptionAttempt("sub")).rejects.toThrow("database offline");
});
