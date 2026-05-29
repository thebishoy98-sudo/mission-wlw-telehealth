/**
 * AppSheet pharmacy dispatch.
 *
 * Real writes are disabled unless USE_REAL_APPSHEET=true. In mock mode this
 * builds the exact order rows that would be sent, saves a local PharmacyOrder,
 * and never calls the AppSheet API.
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId } from "@/lib/utils";

type AppSheetOrderLine = {
  itemId: string;
  itemName: string;
  drugName: string;
  drugStrength: string;
  drugForm: string;
  rxType: "new";
  quantity: number;
  directions: string;
  daysSupply: number;
};

const APPSHEET_ITEMS = {
  tirzepatideHalfMl: {
    itemId: "8279399",
    itemName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (0.5 ML)",
    drugName: "TIRZEPATIDE/PYRIDOXINE",
    drugStrength: "20MG/25MG/ML (0.5 ML)",
    drugForm: "INJECTABLE",
  },
  tirzepatideOneMl: {
    itemId: "8279095",
    itemName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (1 ML)",
    drugName: "TIRZEPATIDE/PYRIDOXINE",
    drugStrength: "20MG/25MG/ML (1 ML)",
    drugForm: "INJECTABLE",
  },
  tirzepatideTwoMl: {
    itemId: "8279096",
    itemName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML (2 ML)",
    drugName: "TIRZEPATIDE/PYRIDOXINE",
    drugStrength: "20MG/25MG/ML (2 ML)",
    drugForm: "INJECTABLE",
  },
  tirzepatideOpenMl: {
    itemId: "8229561",
    itemName: "TIRZEPATIDE/PYRIDOXINE 20MG/25MG/ML",
    drugName: "TIRZEPATIDE/PYRIDOXINE",
    drugStrength: "20MG/25MG/ML",
    drugForm: "INJECTABLE",
  },
  syringe: {
    itemId: "8005858",
    itemName: "COMFORT EZ 31GX5/16\" 1ML",
    drugName: "COMFORT EZ 31GX5/16\" 1ML",
    drugStrength: "",
    drugForm: "SYRINGE",
  },
  alcoholSwabs: {
    itemId: "6850497",
    itemName: "ALCOHOL SWABS",
    drugName: "ALCOHOL SWABS",
    drugStrength: "",
    drugForm: "SUPPLY",
  },
};

function cfg() {
  const all = process.env.USE_REAL_INTEGRATIONS === "true";
  return {
    useMock: !(all || process.env.USE_REAL_APPSHEET === "true"),
    appId: process.env.APPSHEET_ID ?? "",
    apiKey: process.env.APPSHEET_API_KEY ?? "",
    baseUrl: process.env.APPSHEET_BASE_URL ?? "https://www.appsheet.com",
    orderTable: process.env.APPSHEET_ORDER_TABLE ?? "OrderItems",
    pharmacyOrderTable: process.env.APPSHEET_PHARMACY_ORDER_TABLE ?? "PharmacyOrder",
    clientTable: process.env.APPSHEET_CLIENT_TABLE ?? "Client",
    timezone: process.env.APPSHEET_TIMEZONE ?? "America/New_York",
    pharmacyName: process.env.APPSHEET_PHARMACY_NAME ?? "1stChoiceRx",
  };
}

function requiredText(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    throw new Error(`Invalid order data - missing patient ${label}`);
  }
  return text;
}

function parseWeeklyDoseMg(dose: Types.DoseOption): number {
  if (typeof dose.weeklyDoseMg === "number" && dose.weeklyDoseMg > 0) return dose.weeklyDoseMg;
  const match = `${dose.strength} ${dose.label}`.match(/(\d+(?:\.\d+)?)\s*mg/i);
  return match ? Number(match[1]) : 0;
}

function formatPatientAddress(address: Types.Address): string {
  return [
    address.street1,
    address.street2,
    `${address.city}, ${address.state} ${address.zipCode}`.trim(),
    address.country,
  ].filter(Boolean).join(", ");
}

function isTirzepatide(product: Types.Product): boolean {
  return product.slug.toLowerCase().includes("tirzepatide") || product.name.toLowerCase().includes("tirzepatide");
}

function addVialLine(
  lines: AppSheetOrderLine[],
  item: Pick<AppSheetOrderLine, "itemId" | "itemName" | "drugName" | "drugStrength" | "drugForm">,
  quantity: number,
  directions: string,
  daysSupply: number
) {
  if (quantity <= 0) return;
  const existing = lines.find((line) => line.itemId === item.itemId && line.directions === directions);
  if (existing) {
    existing.quantity += quantity;
    return;
  }
  lines.push({ ...item, rxType: "new", quantity, directions, daysSupply });
}

function buildMedicationLines(product: Types.Product, dose: Types.DoseOption): AppSheetOrderLine[] {
  const daysSupply = (dose.durationWeeks && dose.durationWeeks > 0 ? dose.durationWeeks : 4) * 7;
  const directions = dose.prescriptionLabel || `Inject ${dose.label} subcutaneously once weekly as directed by prescriber`;

  if (!isTirzepatide(product)) {
    return [{
      itemId: product.id,
      itemName: product.name,
      drugName: product.name,
      drugStrength: dose.strength,
      drugForm: dose.label,
      rxType: "new",
      quantity: Math.max(1, dose.quantity || 1),
      directions,
      daysSupply,
    }];
  }

  const weeklyMg = parseWeeklyDoseMg(dose);
  const durationWeeks = dose.durationWeeks && dose.durationWeeks > 0 ? dose.durationWeeks : 4;
  const totalMl = weeklyMg > 0 ? (weeklyMg * durationWeeks) / 20 : 2;
  const lines: AppSheetOrderLine[] = [];
  let remainingHalfMlUnits = Math.max(1, Math.ceil(totalMl * 2));

  const twoMlQty = Math.floor(remainingHalfMlUnits / 4);
  addVialLine(lines, APPSHEET_ITEMS.tirzepatideTwoMl, twoMlQty, directions, daysSupply);
  remainingHalfMlUnits -= twoMlQty * 4;

  const oneMlQty = Math.floor(remainingHalfMlUnits / 2);
  addVialLine(lines, APPSHEET_ITEMS.tirzepatideOneMl, oneMlQty, directions, daysSupply);
  remainingHalfMlUnits -= oneMlQty * 2;

  addVialLine(lines, APPSHEET_ITEMS.tirzepatideHalfMl, remainingHalfMlUnits, directions, daysSupply);
  return lines.length ? lines : [{ ...APPSHEET_ITEMS.tirzepatideOpenMl, rxType: "new", quantity: 1, directions, daysSupply }];
}

export function buildAppSheetOrderLines(product: Types.Product, dose: Types.DoseOption): AppSheetOrderLine[] {
  const medicationLines = buildMedicationLines(product, dose);
  const daysSupply = medicationLines[0]?.daysSupply ?? 56;
  return [
    ...medicationLines,
    {
      ...APPSHEET_ITEMS.syringe,
      rxType: "new",
      quantity: 10,
      directions: "Use as directed with injection",
      daysSupply,
    },
    {
      ...APPSHEET_ITEMS.alcoholSwabs,
      rxType: "new",
      quantity: 10,
      directions: "Use as directed with injection",
      daysSupply,
    },
  ];
}

function buildAppSheetRows(
  order: Types.Order,
  patient: Types.Patient,
  product: Types.Product,
  dose: Types.DoseOption,
  lines: AppSheetOrderLine[],
  pharmacyOrderId: string
) {
  const config = cfg();
  return lines.map((line, index) => ({
    ID: `${order.id}_${line.itemId}_${index + 1}`.slice(0, 80),
    "Client Order ID": order.id,
    "Pharmacy Order Id": pharmacyOrderId,
    lfProductID: line.itemId,
    lfProduct_ID: line.itemId,
    drugName: line.drugName,
    drugStrength: line.drugStrength,
    drugForm: line.drugForm,
    rxType: line.rxType,
    refills: "0",
    daysSupply: String(line.daysSupply),
    directions: line.directions,
    quantity: String(line.quantity),
    "Order Date": new Date().toISOString().slice(0, 10),
    item_json: JSON.stringify({
      source: "Mission WLW",
      pharmacy: config.pharmacyName,
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`.trim(),
      patientDob: patient.dateOfBirth,
      phone: patient.phone,
      email: patient.email,
      shippingAddress: formatPatientAddress(patient.shippingAddress ?? patient.address),
      product: product.name,
      dose: dose.label,
      line,
    }),
  }));
}

function formatAppSheetDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

function formatAppSheetDateTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${formatAppSheetDate(date)} ${hours}:${minutes}:${seconds}`;
}

function buildPackageName(product: Types.Product, dose: Types.DoseOption) {
  const productName = isTirzepatide(product) ? "TIRZEPATIDE" : product.name.toUpperCase();
  const strength = dose.strength || dose.label;
  return `1stChoiceRx ${productName} ${strength}`.trim();
}

function buildAppSheetClientRow(order: Types.Order, patient: Types.Patient, packageName: string) {
  const address = patient.shippingAddress ?? patient.address;
  return {
    ID: order.id,
    ClientId: order.patientId,
    Email: patient.email,
    FirstName: patient.firstName,
    LastName: patient.lastName,
    DateOfBirth: patient.dateOfBirth,
    Gender: patient.gender,
    Address: formatPatientAddress(address),
    StreetAddress: address.street1,
    City: address.city,
    State: address.state,
    PostalCode: address.zipCode,
    Phone: patient.phone,
    Accept: "Y",
    Package: packageName,
    "Selected Package": packageName,
    Client_Order_Status: "New",
    Date: formatAppSheetDate(),
  };
}

function buildAppSheetPharmacyOrderRow(order: Types.Order, patient: Types.Patient, packageName: string, pharmacyOrderId: string) {
  const now = new Date();
  return {
    ID: pharmacyOrderId,
    Client: order.id,
    Status: "New",
    Pharmacy: cfg().pharmacyName,
    Package: packageName,
    Note: `Mission WLW order ${order.id} for ${patient.firstName} ${patient.lastName}`.trim(),
    "Pharmacy Order ID": order.id,
    "Pharmacy Order Date": formatAppSheetDate(now),
    TS_PharmacyOrder: formatAppSheetDateTime(now),
    WebhookType: "Mission WLW",
    "Date Created": formatAppSheetDate(now),
  };
}

async function postAppSheetTableRows(table: string, rows: Record<string, unknown>[]) {
  const config = cfg();
  if (!config.appId || !config.apiKey || !table) {
    throw new Error("AppSheet is missing APPSHEET_ID, APPSHEET_API_KEY, or a table name");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/api/v2/apps/${encodeURIComponent(config.appId)}/tables/${encodeURIComponent(table)}/Action?applicationAccessKey=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Action: "Add",
      Properties: {
        Locale: "en-US",
        Timezone: config.timezone,
      },
      Rows: rows,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`AppSheet API ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function postAppSheetRows(rows: Record<string, unknown>[]) {
  return postAppSheetTableRows(cfg().orderTable, rows);
}

export const createPharmacyOrder = async (
  order: Types.Order,
  overrides?: { patient?: Types.Patient | null; product?: Types.Product | null }
): Promise<Types.PharmacyOrder> => {
  const patient = overrides?.patient ?? db.patientDb.getById(order.patientId);
  const product = overrides?.product ?? db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  if (!patient || !product || !dose) {
    throw new Error("Invalid order data - missing patient, product or dose");
  }

  requiredText(patient.firstName, "first name");
  requiredText(patient.lastName, "last name");
  requiredText(patient.dateOfBirth, "date of birth");
  requiredText(patient.phone, "phone");
  requiredText(patient.email, "email");
  requiredText(patient.shippingAddress?.street1 ?? patient.address?.street1, "shipping address");

  const config = cfg();
  const lines = buildAppSheetOrderLines(product, dose);
  const packageName = buildPackageName(product, dose);
  let appSheetOrderId = config.useMock ? `AS_MOCK_${generateId()}` : `AS_${order.id}`;
  const clientRow = buildAppSheetClientRow(order, patient, packageName);
  const pharmacyOrderRow = buildAppSheetPharmacyOrderRow(order, patient, packageName, appSheetOrderId);
  const rows = buildAppSheetRows(order, patient, product, dose, lines, appSheetOrderId);
  let lastError: string | undefined;

  if (!config.useMock) {
    try {
      await postAppSheetTableRows(config.clientTable, [clientRow]);
      const parentBody = await postAppSheetTableRows(config.pharmacyOrderTable, [pharmacyOrderRow]);
      await postAppSheetRows(rows);
      const returned = parentBody?.Rows?.[0]?.["Pharmacy Order ID"] ?? parentBody?.Rows?.[0]?.ID ?? appSheetOrderId;
      appSheetOrderId = String(returned || appSheetOrderId);
    } catch (error) {
      lastError = (error as Error).message;
      const failedOrder: Types.PharmacyOrder = {
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        lifeFileOrderId: appSheetOrderId,
        status: "error",
        payload: {} as Types.PharmacyOrder["payload"],
        submittedAt: new Date().toISOString(),
        lastError,
      };
      db.pharmacyOrderDb.create(failedOrder);
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "appsheet",
        action: "AppSheet pharmacy order submission failed",
        orderId: order.id,
        patientId: order.patientId,
        status: "error",
        details: { mock: false, table: config.pharmacyOrderTable, itemTable: config.orderTable },
        error: lastError,
      });
      throw error;
    }
  }

  const pharmacyOrder: Types.PharmacyOrder = {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    lifeFileOrderId: appSheetOrderId,
    status: "submitted",
    payload: {
      message: { id: generateId(), sentTime: new Date().toISOString() },
      order: {
        general: {
          referenceId: order.id,
          memo: `AppSheet ${product.name} ${dose.label}`,
        },
        prescriber: { npi: "", name: "Mission WLW Provider", phone: "" },
        practice: { npi: "", name: "Mission WLW", phone: "" },
        patient,
        shipping: patient.shippingAddress ?? patient.address,
        billing: patient.address,
        rxs: lines.map((line) => ({
          drugName: line.itemName,
          drugStrength: line.itemId,
          quantity: line.quantity,
          directions: line.directions,
          refills: 0,
          daysSupply: line.daysSupply,
          dateWritten: new Date().toISOString().slice(0, 10),
        })),
        appSheet: {
          clientTable: config.clientTable,
          pharmacyOrderTable: config.pharmacyOrderTable,
          table: config.orderTable,
          clientRow,
          pharmacyOrderRow,
          rows,
          mock: config.useMock,
        },
      } as Types.PharmacyOrder["payload"]["order"] & { appSheet: { table: string; rows: Record<string, unknown>[]; mock: boolean } },
    },
    submittedAt: new Date().toISOString(),
  };

  const saved = db.pharmacyOrderDb.create(pharmacyOrder);
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "appsheet",
    action: config.useMock
      ? "AppSheet pharmacy order created (mock)"
      : "AppSheet pharmacy order submitted",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      appSheetOrderId,
      pharmacyOrderTable: config.pharmacyOrderTable,
      table: config.orderTable,
      mock: config.useMock,
      itemIds: lines.map((line) => line.itemId),
    },
  });

  return saved;
};
