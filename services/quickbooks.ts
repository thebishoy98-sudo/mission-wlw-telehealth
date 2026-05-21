/**
 * QuickBooks Online Accounting Integration
 *
 * Creates customers, invoices, and records payments in QBO.
 * Set USE_REAL_QUICKBOOKS=true and QB_* credentials to enable real mode.
 */

import { serviceConfig } from "@/lib/service-config";
import * as dbServer from "@/lib/db.server";
import * as db from "@/lib/db";
import { generateId, formatCurrency } from "@/lib/utils";
import { getQBAccessToken } from "@/lib/qb-oauth";
import type { Order, Patient, Payment } from "@/types";

const QBO_BASE =
  process.env.QB_ACCOUNTING_BASE_URL ??
  (process.env.QB_REALM_ID === "9341457089968240"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company");

async function qboPost(path: string, body: unknown): Promise<any> {
  const realmId = process.env.QB_REALM_ID;
  if (!realmId) throw new Error("QB_REALM_ID not configured");

  const token = await getQBAccessToken();
  const res = await fetch(`${QBO_BASE}/${realmId}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBO API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function logIntegration(
  action: string,
  details: Record<string, unknown>,
  orderId?: string,
  patientId?: string,
  status: "success" | "error" = "success"
) {
  const entry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "quickbooks" as const,
    action,
    orderId,
    patientId,
    status,
    details,
  };
  db.integrationLogDb.create(entry);
  await dbServer.integrationLogDb.create(entry).catch(() => {});
}

export async function createCustomerRecord(patient: Patient): Promise<string> {
  const config = serviceConfig.quickbooks;

  if (!config.useMock) {
    const result = await qboPost("/customer", {
      DisplayName: `${patient.firstName} ${patient.lastName}`,
      PrimaryEmailAddr: { Address: patient.email },
      PrimaryPhone: { FreeFormNumber: patient.phone },
      BillAddr: {
        Line1: (patient.address as any)?.street ?? "",
        City: (patient.address as any)?.city ?? "",
        CountrySubDivisionCode: (patient.address as any)?.state ?? "",
        PostalCode: (patient.address as any)?.zip ?? "",
        Country: "US",
      },
    });
    const qbCustomerId = String(result.Customer?.Id ?? result.Id ?? generateId());
    await logIntegration(
      "QB customer created",
      { qbCustomerId, email: patient.email },
      undefined,
      patient.id
    );
    return qbCustomerId;
  }

  const customerId = `QB_CUST_${generateId()}`;
  await logIntegration(
    "QB mock customer created",
    { customerId, email: patient.email, mode: "mock" },
    undefined,
    patient.id
  );
  return customerId;
}

export async function createInvoice(
  order: Order,
  payment: Payment,
  overrides?: { patient?: Patient | null; product?: any | null; qbCustomerId?: string }
): Promise<string> {
  const config = serviceConfig.quickbooks;

  const patient =
    overrides?.patient ??
    (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
    db.patientDb.getById(order.patientId);
  const product =
    overrides?.product ??
    (await dbServer.productDb.getById(order.productId).catch(() => null)) ??
    db.productDb.getById(order.productId);
  const dose = product?.doses.find((d) => d.id === order.doseId);

  if (!patient || !product || !dose) throw new Error("Invalid order data for QB invoice");

  const amountDollars = payment.amount; // amount stored in dollars

  if (!config.useMock) {
    const result = await qboPost("/invoice", {
      Line: [
        {
          Amount: amountDollars,
          DetailType: "SalesItemLineDetail",
          Description: `${product.name} - ${dose.label}`,
          SalesItemLineDetail: {
            Qty: dose.quantity,
            UnitPrice: dose.price,
          },
        },
      ],
      CustomerRef: {
        value: overrides?.qbCustomerId ?? patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
      },
      TxnDate: new Date().toISOString().split("T")[0],
    });
    const invoiceId = String(result.Invoice?.Id ?? result.Id ?? generateId());
    await logIntegration(
      "QB invoice created",
      { invoiceId, amount: formatCurrency(payment.amount), product: product.name },
      order.id,
      order.patientId
    );
    return invoiceId;
  }

  const invoiceId = `QB_INV_${generateId()}`;
  await logIntegration(
    "QB mock invoice created",
    { invoiceId, amount: formatCurrency(payment.amount), product: product.name, mode: "mock" },
    order.id,
    order.patientId
  );
  return invoiceId;
}

export async function recordPayment(invoiceId: string, amount: number): Promise<void> {
  const config = serviceConfig.quickbooks;

  if (!config.useMock) {
    await qboPost("/payment", {
      TotalAmt: amount / 100,
      Line: [
        {
          Amount: amount / 100,
          LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }],
        },
      ],
    });
    await logIntegration("QB payment recorded", {
      invoiceId,
      amount: formatCurrency(amount),
    });
    return;
  }

  await logIntegration("QB mock payment recorded", {
    invoiceId,
    amount: formatCurrency(amount),
    mode: "mock",
  });
}

export async function getAccountingMetrics(): Promise<{
  totalRevenue: number;
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  averageOrderValue: number;
}> {
  const payments = db.paymentDb.getAll();
  const orders = db.orderDb.getAll();
  const totalRevenue = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amount, 0);
  const paidOrders = payments.filter((p) => p.status === "completed").length;
  const pendingPayments = orders.filter((o) => o.paymentStatus === "pending").length;
  return {
    totalRevenue,
    totalOrders: orders.length,
    paidOrders,
    pendingPayments,
    averageOrderValue: paidOrders > 0 ? totalRevenue / paidOrders : 0,
  };
}
