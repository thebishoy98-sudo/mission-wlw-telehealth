import type { Order, Patient, PharmacyOrder, Product } from "@/types";
import * as lifefile from "@/services/lifefile";
import * as appsheet from "@/services/appsheet";

function pharmacyProvider() {
  return (process.env.PHARMACY_PROVIDER ?? "lifefile").toLowerCase();
}

export const createPharmacyOrder = async (
  order: Order,
  overrides?: { patient?: Patient | null; product?: Product | null }
): Promise<PharmacyOrder> => {
  if (pharmacyProvider() === "appsheet") {
    return appsheet.createPharmacyOrder(order, overrides);
  }
  return lifefile.createPharmacyOrder(order, overrides);
};

export const getPharmacyProvider = () => pharmacyProvider();
