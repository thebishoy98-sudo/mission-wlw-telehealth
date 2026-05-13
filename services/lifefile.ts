/**
 * Mock Life File Pharmacy Integration Service
 *
 * In production, replace with actual Life File API:
 * const API_BASE_URL = "https://api.lifefilehealth.com/v1"
 * Use X-Vendor-ID, X-Location-ID, X-API-Network-ID headers
 * Use Basic Auth with actual credentials
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId, formatDate } from "@/lib/utils";

const API_BASE_URL = "https://mock.lifefile.api/v1"; // Placeholder - replace in production
const VENDOR_ID = "VENDOR_DEMO_12345"; // Placeholder - replace with real vendor ID
const LOCATION_ID = "LOC_DEMO_67890"; // Placeholder - replace with real location ID
const API_NETWORK_ID = "NET_DEMO_11111"; // Placeholder - replace with real network ID
const API_USERNAME = "demo_user"; // Placeholder - replace with real credentials
const API_PASSWORD = "demo_password"; // Placeholder - replace with real credentials

export const createPharmacyOrder = (order: Types.Order): Types.PharmacyOrder => {
  const patient = db.patientDb.getById(order.patientId);
  const product = db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  if (!patient || !product || !dose) {
    throw new Error("Invalid order data");
  }

  // Build Life File style payload
  const lifeFilePayload: Types.PharmacyOrder["payload"] = {
    message: {
      id: generateId(),
      sentTime: new Date().toISOString(),
    },
    order: {
      general: {
        referenceId: order.id,
        memo: `${product.name} ${dose.label}`,
      },
      prescriber: {
        npi: "1234567890",
        name: "Dr. Sample Provider",
        phone: "555-000-0001",
      },
      practice: {
        npi: "0987654321",
        name: "Sample Medical Practice",
        phone: "555-000-0002",
      },
      patient: patient,
      shipping: patient.shippingAddress,
      billing: patient.address,
      rxs: [
        {
          drugName: product.name,
          drugStrength: dose.strength,
          quantity: dose.quantity,
          directions: "Inject once weekly",
          refills: 11,
          daysSupply: 84,
          dateWritten: new Date().toISOString(),
        },
      ],
    },
  };

  // Create pharmacy order record
  const pharmacyOrder: Types.PharmacyOrder = {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    lifeFileOrderId: `LF_${generateId()}`,
    status: "submitted",
    payload: lifeFilePayload,
    submittedAt: new Date().toISOString(),
  };

  const saved = db.pharmacyOrderDb.create(pharmacyOrder);

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: "Pharmacy order created",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      lifeFileOrderId: saved.lifeFileOrderId,
      rxs: lifeFilePayload.order.rxs.map((rx) => ({
        drugName: rx.drugName,
        quantity: rx.quantity,
      })),
      patient: `${patient.firstName} ${patient.lastName}`,
      // In production:
      // apiEndpoint: `${API_BASE_URL}/order`,
      // headers: {
      //   "X-Vendor-ID": VENDOR_ID,
      //   "X-Location-ID": LOCATION_ID,
      //   "X-API-Network-ID": API_NETWORK_ID,
      //   "Authorization": `Basic ${btoa(API_USERNAME + ':' + API_PASSWORD)}`
      // },
      // responseId: "resp_lf_12345"
    },
  });

  return saved;
};

export const updateOrderStatus = (
  orderId: string,
  status: Types.PharmacyStatus
): Types.PharmacyOrder | null => {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);

  if (!pharmacyOrder) {
    return null;
  }

  // Update status
  const updated = db.pharmacyOrderDb.update(pharmacyOrder.id, {
    status: status,
  });

  // Update main order too
  db.orderDb.update(orderId, { pharmacyStatus: status });

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: "Pharmacy order status updated",
    orderId: orderId,
    patientId: pharmacyOrder.patientId,
    status: "success",
    details: {
      lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
      newStatus: status,
      // In production:
      // apiEndpoint: `${API_BASE_URL}/order/${pharmacyOrder.lifeFileOrderId}/status`,
      // method: "PUT"
    },
  });

  return updated;
};

export const addTrackingNumber = (
  orderId: string,
  trackingNumber: string
): Types.PharmacyOrder | null => {
  const pharmacyOrder = db.pharmacyOrderDb.getByOrder(orderId);

  if (!pharmacyOrder) {
    return null;
  }

  // Update with tracking
  const updated = db.pharmacyOrderDb.update(pharmacyOrder.id, {
    trackingNumber: trackingNumber,
    status: "shipped",
    shippedAt: new Date().toISOString(),
  });

  // Update main order
  db.orderDb.update(orderId, { pharmacyStatus: "shipped" });

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "lifefile",
    action: "Tracking number added",
    orderId: orderId,
    patientId: pharmacyOrder.patientId,
    status: "success",
    details: {
      lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
      trackingNumber: trackingNumber,
      carrier: "UPS",
      // In production:
      // apiEndpoint: `${API_BASE_URL}/order/${pharmacyOrder.lifeFileOrderId}/shipping`,
      // method: "PUT"
    },
  });

  return updated;
};

export const getOrderStatus = (
  lifeFileOrderId: string
): { status: Types.PharmacyStatus; details: Record<string, any> } => {
  const orders = db.pharmacyOrderDb.getAll();
  const order = orders.find((o) => o.lifeFileOrderId === lifeFileOrderId);

  if (!order) {
    return {
      status: "draft",
      details: { error: "Order not found" },
    };
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

/**
 * PRODUCTION NOTES:
 *
 * Replace with actual Life File API implementation:
 *
 * export const createPharmacyOrder = async (order: Types.Order) => {
 *   const response = await fetch(`${API_BASE_URL}/order`, {
 *     method: "POST",
 *     headers: {
 *       "X-Vendor-ID": VENDOR_ID,
 *       "X-Location-ID": LOCATION_ID,
 *       "X-API-Network-ID": API_NETWORK_ID,
 *       "Authorization": `Basic ${btoa(API_USERNAME + ':' + API_PASSWORD)}`,
 *       "Content-Type": "application/json",
 *     },
 *     body: JSON.stringify(lifeFilePayload),
 *   });
 *
 *   if (!response.ok) {
 *     throw new Error(`Life File API error: ${response.statusText}`);
 *   }
 *
 *   const result = await response.json();
 *   // Save result with real Life File order ID...
 *   return result;
 * };
 *
 * export const updateOrderStatus = async (lifeFileOrderId, status) => {
 *   const response = await fetch(
 *     `${API_BASE_URL}/order/${lifeFileOrderId}/status`,
 *     {
 *       method: "PUT",
 *       headers: { ... },
 *       body: JSON.stringify({ status }),
 *     }
 *   );
 *
 *   return await response.json();
 * };
 */
