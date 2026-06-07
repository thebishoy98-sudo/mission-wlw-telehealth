/**
 * Life File Pharmacy Integration Service
 *
 * Spec: Life File API v1.240910.0
 *
 * Auth    : HTTP Basic (LIFEFILE_API_USERNAME / LIFEFILE_API_PASSWORD)
 * Headers : X-Vendor-ID, X-Location-ID, X-API-Network-ID (all int32)
 *
 * Endpoints used:
 *   POST /order                          — create order
 *   PUT  /order/{orderId}/status         — update status
 *   PUT  /order/{orderId}/shipping       — update shipping address/service
 *
 * Set USE_REAL_LIFEFILE=true in env to switch from mock to live calls.
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import { generateId } from "@/lib/utils";

// ── Sandbox product ID map (slug / partial name → LF lfProductID) ─────────────
// Only tirzepatide uses a fixed lfProductID because its sandbox entry is specific.
// Other GLP-1 medications (retatrutide, semaglutide) rely on drug-name lookup in
// the LF catalog — do NOT add them here unless you have the correct LF product ID.
const LF_PRODUCT_MAP: Record<string, number> = {
  tirzepatide: 305492221,     // Acetaminophen 500mg — closest sandbox match
  "benzocaine-lidocaine-tetracaine": 305157968,
  "baclofen-dexamethasone-flurbiprofen": 305492218,
  acyclovir: 305492222,
  acetaminophen: 305492221,
  acarbose: 305492220,
};

// 1stChoiceRx sandbox service id.
const DEFAULT_SHIPPING_SERVICE_ID = 6230;

// Sandbox order status codes
export const LF_STATUS_CODES = {
  STATUS_A: "b29c4",  // 11472 Sandbox Status A
  STATUS_B: "b28b9",  // 11472 Sandbox Status B
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cfg() {
  return serviceConfig.lifefile;
}

function basicAuth(username: string, password: string) {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

function mapGender(gender: string): "m" | "f" | "u" {
  if (gender === "male") return "m";
  if (gender === "female") return "f";
  return "u";
}

function formatPhone(phone: string): string {
  // Life File format: (987) 654-3210 - try to reformat if digits-only input
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return clip(phone, 16);
}

function clip(value: unknown, max: number, fallback = ""): string {
  return String(value ?? fallback).slice(0, max);
}

function requiredText(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    throw new Error(`Invalid order data - missing patient ${label}`);
  }
  return text;
}

function formatLifeFileDateOfBirth(value: unknown): string {
  const text = requiredText(value, "date of birth");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsed.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  throw new Error("Invalid order data - patient date of birth must be YYYY-MM-DD");
}

function getLfProductId(product: Types.Product): number {
  const slug = product.slug?.toLowerCase() ?? "";
  if (LF_PRODUCT_MAP[slug]) return LF_PRODUCT_MAP[slug];
  const name = String(product.name ?? "").toLowerCase();
  for (const [key, id] of Object.entries(LF_PRODUCT_MAP)) {
    if (name.includes(key)) return id;
  }
  return 305492221; // default sandbox fallback
}

type LfRxPayload = {
  rxType: "new";
  drugName: string;
  drugStrength: string;
  drugForm: string;
  lfProductID?: number;
  quantity: string;
  quantityUnits: string;
  directions: string;
  refills: number;
  dateWritten: string;
  daysSupply: number;
  scheduleCode: "L" | "O";
};

function isTirzepatide(product: Types.Product): boolean {
  const slug = product.slug?.toLowerCase() ?? "";
  return slug.includes("tirzepatide") || product.name.toLowerCase().includes("tirzepatide");
}

function parseWeeklyDoseMg(dose: Types.DoseOption): number {
  if (typeof dose.weeklyDoseMg === "number" && dose.weeklyDoseMg > 0) return dose.weeklyDoseMg;
  const match = `${dose.strength} ${dose.label}`.match(/(\d+(?:\.\d+)?)\s*mg/i);
  return match ? Number(match[1]) : 0;
}

function calculateTirzepatideVialQuantity(dose: Types.DoseOption): number {
  if (typeof dose.quantity === "number" && dose.quantity > 0) return dose.quantity;
  const weeklyMg = parseWeeklyDoseMg(dose);
  if (!weeklyMg || Number.isNaN(weeklyMg)) return 1;

  const monthlyMg = weeklyMg * 4;
  const mgPerMl = 20;
  const vialMl = 2;
  return Math.max(1, Math.ceil(monthlyMg / (mgPerMl * vialMl)));
}

function buildPharmacyRxs(
  product: Types.Product,
  dose: Types.DoseOption,
  lfProductId: number,
  dateWritten: string
): LfRxPayload[] {
  if (isTirzepatide(product)) {
    const weeklyMg = parseWeeklyDoseMg(dose);
    const weeklyDoseText = weeklyMg ? `${weeklyMg}mg` : dose.strength;
    const directions = dose.prescriptionLabel || `Inject ${weeklyDoseText} subcutaneously once weekly as directed by prescriber`;
    const daysSupply = (dose.durationWeeks && dose.durationWeeks > 0 ? dose.durationWeeks : 4) * 7;
    return [
      {
        rxType: "new",
        drugName: "TIRZEPATIDE/PYRIDOXINE",
        drugStrength: "20MG/25MG/ML (2 ML)",
        drugForm: "INJECTABLE",
        lfProductID: lfProductId,
        quantity: String(calculateTirzepatideVialQuantity(dose)),
        quantityUnits: "each",
        directions,
        refills: 0,
        dateWritten,
        daysSupply,
        scheduleCode: "L",
      },
      {
        rxType: "new",
        drugName: "ALCOHOL SWABS",
        drugStrength: "EA",
        drugForm: "SUPPLY",
        quantity: "10",
        quantityUnits: "each",
        directions: "Use as directed with injection",
        refills: 0,
        dateWritten,
        daysSupply,
        scheduleCode: "O",
      },
      {
        rxType: "new",
        drugName: "COMFORT EZ 31GX5/16\" 1ML SYRINGE",
        drugStrength: "EA",
        drugForm: "SYRINGE",
        quantity: "10",
        quantityUnits: "each",
        directions: "Use as directed with injection",
        refills: 0,
        dateWritten,
        daysSupply,
        scheduleCode: "O",
      },
    ];
  }

  // For non-tirzepatide products, omit lfProductID so LifeFile resolves
  // by drug name/strength — avoids tirzepatide sandbox ID being sent for
  // retatrutide/semaglutide which would cause a catalog mismatch rejection.
  const daysSupply =
    typeof dose.durationWeeks === "number" && dose.durationWeeks > 0
      ? dose.durationWeeks * 7
      : 56; // default to 8-week supply
  const vialQty = typeof dose.quantity === "number" && dose.quantity > 0 ? dose.quantity : 1;
  // Supply qty: 10 syringes + 10 swabs per vial (1-1 ratio same as tirzepatide)
  const supplyQty = String(vialQty * 10);
  return [
    {
      rxType: "new",
      drugName: (product.name ?? "").toUpperCase().slice(0, 254),
      drugStrength: (dose.strength ?? dose.label ?? "").slice(0, 254),
      drugForm: "INJECTABLE",
      quantity: String(vialQty),
      quantityUnits: "each",
      directions: dose.prescriptionLabel || `Inject as directed by prescriber. Use ${dose.strength ?? "prescribed dose"} once weekly subcutaneously.`,
      refills: 0,
      dateWritten,
      daysSupply,
      scheduleCode: "L",
    },
    {
      rxType: "new",
      drugName: "ALCOHOL SWABS",
      drugStrength: "EA",
      drugForm: "SUPPLY",
      quantity: supplyQty,
      quantityUnits: "each",
      directions: "Use as directed with injection",
      refills: 0,
      dateWritten,
      daysSupply,
      scheduleCode: "O",
    },
    {
      rxType: "new",
      drugName: "COMFORT EZ 31GX5/16\" 1ML SYRINGE",
      drugStrength: "EA",
      drugForm: "SYRINGE",
      quantity: supplyQty,
      quantityUnits: "each",
      directions: "Use as directed with injection",
      refills: 0,
      dateWritten,
      daysSupply,
      scheduleCode: "O",
    },
  ];
}

// Life File response envelope: { type: "success"|"error", message: string, data: {} }
interface LfResponse {
  type: "success" | "error";
  message: string;
  data: Record<string, unknown>;
}

async function lfFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ httpOk: boolean; httpStatus: number; body: LfResponse }> {
  const c = cfg();
  const url = path === "/order" && c.orderEndpoint ? c.orderEndpoint : `${c.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: basicAuth(c.username, c.password),
    "X-Vendor-ID": c.vendorId,
    "X-Location-ID": c.locationId,
    "X-API-Network-ID": c.apiNetworkId,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });
  let body: LfResponse = { type: "error", message: "empty response", data: {} };
  try {
    body = await res.json() as LfResponse;
  } catch { /* leave default */ }

  return { httpOk: res.ok, httpStatus: res.status, body };
}

