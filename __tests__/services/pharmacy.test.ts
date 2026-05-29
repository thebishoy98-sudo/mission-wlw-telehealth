import type { Order } from "@/types";
import * as appsheet from "@/services/appsheet";
import * as lifefile from "@/services/lifefile";
import * as pharmacy from "@/services/pharmacy";

jest.mock("@/services/appsheet", () => ({
  createPharmacyOrder: jest.fn(),
}));

jest.mock("@/services/lifefile", () => ({
  createPharmacyOrder: jest.fn(),
}));

const order: Order = {
  id: "order_1",
  patientId: "patient_1",
  productId: "product_1",
  doseId: "dose_1",
  status: "approved",
  paymentStatus: "completed",
  pharmacyStatus: "draft",
  practiceQStatus: "completed",
  quickbooksStatus: "skipped",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("pharmacy provider router", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    (appsheet.createPharmacyOrder as jest.Mock).mockResolvedValue({ id: "as_1" });
    (lifefile.createPharmacyOrder as jest.Mock).mockResolvedValue({ id: "lf_1" });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("routes pharmacy dispatch to AppSheet when selected", async () => {
    process.env.PHARMACY_PROVIDER = "appsheet";

    await pharmacy.createPharmacyOrder(order);

    expect(appsheet.createPharmacyOrder).toHaveBeenCalledWith(order, undefined);
    expect(lifefile.createPharmacyOrder).not.toHaveBeenCalled();
  });

  it("keeps LifeFile as the default when AppSheet is not configured", async () => {
    delete process.env.PHARMACY_PROVIDER;
    process.env.APPSHEET_ID = "configured_but_not_selected";

    await pharmacy.createPharmacyOrder(order);

    expect(lifefile.createPharmacyOrder).toHaveBeenCalledWith(order, undefined);
    expect(appsheet.createPharmacyOrder).not.toHaveBeenCalled();
  });
});
