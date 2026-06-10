import type { Order, Patient, Payment } from "@/types";
import { canonicalProducts } from "@/data/products";

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

export function buildAdminAnalytics({
  orders,
  payments,
  now = new Date(),
}: {
  orders: Order[];
  payments: Payment[];
  now?: Date;
}) {
  const activeOrders = orders.filter((order) => order.status !== "draft" && order.status !== "cancelled");
  const paidOrders = filterPaidDashboardOrders(activeOrders, payments);
  const paymentByOrder = completedPaymentByOrder(payments);
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const uniquePatients = (items: typeof paidOrders) => new Set(items.map((order) => order.patientId)).size;

  const totals = {
    allTime: uniquePatients(paidOrders),
    week7: uniquePatients(paidOrders.filter((order) => new Date(order.createdAt).getTime() >= now.getTime() - ms7d)),
    month30: uniquePatients(paidOrders.filter((order) => new Date(order.createdAt).getTime() >= now.getTime() - ms30d)),
    ytd: uniquePatients(paidOrders.filter((order) => new Date(order.createdAt) >= yearStart)),
  };

  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthlyMap: Record<string, { orders: number; patients: Set<string>; revenue: number }> = {};
  for (const key of monthKeys) {
    monthlyMap[key] = { orders: 0, patients: new Set(), revenue: 0 };
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - ms7d);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  function periodStats(items: typeof paidOrders) {
    const revenue = items.reduce((sum, order) => {
      const payment = paymentByOrder.get(order.id);
      return sum + (isCompletedPayment(payment) ? paymentAmount(payment) : 0);
    }, 0);
    return { orders: items.length, revenue };
  }

  const orderPeriods = {
    today: periodStats(paidOrders.filter((order) => new Date(order.createdAt) >= todayStart)),
    thisWeek: periodStats(paidOrders.filter((order) => new Date(order.createdAt) >= weekStart)),
    thisMonth: periodStats(paidOrders.filter((order) => new Date(order.createdAt) >= monthStart)),
    thisYear: periodStats(paidOrders.filter((order) => new Date(order.createdAt) >= yearStart)),
  };

  for (const order of paidOrders) {
    const date = new Date(order.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = monthlyMap[key];
    if (!month) continue;
    month.orders++;
    month.patients.add(order.patientId);
    const payment = paymentByOrder.get(order.id);
    if (isCompletedPayment(payment)) month.revenue += paymentAmount(payment);
  }

  const productMix: Record<string, { count: number; name: string; revenue: number }> = {};
  for (const order of paidOrders) {
    const id = order.productId ?? "unknown";
    if (!productMix[id]) {
      const canonical = canonicalProducts.find((product) => product.id === id);
      productMix[id] = { count: 0, name: canonical?.name ?? id, revenue: 0 };
    }
    productMix[id].count++;
    const payment = paymentByOrder.get(order.id);
    if (isCompletedPayment(payment)) productMix[id].revenue += paymentAmount(payment);
  }

  return {
    totals,
    orderPeriods,
    monthly: monthKeys.map((key) => {
      const [year, month] = key.split("-");
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      return {
        key,
        label,
        orders: monthlyMap[key].orders,
        patients: monthlyMap[key].patients.size,
        revenue: monthlyMap[key].revenue,
      };
    }),
    productMix: Object.values(productMix).sort((a, b) => b.count - a.count),
  };
}
