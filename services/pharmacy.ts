import type { Order, Patient, PharmacyOrder, Product } from "@/types";
import * as lifefile from "@/services/lifefile";
import * as appsheet from "@/services/appsheet";
import * as dbServer from "@/lib/db.server";

function pharmacyProvider() {
  return (process.env.PHARMACY_PROVIDER ?? "lifefile").toLowerCase();
}

export const createPharmacyOrder = async (
  order: Order,
  overrides?: { patient?: Patient | null; product?: Product | null }
): Promise<PharmacyOrder> => {
  const claimed = await dbServer.orderDb.claimPharmacyDispatch(order.id);
  if (!claimed) {
    const existing = await dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null);
    if (existing && existing.status !== "error") return existing;
    throw new Error("Pharmacy dispatch is already in progress");
  }

  try {
    if (pharmacyProvider() === "appsheet") {
      return await appsheet.createPharmacyOrder(order, overrides);
    }
    return await lifefile.createPharmacyOrder(order, overrides);
  } catch (error) {
    await dbServer.orderDb.releasePharmacyDispatch(order.id).catch(() => null);
    throw error;
  }
};

export const getPharmacyProvider = () => pharmacyProvider();
