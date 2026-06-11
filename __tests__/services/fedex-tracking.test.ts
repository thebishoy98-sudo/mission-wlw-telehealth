import {
  extractFedExPackageStatus,
  isDeliveredFedExStatus,
  isOutForDeliveryFedExStatus,
} from "@/services/fedex-tracking";

describe("FedEx tracking normalization", () => {
  it("detects delivered packages from FedEx status details", () => {
    const status = extractFedExPackageStatus({
      output: {
        completeTrackResults: [
          {
            trackResults: [
              {
                latestStatusDetail: {
                  code: "DL",
                  statusByLocale: "Delivered",
                  description: "Delivered",
                },
              },
            ],
          },
        ],
      },
    });

    expect(status).toMatchObject({
      kind: "delivered",
      code: "DL",
      description: "Delivered",
    });
    expect(isDeliveredFedExStatus(status)).toBe(true);
  });

  it("detects out-for-delivery packages from text statuses", () => {
    const status = extractFedExPackageStatus({
      output: {
        completeTrackResults: [
          {
            trackResults: [
              {
                latestStatusDetail: {
                  code: "OD",
                  statusByLocale: "On FedEx vehicle for delivery",
                },
              },
            ],
          },
        ],
      },
    });

    expect(status.kind).toBe("out_for_delivery");
    expect(isOutForDeliveryFedExStatus(status)).toBe(true);
  });

  it("keeps unknown in-transit statuses non-terminal", () => {
    const status = extractFedExPackageStatus({
      output: {
        completeTrackResults: [
          {
            trackResults: [
              {
                latestStatusDetail: {
                  code: "IT",
                  statusByLocale: "In transit",
                },
              },
            ],
          },
        ],
      },
    });

    expect(status.kind).toBe("in_transit");
    expect(isDeliveredFedExStatus(status)).toBe(false);
    expect(isOutForDeliveryFedExStatus(status)).toBe(false);
  });
});