// ── createPharmacyOrder ───────────────────────────────────────────────────────

export const createPharmacyOrder = async (
  order: Types.Order,
  overrides?: { patient?: Types.Patient | null; product?: Types.Product | null }
): Promise<Types.PharmacyOrder> => {
  const patient =
    overrides?.patient ??
    db.patientDb.getById(order.patientId);
  const product =
    overrides?.product ??
    db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  if (!patient || !product || !dose) {
    throw new Error("Invalid order data — missing patient, product or dose");
  }

  const c = cfg();
  const lfProductId = getLfProductId(product);
  const patientFirstName = requiredText(patient.firstName, "first name");
  const patientLastName = requiredText(patient.lastName, "last name");
  const patientDob = formatLifeFileDateOfBirth(patient.dateOfBirth);
  const patientPhone = requiredText(patient.phone, "phone");
  const patientEmail = requiredText(patient.email, "email");
  const patientAddress = {
    street1: requiredText(patient.address?.street1, "address"),
    street2: patient.address?.street2,
    city: requiredText(patient.address?.city, "city"),
    state: requiredText(patient.address?.state, "state"),
    zipCode: requiredText(patient.address?.zipCode, "zip code"),
    country: patient.address?.country ?? "US",
  };
  const ship = {
    street1: requiredText(patient.shippingAddress?.street1 ?? patient.address?.street1, "shipping address"),
    street2: patient.shippingAddress?.street2 ?? patient.address?.street2,
    city: requiredText(patient.shippingAddress?.city ?? patient.address?.city, "shipping city"),
    state: requiredText(patient.shippingAddress?.state ?? patient.address?.state, "shipping state"),
    zipCode: requiredText(patient.shippingAddress?.zipCode ?? patient.address?.zipCode, "shipping zip code"),
    country: patient.shippingAddress?.country ?? patient.address?.country ?? "US",
  };
  const dateWritten = new Date().toISOString().split("T")[0];
  const rxs = buildPharmacyRxs(product, dose, lfProductId, dateWritten);

  // Build memo from first Rx line: "DRUGNAME DRUGFORM STRENGTH (QTY: X each)"
  const firstRx = rxs[0];
  const memoText = firstRx
    ? `${firstRx.drugName} ${firstRx.drugForm} ${firstRx.drugStrength} (QTY: ${firstRx.quantity} ${firstRx.quantityUnits})`
    : `${product.name ?? ""} ${dose.label ?? ""}`.trim();

  // Build Life File POST /order payload per spec
  const payload = {
    message: {
      id: Math.floor(Math.random() * 2_000_000_000), // integer per spec
      sentTime: new Date().toISOString(),
    },
    order: {
      general: {
        memo: clip(memoText, 120),
        referenceId: clip(order.id, 200),
      },
      prescriber: {
        npi: c.prescriberNpi || "1234567890",
        lastName: c.prescriberLastName || "Provider",
        firstName: c.prescriberFirstName || "Sample",
        phone: c.prescriberPhone || "(555) 000-0001",
        ...(c.prescriberLicenseState ? { licenseState: c.prescriberLicenseState } : {}),
        ...(c.prescriberLicenseNumber ? { licenseNumber: c.prescriberLicenseNumber } : {}),
        ...(c.prescriberEmail ? { email: c.prescriberEmail } : {}),
      },
      practice: {
        id: parseInt(c.practiceId, 10),
      },
      patient: {
        firstName: clip(patientFirstName, 30),
        lastName: clip(patientLastName, 30),
        gender: mapGender(patient.gender),
        dateOfBirth: patientDob,
        address1: clip(patientAddress.street1, 60),
        ...(patientAddress.street2 ? { address2: clip(patientAddress.street2, 60) } : {}),
        city: clip(patientAddress.city, 30),
        state: clip(patientAddress.state, 2),
        zip: clip(patientAddress.zipCode, 10),
        country: clip(patientAddress.country, 2, "US"),
        phoneMobile: formatPhone(patientPhone),
        email: clip(patientEmail, 100),
      },
      shipping: {
        recipientType: "patient" as const,
        recipientLastName: clip(patientLastName, 30),
        recipientFirstName: clip(patientFirstName, 30),
        recipientPhone: formatPhone(patientPhone),
        recipientEmail: clip(patientEmail, 100),
        addressLine1: clip(ship.street1, 60),
        ...(ship.street2 ? { addressLine2: clip(ship.street2, 60) } : {}),
        city: clip(ship.city, 100),
        state: clip(ship.state, 2),
        zipCode: clip(ship.zipCode, 10),
        country: clip(ship.country, 2, "US"),
        service: c.shippingServiceId || DEFAULT_SHIPPING_SERVICE_ID,
      },
      billing: {
        payorType: "pat" as const,
      },
      rxs,
    },
  };

  let lifeFileOrderId = `LF_${generateId()}`;
  let status: Types.PharmacyStatus = "submitted";
  let lastError: string | undefined;

  if (!c.useMock) {
    try {
      const { httpOk, httpStatus, body } = await lfFetch("/order", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!httpOk || body.type === "error") {
        throw new Error(
          `Life File API ${httpStatus}: ${body.message || JSON.stringify(body)}${body.data ? ` ${JSON.stringify(body.data)}` : ""}`
        );
      }

      // Life File may return the new order ID in data
      const returned = String(
        body.data?.orderId ?? body.data?.id ?? body.data?.order_id ?? ""
      );
      if (returned) lifeFileOrderId = returned;
    } catch (err) {
      status = "error";
      lastError = (err as Error).message;
      // Save the failed record then re-throw so callers can report the error
      const failedOrder: Types.PharmacyOrder = {
        id: generateId(),
        orderId: order.id,
        patientId: order.patientId,
        lifeFileOrderId,
        status,
        payload: {} as Types.PharmacyOrder["payload"],
        submittedAt: new Date().toISOString(),
        lastError,
      };
      db.pharmacyOrderDb.create(failedOrder);
      db.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "lifefile",
        action: "Pharmacy order submission failed",
        orderId: order.id,
        patientId: order.patientId,
        status: "error",
        details: { lifeFileOrderId, mock: false },
        error: lastError,
      });
      throw err;
    }
  }

  const pharmacyOrder: Types.PharmacyOrder = {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    lifeFileOrderId,
    status,
    payload: {
      message: { id: generateId(), sentTime: new Date().toISOString() },
      order: {
        general: {
          referenceId: order.id,
          memo: clip(memoText, 120),
        },
        prescriber: {
          npi: payload.order.prescriber.npi,
          name: `${payload.order.prescriber.firstName} ${payload.order.prescriber.lastName}`,
          phone: payload.order.prescriber.phone,
        },
        practice: {
          npi: String(payload.order.practice.id),
          name: "11472 SANDBOX PRACTICE - 251",
          phone: "",
        },
        patient,
        shipping: ship,
        billing: patient.address,
        rxs: payload.order.rxs.map((rx) => ({
          drugName: rx.drugName,
          drugStrength: rx.drugStrength,
          drugForm: rx.drugForm,
          quantity: parseInt(rx.quantity, 10),
          quantityUnits: rx.quantityUnits,
          directions: rx.directions,
          refills: rx.refills,
          daysSupply: rx.daysSupply,
          dateWritten: rx.dateWritten,
        })),
      },
    },
    submittedAt: new Date().toISOString(),
    ...(lastError ? { lastError } : {}),
  };

  const saved = db.pharmacyOrderDb.create(pharmacyOrder);

  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: c.useMock
      ? "Pharmacy order created (mock)"
      : "Pharmacy order submitted to Life File",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      lifeFileOrderId,
      lfProductId,
      mock: c.useMock,
      patient: `${patient.firstName} ${patient.lastName}`,
    },
    ...(lastError ? { error: lastError } : {}),
  });

  return saved;
};

