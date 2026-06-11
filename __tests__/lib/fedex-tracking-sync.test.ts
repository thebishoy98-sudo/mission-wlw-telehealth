import { buildFedExTrackingActions } from "@/lib/fedex-tracking-sync";

const row = {
  orderId: "order_1",
  pharmacyOrderId: "pharm_1",
  patientId: "patient_1",
  firstName: "Sam",
  lastName: "Taylor",
  phone: "5555551212",
  trackingNumber: "784578178554",
};

describe("buildFedExTrackingActions", () => {
  it("marks delivered packages delivered and sends one delivery text", () => {
    expect(
      buildFedExTrackingActions({
        row,
        status: { kind: "delivered", code: "DL", description: "Delivered" },
        existingTemplateKeys: [],
        now: "2026-06-11T12:00:00.000Z",
      })
    ).toEqual({
      pharmacyUpdate: { status: "delivered", deliveredAt: "2026-06-11T12:00:00.000Z" },
      orderUpdate: { status: "delivered", pharmacyStatus: "delivered" },
      messages: [{ templateKey: "order_delivered", variables: { orderId: "order_1" } }],
      logAction: "FedEx delivered order",
    });
  });

  it("does not repeat delivery texts already created for the order", () => {
    expect(
      buildFedExTrackingActions({
        row,
        status: { kind: "delivered", code: "DL", description: "Delivered" },
        existingTemplateKeys: ["order_delivered"],
        now: "2026-06-11T12:00:00.000Z",
      }).messages
    ).toEqual([]);
  });

  it("sends one out-for-delivery text without marking the order delivered", () => {
    expect(
      buildFedExTrackingActions({
        row,
        status: { kind: "out_for_delivery", code: "OD", description: "On FedEx vehicle for delivery" },
        existingTemplateKeys: [],
        now: "2026-06-11T12:00:00.000Z",
      })
    ).toMatchObject({
      pharmacyUpdate: null,
      orderUpdate: null,
      messages: [
        {
          templateKey: "order_out_for_delivery",
          variables: { orderId: "order_1", trackingNumber: "784578178554" },
        },
      ],
      logAction: "FedEx package out for delivery",
    });
  });
});
