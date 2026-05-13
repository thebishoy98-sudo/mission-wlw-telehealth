/**
 * Mock QuickBooks Integration Service
 *
 * In production, replace with actual QuickBooks Online API:
 * const API_BASE_URL = "https://quickbooks.api.intuit.com/v2/company/{realm-id}"
 * And use OAuth 2.0 for authentication
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { generateId, formatCurrency } from "@/lib/utils";

const API_BASE_URL = "https://mock.quickbooks.api/v2/company"; // Placeholder - replace in production
const API_KEY = "qb_mock_access_token_12345"; // Placeholder - use OAuth in production

export const createCustomerRecord = (patient: Types.Patient): string => {
  // Create QB customer ID
  const customerId = `QB_CUST_${generateId()}`;

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "quickbooks",
    action: "Customer record created",
    patientId: patient.id,
    status: "success",
    details: {
      qbCustomerId: customerId,
      customerName: `${patient.firstName} ${patient.lastName}`,
      email: patient.email,
      phone: patient.phone,
      // In production:
      // apiEndpoint: `${API_BASE_URL}/customer`,
      // responseId: "req_qb_12345"
    },
  });

  return customerId;
};

export const createInvoice = (
  order: Types.Order,
  payment: Types.Payment
): string => {
  const patient = db.patientDb.getById(order.patientId);
  const product = db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  if (!patient || !product || !dose) {
    throw new Error("Invalid order data");
  }

  // Generate invoice number
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  const invoiceId = generateId();

  // Create QB record
  const qbRecord: Types.QuickBooksRecord = {
    id: invoiceId,
    orderId: order.id,
    paymentId: payment.id,
    customerRefId: `QB_CUST_${patient.id.substring(0, 8)}`,
    invoiceId: invoiceId,
    invoiceNumber: invoiceNumber,
    amount: payment.amount,
    taxAmount: 0,
    status: "invoiced",
    syncedAt: new Date().toISOString(),
  };

  db.quickbooksDb.create(qbRecord);

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "quickbooks",
    action: "Invoice created",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      invoiceId: invoiceId,
      invoiceNumber: invoiceNumber,
      customerName: `${patient.firstName} ${patient.lastName}`,
      amount: formatCurrency(payment.amount),
      items: [
        {
          name: product.name,
          description: dose.label,
          qty: dose.quantity,
          unitPrice: dose.price,
        },
      ],
      // In production:
      // apiEndpoint: `${API_BASE_URL}/invoice`,
      // qbInvoiceId: "12345" (from QB response)
    },
  });

  return invoiceId;
};

export const recordPayment = (invoiceId: string, amount: number): void => {
  // Find QB record
  const records = db.quickbooksDb.getAll();
  const record = records.find((r) => r.invoiceId === invoiceId);

  if (!record) {
    throw new Error("Invoice not found");
  }

  // Update record
  db.quickbooksDb.update(record.id, {
    status: "paid",
    syncedAt: new Date().toISOString(),
  });

  // Log the action
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "quickbooks",
    action: "Payment recorded",
    orderId: record.orderId,
    status: "success",
    details: {
      invoiceId: invoiceId,
      invoiceNumber: record.invoiceNumber,
      amount: formatCurrency(amount),
      paymentMethod: "Credit Card",
      // In production:
      // apiEndpoint: `${API_BASE_URL}/payment`,
      // qbPaymentId: "67890"
    },
  });
};

export const getAccountingMetrics = (): {
  totalRevenue: number;
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  averageOrderValue: number;
} => {
  const payments = db.paymentDb.getAll();
  const orders = db.orderDb.getAll();

  const totalRevenue = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  const paidOrders = payments.filter((p) => p.status === "completed").length;
  const pendingPayments = orders.filter((o) => o.paymentStatus === "pending").length;

  return {
    totalRevenue,
    totalOrders: orders.length,
    paidOrders,
    pendingPayments,
    averageOrderValue: paidOrders > 0 ? totalRevenue / paidOrders : 0,
  };
};

/**
 * PRODUCTION NOTES:
 *
 * Replace with actual implementation using QuickBooks Online API:
 *
 * export const createInvoice = async (order, payment) => {
 *   const payload = {
 *     Line: [{ ... }],
 *     CustomerRef: { ... },
 *     TxnDate: new Date().toISOString().split('T')[0],
 *     ...
 *   };
 *
 *   const response = await fetch(`${API_BASE_URL}/invoice`, {
 *     method: "POST",
 *     headers: {
 *       "Authorization": `Bearer ${API_KEY}`,
 *       "Content-Type": "application/json",
 *     },
 *     body: JSON.stringify(payload),
 *   });
 *
 *   return await response.json();
 * };
 */
