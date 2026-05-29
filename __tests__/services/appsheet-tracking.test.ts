import { dedupeAppSheetTrackingUpdates, extractAppSheetTrackingUpdates } from "@/services/appsheet-tracking";

describe("appsheet-tracking", () => {
  it("maps AppSheet shipment rows to LifeFile webhook-compatible tracking updates", () => {
    const updates = extractAppSheetTrackingUpdates([
      {
        ID: "ship_1",
        OrderId: "76883211",
        TrackingNumber: "871805494724",
        rxStatus: "Rx Shipping Pickup",
      },
      {
        ID: "ship_2",
        OrderId: "76883211",
        TrackingNumber: "871805494724",
        rxStatus: "Rx Shipping Pickup",
      },
      {
        ID: "missing_tracking",
        OrderId: "76883212",
      },
    ]);

    expect(updates).toEqual([
      expect.objectContaining({
        source: "appsheet",
        event: "order.shipped",
        orderId: "76883211",
        trackingNumber: "871805494724",
        appSheetRowId: "ship_1",
        rawStatus: "Rx Shipping Pickup",
      }),
    ]);
  });

  it("also supports tracking fields from PharmacyOrder rows", () => {
    expect(extractAppSheetTrackingUpdates([
      {
        ID: "po_1",
        "Pharmacy Order ID": "900001",
        "Shipment Tracking Number": "1Z999",
        Status: "Shipped",
      },
    ], "PharmacyOrder")).toEqual([
      expect.objectContaining({
        orderId: "900001",
        trackingNumber: "1Z999",
        appSheetTable: "PharmacyOrder",
      }),
    ]);
  });

  it("dedupes the same tracking update across AppSheet tables", () => {
    const shipmentUpdates = extractAppSheetTrackingUpdates([
      {
        ID: "ship_1",
        OrderId: "223983473",
        TrackingNumber: "872397884408",
      },
    ], "PharmacyShipment");
    const orderUpdates = extractAppSheetTrackingUpdates([
      {
        ID: "po_1",
        "Pharmacy Order ID": "223983473",
        "Tracking Number": "872397884408",
      },
    ], "PharmacyOrder");

    expect(dedupeAppSheetTrackingUpdates([...shipmentUpdates, ...orderUpdates])).toEqual([
      expect.objectContaining({
        orderId: "223983473",
        trackingNumber: "872397884408",
        appSheetTable: "PharmacyShipment",
      }),
    ]);
  });
});
