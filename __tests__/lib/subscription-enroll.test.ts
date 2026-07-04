/** @jest-environment node */

import * as quickbooks from "@/services/quickbooks";
import * as qbPayments from "@/services/quickbooks-payments";
import {
  CardEnrollmentError,
  storeCardAndChargeStored,
} from "@/lib/subscription-enroll";

jest.mock("@/services/quickbooks", () => ({
  createCustomerRecord: jest.fn(),
}));

jest.mock("@/services/quickbooks-payments", () => ({
  listCardsOnFile: jest.fn(),
  storeCardOnFile: jest.fn(),
  chargeStoredCard: jest.fn(),
}));

const order = { id: "order-1" } as any;
const patient = { id: "patient-1" } as any;
const captured = {
  chargeId: "charge-1",
  status: "CAPTURED",
  cardLast4: "5151",
  cardBrand: "Visa",
};

describe("storeCardAndChargeStored retry safety", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (quickbooks.createCustomerRecord as jest.Mock).mockResolvedValue("customer-1");
    (qbPayments.chargeStoredCard as jest.Mock).mockResolvedValue(captured);
  });

  it("reuses any existing customer card without creating another", async () => {
    (qbPayments.listCardsOnFile as jest.Mock).mockResolvedValue([
      { cardId: "card-existing", cardLast4: "5151", cardBrand: "Visa" },
    ]);

    const result = await storeCardAndChargeStored({
      order,
      patient,
      amount: 299,
      cardToken: "fresh-token",
      cardLast4: "5151",
      cardBrand: "Visa",
    });

    expect(qbPayments.storeCardOnFile).not.toHaveBeenCalled();
    expect(qbPayments.chargeStoredCard).toHaveBeenCalledWith(
      order.id,
      patient.id,
      299,
      expect.objectContaining({ cardId: "card-existing" })
    );
    expect(result.qbCardId).toBe("card-existing");
  });

  it("creates a card only when the customer has no cards", async () => {
    (qbPayments.listCardsOnFile as jest.Mock).mockResolvedValue([]);
    (qbPayments.storeCardOnFile as jest.Mock).mockResolvedValue({
      cardId: "card-new",
      cardLast4: "5151",
      cardBrand: "Visa",
    });

    const result = await storeCardAndChargeStored({
      order,
      patient,
      amount: 299,
      cardToken: "fresh-token",
    });

    expect(qbPayments.storeCardOnFile).toHaveBeenCalledWith(
      "customer-1",
      "fresh-token",
      expect.any(Object)
    );
    expect(result.qbCardId).toBe("card-new");
  });

  it("recovers when another request creates the card first", async () => {
    (qbPayments.listCardsOnFile as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { cardId: "card-race", cardLast4: "5151", cardBrand: "Visa" },
      ]);
    (qbPayments.storeCardOnFile as jest.Mock).mockRejectedValue(
      new Error("QuickBooks store-card failed: card already exists")
    );

    const result = await storeCardAndChargeStored({
      order,
      patient,
      amount: 299,
      cardToken: "fresh-token",
    });

    expect(qbPayments.listCardsOnFile).toHaveBeenCalledTimes(2);
    expect(result.qbCardId).toBe("card-race");
  });

  it("marks lookup failures safe for a one-time token fallback", async () => {
    (qbPayments.listCardsOnFile as jest.Mock).mockRejectedValue(new Error("lookup unavailable"));

    await expect(storeCardAndChargeStored({
      order,
      patient,
      amount: 299,
      cardToken: "fresh-token",
    })).rejects.toMatchObject<CardEnrollmentError>({ tokenConsumed: false });
  });

  it("marks stored-card charge failures unsafe for token reuse", async () => {
    (qbPayments.listCardsOnFile as jest.Mock).mockResolvedValue([]);
    (qbPayments.storeCardOnFile as jest.Mock).mockResolvedValue({
      cardId: "card-new",
      cardLast4: "5151",
      cardBrand: "Visa",
    });
    (qbPayments.chargeStoredCard as jest.Mock).mockRejectedValue(new Error("charge failed"));

    await expect(storeCardAndChargeStored({
      order,
      patient,
      amount: 299,
      cardToken: "fresh-token",
    })).rejects.toMatchObject<CardEnrollmentError>({ tokenConsumed: true });
  });
});
