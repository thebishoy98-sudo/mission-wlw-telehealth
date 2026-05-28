import {
  mapLifeFileStatusToEvent,
  normalizeLifeFileWebhookPayload,
} from "@/lib/lifefile-webhook";

describe("Life File webhook normalization", () => {
  it("keeps the existing normalized payload shape", () => {
    expect(
      normalizeLifeFileWebhookPayload({
        event: "order.shipped",
        orderId: 24200716,
        trackingNumber: "1Z999",
      })
    ).toEqual({
      event: "order.shipped",
      lifeFileOrderId: "24200716",
      trackingNumber: "1Z999",
      lifeFileError: undefined,
      rawStatus: undefined,
    });
  });

  it("accepts raw Life File status body with order id in the query string", () => {
    expect(normalizeLifeFileWebhookPayload({ status: "shipped" }, "24200716")).toMatchObject({
      event: "order.shipped",
      lifeFileOrderId: "24200716",
      rawStatus: "shipped",
    });
  });

  it("maps common pharmacy statuses into app events", () => {
    expect(mapLifeFileStatusToEvent("received")).toBe("order.received");
    expect(mapLifeFileStatusToEvent("in progress")).toBe("order.processing");
    expect(mapLifeFileStatusToEvent("delivered")).toBe("order.delivered");
    expect(mapLifeFileStatusToEvent("failed")).toBe("order.error");
  });
});
