import {
  buildAdminAnalytics,
  buildAdminDashboardStats,
  filterPaidDashboardOrders,
  sumCompletedPaymentRevenue,
} from "@/lib/admin-dashboard-metrics";
import type { Order, Payment, Patient } from "@/types";

const order = (id: string, patientId: string, paymentStatus: Order["paymentStatus"]): Order => ({
  id,
  patientId,
  productId: "product_tirzepatide",
  doseId: "tirzepatide_20mg_8_week",
  status: paymentStatus === "failed" ? "cancelled" : "processing",
  paymentStatus,
  pharmacyStatus: "draft",
  practiceQStatus: "pending",
  quickbooksStatus: "pending",
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z",
});

const payment = (orderId: string, status: Payment["status"], amount: number): Payment => ({
  id: `payment_${orderId}`,
  orderId,
  patientId: `patient_${orderId}`,
  amount,
  currency: "USD",
  status,
  paymentMethod: "credit_card",
  cardLast4: "4242",
  cardBrand: "Visa",
  transactionId: `tx_${orderId}`,
  createdAt: "2026-06-10T00:00:00.000Z",
});

const patient = (id: string): Patient => ({
  id,
  firstName: id,
  lastName: "Patient",
  dateOfBirth: "1985-01-01",
  gender: "male",
  phone: "4075550100",
  email: `${id}@example.com`,
  address: { street1: "1 Test St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  shippingAddress: { street1: "1 Test St", city: "Orlando", state: "FL", zipCode: "32801", country: "US" },
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z",
});

describe("admin dashboard metrics", () => {
  it("counts only orders with completed payments", () => {
    const orders = [
      order("order_paid", "patient_a", "completed"),
      order("order_failed", "patient_b", "failed"),
      order("order_pending", "patient_c", "pending"),
    ];
    const payments = [
      payment("order_paid", "completed", 325),
      payment("order_failed", "failed", 325),
    ];

    expect(filterPaidDashboardOrders(orders, payments).map((item) => item.id)).toEqual(["order_paid"]);
  });

  it("bases revenue, order count, patient count, and AOV on completed payments only", () => {
    const orders = [
      order("order_paid_1", "patient_a", "completed"),
      order("order_paid_2", "patient_a", "completed"),
      order("order_failed", "patient_b", "failed"),
      order("order_pending", "patient_c", "pending"),
    ];
    const payments = [
      payment("order_paid_1", "completed", 325),
      payment("order_paid_2", "completed", 455),
      payment("order_failed", "failed", 525),
    ];

    const stats = buildAdminDashboardStats({
      orders,
      patients: [patient("patient_a"), patient("patient_b"), patient("patient_c")],
      payments,
    });

    expect(stats.totalOrders).toBe(2);
    expect(stats.totalPatients).toBe(1);
    expect(stats.totalRevenue).toBe(780);
    expect(stats.averageOrderValue).toBe(390);
  });

  it("does not add failed or pending payment amounts to completed revenue", () => {
    expect(
      sumCompletedPaymentRevenue([
        payment("paid", "completed", 325),
        payment("failed", "failed", 455),
        payment("pending", "pending", 525),
      ])
    ).toBe(325);
  });

  it("builds analytics periods and product mix from completed payments only", () => {
    const orders = [
      order("order_paid_tirz", "patient_a", "completed"),
      order("order_paid_reta", "patient_b", "completed"),
      order("order_failed", "patient_c", "failed"),
      order("order_pending", "patient_d", "pending"),
    ];
    orders[1].productId = "product_retatrutide";
    orders.forEach((item) => {
      item.createdAt = "2026-06-10T12:00:00.000Z";
    });

    const analytics = buildAdminAnalytics({
      orders,
      payments: [
        payment("order_paid_tirz", "completed", 349),
        payment("order_paid_reta", "completed", 325),
        payment("order_failed", "failed", 455),
        payment("order_pending", "pending", 525),
      ],
      now: new Date("2026-06-10T18:00:00.000Z"),
    });

    expect(analytics.totals).toMatchObject({ allTime: 2, week7: 2, month30: 2, ytd: 2 });
    expect(analytics.orderPeriods.today).toEqual({ orders: 2, revenue: 674 });
    expect(analytics.orderPeriods.thisWeek).toEqual({ orders: 2, revenue: 674 });
    expect(analytics.orderPeriods.thisMonth).toEqual({ orders: 2, revenue: 674 });
    expect(analytics.orderPeriods.thisYear).toEqual({ orders: 2, revenue: 674 });
    expect(analytics.monthly.find((month) => month.key === "2026-06")).toMatchObject({
      orders: 2,
      patients: 2,
      revenue: 674,
    });
    expect(analytics.productMix).toEqual([
      { count: 1, name: "Tirzepatide", revenue: 349 },
      { count: 1, name: "Retatrutide", revenue: 325 },
    ]);
  });
});