// ── updateOrderStatus ─────────────────────────────────────────────────────────
// Called inbound (e.g. from webhook) or by admin to push a status update.
// PUT /order/{orderId}/status  — body: { status: string }

export const updateOrderStatus = async (
  orderId: string,
  status: Types.PharmacyStatus
): Promise<Types.PharmacyOrder | null> => {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);
  if (!pharmacyOrder) return null;

  const c = cfg();
  const lfId = pharmacyOrder.lifeFileOrderId;

  if (!c.useMock && lfId && !lfId.startsWith("LF_")) {
    // Only call API if we have a real numeric Life File order ID
    try {
      const { body } = await lfFetch(`/order/${lfId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (body.type === "error") {
        // Log but don't fail — status update is best-effort from our side
      }
    } catch { /* log silently */ }
  }

  const updated = db.pharmacyOrderDb.update(pharmacyOrder.id, { status });
  db.orderDb.update(orderId, { pharmacyStatus: status });

  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: "Pharmacy order status updated",
    orderId,
    patientId: pharmacyOrder.patientId,
    status: "success",
    details: { lifeFileOrderId: lfId, newStatus: status, mock: c.useMock },
  });

  return updated;
};

// ── addTrackingNumber ─────────────────────────────────────────────────────────
// Called from the inbound Life File webhook when a shipment is created.
// Tracking is pushed TO us — we don't send it to Life File.

export const addTrackingNumber = async (
  orderId: string,
  trackingNumber: string
): Promise<Types.PharmacyOrder | null> => {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);
  if (!pharmacyOrder) return null;

  const updated = db.pharmacyOrderDb.update(pharmacyOrder.id, {
    trackingNumber,
    status: "shipped",
    shippedAt: new Date().toISOString(),
  });

  db.orderDb.update(orderId, { pharmacyStatus: "shipped" });

  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: "Tracking number recorded",
    orderId,
    patientId: pharmacyOrder.patientId,
    status: "success",
    details: { lifeFileOrderId: pharmacyOrder.lifeFileOrderId, trackingNumber },
  });

  return updated;
};

// ── updateShipping ────────────────────────────────────────────────────────────
// PUT /order/{orderId}/shipping — update recipient/address after order is placed.

export const updateShipping = async (
  orderId: string,
  address: Types.Address,
  patient: Pick<Types.Patient, "firstName" | "lastName" | "phone" | "email">
): Promise<boolean> => {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);
  if (!pharmacyOrder) return false;

  const c = cfg();
  const lfId = pharmacyOrder.lifeFileOrderId;

  if (!c.useMock && lfId && !lfId.startsWith("LF_")) {
    try {
      const { body } = await lfFetch(`/order/${lfId}/shipping`, {
        method: "PUT",
        body: JSON.stringify({
          shipping: {
            recipientType: "patient",
            recipientLastName: clip(patient.lastName, 30),
            recipientFirstName: clip(patient.firstName, 30),
            recipientPhone: formatPhone(patient.phone),
            recipientEmail: clip(patient.email, 100),
            addressLine1: clip(address.street1, 60),
            ...(address.street2 ? { addressLine2: clip(address.street2, 60) } : {}),
            city: clip(address.city, 100),
            state: clip(address.state, 2),
            zipCode: clip(address.zipCode, 10),
            country: clip(address.country, 2, "US"),
            service: DEFAULT_SHIPPING_SERVICE_ID,
          },
        }),
      });
      return body.type === "success";
    } catch {
      return false;
    }
  }

  return true; // mock — always succeeds
};

// ── getOrderStatus ────────────────────────────────────────────────────────────
// Note: Life File API has no GET /order endpoint per spec.
// Status is tracked locally and updated via inbound webhooks.

export const getOrderStatus = async (
  lifeFileOrderId: string
): Promise<{ status: Types.PharmacyStatus; details: Record<string, unknown> }> => {
  const orders = db.pharmacyOrderDb.getAll();
  const order = orders.find((o) => o.lifeFileOrderId === lifeFileOrderId);

  if (!order) {
    return { status: "draft", details: { error: "Order not found" } };
  }

  return {
    status: order.status,
    details: {
      lifeFileOrderId: order.lifeFileOrderId,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
    },
  };
};
