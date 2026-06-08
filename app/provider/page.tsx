"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatDateTime } from "@/lib/utils";
import { ClipboardCheck, Eye } from "lucide-react";

type DashboardData = {
  orders: Types.Order[];
  patients: Types.Patient[];
  products: Types.Product[];
  reviews: Types.ProviderReview[];
  orderPeriods?: { today: number; thisWeek: number; thisMonth: number; thisYear: number };
  avgReviewHours?: number | null;
};

const patientDisplayName = (patient: Types.Patient | undefined) => {
  if (!patient) return "Unknown patient";
  const fullName = [patient.firstName, patient.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return fullName || patient.email || patient.phone || "Unknown patient";
};

function ProviderDashboardContent() {
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});
  const [reviews, setReviews] = useState<Record<string, Types.ProviderReview>>({});
  const [orderPeriods, setOrderPeriods] = useState<{ today: number; thisWeek: number; thisMonth: number; thisYear: number } | null>(null);
  const [avgReviewHours, setAvgReviewHours] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingOrder, setMarkingOrder] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/provider/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error(`Provider dashboard failed: ${response.status}`);
      const data = (await response.json()) as DashboardData;
      const allOrders = [...data.orders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(allOrders);
      setPatients(Object.fromEntries(data.patients.map((patient) => [patient.id, patient])));
      setReviews(Object.fromEntries(data.reviews.map((review) => [review.orderId, review])));
      if (data.orderPeriods) setOrderPeriods(data.orderPeriods);
      if (data.avgReviewHours != null) setAvgReviewHours(data.avgReviewHours);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const unreviewedOrders = orders.filter((order) => !reviews[order.id]?.chartViewedAt);
  const reviewedOrders = orders.filter((order) => reviews[order.id]?.chartViewedAt);

  const markChartViewed = async (order: Types.Order) => {
    setMarkingOrder(order.id);
    setError("");
    try {
      const response = await fetch("/api/provider/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          action: "mark_chart_viewed",
          reviewedBy: "Dotson, Karen",
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Could not mark chart reviewed for order ${order.id.slice(-6)}`);
      }
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMarkingOrder("");
    }
  };

  const markAllViewed = async () => {
    setMarkingAll(true);
    setError("");
    try {
      for (const order of unreviewedOrders) {
        const response = await fetch("/api/provider/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            action: "mark_chart_viewed",
            reviewedBy: "Dotson, Karen",
          }),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Could not mark chart reviewed for order ${order.id.slice(-6)}`);
        }
      }
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="provider" />
      <div className="container-max pt-12 pb-8 sm:pt-16 sm:pb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Provider Dashboard</h1>
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {loading && (
          <Card className="mb-6">
            <CardContent className="p-6 text-gray-600">Loading real provider orders...</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-forest-800 mb-2">
                {orders.length}
              </div>
              <p className="text-gray-600">Total Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-forest-800 mb-2">
                {unreviewedOrders.length}
              </div>
              <p className="text-gray-600">Needs Chart Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {reviewedOrders.length}
              </div>
              <p className="text-gray-600">Reviewed</p>
            </CardContent>
          </Card>
          {avgReviewHours !== null && (
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="text-3xl font-bold text-forest-800 mb-2">
                  {avgReviewHours < 1 ? `${Math.round(avgReviewHours * 60)}m` : `${avgReviewHours}h`}
                </div>
                <p className="text-gray-600">Avg. Review Time</p>
              </CardContent>
            </Card>
          )}
        </div>

        {orderPeriods && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 mb-8 sm:mb-12">
            {[
              { label: "Today", value: orderPeriods.today },
              { label: "This Week", value: orderPeriods.thisWeek },
              { label: "This Month", value: orderPeriods.thisMonth },
              { label: "This Year", value: orderPeriods.thisYear },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
                  <p className="text-2xl font-bold text-forest-800">{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">new orders</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Orders</h2>
          {unreviewedOrders.length > 0 && (
            <Button onClick={markAllViewed} disabled={markingAll} size="sm">
              {markingAll ? "Marking..." : `Mark All Reviewed (${unreviewedOrders.length})`}
            </Button>
          )}
        </div>
        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-10 sm:p-12 text-center">
              <p className="text-gray-600">No provider orders yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 sm:hidden">
            {orders.map((order) => {
              const patient = patients[order.patientId];
              const rev = reviews[order.id];
              return (
                <Card key={order.id} clickable>
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">
                            {patientDisplayName(patient)}
                          </h3>
                          {rev?.chartViewedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                              <ClipboardCheck className="w-3 h-3" />
                              Chart reviewed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                              <Eye className="w-3 h-3" />
                              Not yet reviewed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">
                          Order {order.id.slice(-6)} - {formatDateTime(order.createdAt)}
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        {!rev?.chartViewedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => void markChartViewed(order)}
                            disabled={markingOrder === order.id}
                          >
                            {markingOrder === order.id ? "Marking..." : "Mark Reviewed"}
                          </Button>
                        )}
                        <Link href={`/provider/patients/${order.patientId}?orderId=${encodeURIComponent(order.id)}`}>
                          <Button size="sm" className="w-full sm:w-auto">View Chart</Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {orders.length > 0 && (
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Patient</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Chart Reviewed</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Created</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders.map((order) => {
                      const patient = patients[order.patientId];
                      const rev = reviews[order.id];
                      return (
                        <tr key={order.id}>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {patientDisplayName(patient)}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <Badge className={getStatusColor(order.status)}>
                              {getStatusLabel(order.status)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {rev?.chartViewedAt ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                {new Date(rev.chartViewedAt).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {formatDateTime(order.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {!rev?.chartViewedAt && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void markChartViewed(order)}
                                  disabled={markingOrder === order.id}
                                >
                                  {markingOrder === order.id ? "Marking..." : "Mark Reviewed"}
                                </Button>
                              )}
                              <Link href={`/provider/patients/${order.patientId}?orderId=${encodeURIComponent(order.id)}`}>
                                <Button size="sm" variant="outline">View Chart</Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ProviderDashboard() {
  return (
    <ProtectedRoute requiredRole="provider">
      <ProviderDashboardContent />
    </ProtectedRoute>
  );
}
