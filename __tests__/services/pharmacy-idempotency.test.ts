import type { Order, PharmacyOrder } from "@/types";
import * as dbServer from "@/lib/db.server";
import * as lifefile from "@/services/lifefile";
import * as pharmacy from "@/services/pharmacy";

jest.mock("@/lib/db.server", () => ({
  orderDb: {
    claimPharmacyDispatch: jest.fn(),
    releasePharmacyDispatch: jest.fn(),
  },
  pharmacyOrderDb: {
    getByOrder: jest.fn(),
  },
}));

jest.mock("@/services/lifefile", () => ({
  createPharmacyOrder: jest.fn(),
}));

jest.mock("@/services/appsheet", () => ({
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
  quickbooksStatus: "invoiced",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const existing: PharmacyOrder = {
  id: "pharmacy_1",
  orderId: order.id,
  patientId: order.patientId,
  lifeFileOrderId: "224439959",
  status: "submitted",
  payload: {} as PharmacyOrder["payload"],
  submittedAt: "2026-01-01T00:01:00.000Z",
};

describe("pharmacy dispatch idempotency", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.PHARMACY_PROVIDER;
    (dbServer.orderDb.releasePharmacyDispatch as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns the existing pharmacy order without another provider call", async () => {
    (dbServer.orderDb.claimPharmacyDispatch as jest.Mock).mockResolvedValue(false);
    (dbServer.pharmacyOrderDb.getByOrder as jest.Mock).mockResolvedValue(existing);

    await expect(pharmacy.createPharmacyOrder(order)).resolves.toEqual(existing);
    expect(lifefile.createPharmacyOrder).not.toHaveBeenCalled();
  });

  it("calls the provider only after winning the dispatch claim", async () => {
    (dbServer.orderDb.claimPharmacyDispatch as jest.Mock).mockResolvedValue(true);
    (lifefile.createPharmacyOrder as jest.Mock).mockResolvedValue(existing);

    await expect(pharmacy.createPharmacyOrder(order)).resolves.toEqual(existing);
    expect(lifefile.createPharmacyOrder).toHaveBeenCalledTimes(1);
  });

  it("releases a failed dispatch claim for a safe retry", async () => {
    (dbServer.orderDb.claimPharmacyDispatch as jest.Mock).mockResolvedValue(true);
    (lifefile.createPharmacyOrder as jest.Mock).mockRejectedValue(new Error("LifeFile unavailable"));

    await expect(pharmacy.createPharmacyOrder(order)).rejects.toThrow("LifeFile unavailable");
    expect(dbServer.orderDb.releasePharmacyDispatch).toHaveBeenCalledWith(order.id);
  });
});
