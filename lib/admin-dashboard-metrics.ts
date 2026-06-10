import type { Order, Patient, Payment } from "@/types";

export function isCompletedPayment(payment: Payment | null | undefined): payment is Payment {
  return payment?.status === "completed";
}

export function paymentAmount(payment: Pick<Payment, "amount">) {
  const amount = Number(payment.amount);
  return Number.isFinite(amount) ? amount : 0;
}

export function completedPaymentByOrder(payments: Payment[]) {
  return new Map(
    payments
      .filter(isCompletedPayment)
      .map((payment) => [payment.orderId, payment] as [string, Payment])
  );
}

export function filterPaidDashboardOrders<T extends Pick<Order, "id">>(
  orders: T[],
  payments: Payment[]
) {
  const paidOrderIds = new Set(payments.filter(isCompletedPayment).map((payment) => payment.orderId));
  return orders.filter((order) => paidOrderIds.has(order.id));
}

export function sumCompletedPaymentRevenue(payments: Payment[]) {
  return payments
    .filter(isCompletedPayment)
    .reduce((sum, payment) => sum + paymentAmount(payment), 0);
}

export function buildAdminDashboardStats({
  orders,
  patients,
  payments,
}: {
  orders: Order[];
  patients: Patient[];
  payments: Payment[];
}) {
  const paidOrders = filterPaidDashboardOrders(orders, payments);
  const paidPatientIds = new Set(paidOrders.map((order) => order.patientId));
  const totalRevenue = sumCompletedPaymentRevenue(payments);
  const totalOrders = paidOrders.length;

  return {
    totalOrders,
    totalPatients: patients.filter((patient) => paidPatientIds.has(patient.id)).length,
    totalRevenue,
    paidOrders: totalOrders,
    pendingPayments: orders.filter((order) => order.paymentStatus === "pending").length,
    fulfilled: paidOrders.filter((order) => order.status === "delivered" || order.status === "fulfilled").length,
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  };
}
