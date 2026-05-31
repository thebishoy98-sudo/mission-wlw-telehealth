"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/lib/auth";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatDateTime } from "@/lib/utils";
import { ClipboardCheck, Eye } from "lucide-react";

type DashboardData = {
  orders: Types.Order[];
  patients: Types.Patient[];
  products: Types.Product[];
  reviews: Types.ProviderReview[];
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
  const { user } = useAuth();
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});
  const [products, setProducts] = useState<Record<string, Types.Product>>({});
  const [reviews, setReviews] = useState<Record<string, Types.ProviderReview>>({});
  const [approvingAll, setApprovingAll] = useState(false);
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
      setProducts(Object.fromEntries(data.products.map((product) => [product.id, product])));
      setReviews(Object.fromEntries(data.reviews.map((review) => [review.orderId, review])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const pendingReview = orders.filter((o) => o.status === "pending_review");
  const bulkApprovalTargets = pendingReview;
  const approved = orders.filter((o) => o.status === "approved" || o.status === "sent_to_pharmacy");
  const fulfilled = orders.filter((o) => o.status === "fulfilled" || o.status === "delivered");

  const handleApproveAll = async () => {
    setApprovingAll(true);
    setError("");
    try {
      for (const order of bulkApprovalTargets) {
        const reviewRes = await fetch("/api/provider/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            action: "approve",
            notes: "Bulk approved by provider",
            reviewedBy: user?.name ?? "Dotson, Karen",
          }),
        });
        if (!reviewRes.ok) {
          const message = await reviewRes.text();
          throw new Error(message || `Provider approval failed for order ${order.id.slice(-6)}`);
        }
      }
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovingAll(false);
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

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-teal-600 mb-2">
                {pendingReview.length}
              </div>
              <p className="text-gray-600">Awaiting Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {approved.length}
              </div>
              <p className="text-gray-600">Approved / In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {fulfilled.length}
              </div>
              <p className="text-gray-600">Fulfilled</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending review section */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Orders Requiring Review</h2>
          {bulkApprovalTargets.length > 0 && (
            <Button onClick={handleApproveAll} disabled={approvingAll} size="sm">
              {approvingAll ? "Approving..." : `Approve All (${bulkApprovalTargets.length})`}
            </Button>
          )}
        </div>
        {pendingReview.length === 0 ? (
          <Card>
            <CardContent className="p-10 sm:p-12 text-center">
              <p className="text-gray-600">No orders awaiting review</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {pendingReview.map((order) => {
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
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
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
                        <Link href={`/provider/patients/${order.patientId}`}>
                          <Button size="sm" className="w-full sm:w-auto">Review Chart</Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* All Orders table */}
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-10 sm:mt-12 mb-5 sm:mb-6">All Orders</h2>

        {/* Desktop table */}
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.slice(0, 10).map((order) => {
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
                          <Link href={`/provider/patients/${order.patientId}`}>
                            <Button size="sm" variant="outline">View Chart</Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {orders.slice(0, 10).map((order) => {
            const patient = patients[order.patientId];
            const rev = reviews[order.id];
            return (
              <Card key={order.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {patientDisplayName(patient)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(order.createdAt)}</p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      {getStatusLabel(order.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {rev?.chartViewedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                        <ClipboardCheck className="w-3 h-3" />
                        Chart reviewed
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Chart not reviewed</span>
                    )}
                    <Link href={`/provider/patients/${order.patientId}`} className="w-full">
                      <Button size="sm" variant="outline" fullWidth>View Chart</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
