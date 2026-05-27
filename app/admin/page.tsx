"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

type AdminDashboardData = {
  orders: Types.Order[];
  patients: Types.Patient[];
  payments: Types.Payment[];
  pharmacyOrders: Types.PharmacyOrder[];
};

function AdminDashboardContent() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalPatients: 0,
    totalRevenue: 0,
    paidOrders: 0,
    pendingPayments: 0,
    fulfilled: 0,
    averageOrderValue: 0,
  });

  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [payments, setPayments] = useState<Record<string, Types.Payment>>({});
  const [pharmacyOrders, setPharmacyOrders] = useState<Record<string, Types.PharmacyOrder>>({});
  const [revenueData, setRevenueData] = useState<any[]>([]);

  useEffect(() => {
    async function loadAdminData() {
      let allOrders = db.orderDb.getAll();
      let allPayments = db.paymentDb.getAll();
      let allPatients = db.patientDb.getAll();
      let allPharmacyOrders = db.pharmacyOrderDb.getAll();

      try {
        const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as AdminDashboardData;
          allOrders = data.orders;
          allPayments = data.payments;
          allPatients = data.patients;
          allPharmacyOrders = data.pharmacyOrders;
        }
      } catch {
        // Keep local fallback for static/local runs.
      }

      const totalRevenue = allPayments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0);

      const paidOrders = allPayments.filter((p) => p.status === "completed").length;
      const fulfilled = allOrders.filter(
        (o) => o.status === "delivered" || o.status === "fulfilled"
      ).length;

      setStats({
        totalOrders: allOrders.length,
        totalPatients: allPatients.length,
        totalRevenue,
        paidOrders,
        pendingPayments: allOrders.filter((o) => o.paymentStatus === "pending").length,
        fulfilled,
        averageOrderValue: paidOrders > 0 ? totalRevenue / paidOrders : 0,
      });

      setOrders(allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPayments(Object.fromEntries(allPayments.map((payment) => [payment.orderId, payment])));
      setPharmacyOrders(Object.fromEntries(allPharmacyOrders.map((pharmacyOrder) => [pharmacyOrder.orderId, pharmacyOrder])));

      const last7Days: { date: string; revenue: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayRevenue = allPayments
          .filter(
            (p) =>
              p.status === "completed" &&
              new Date(p.createdAt).toDateString() === date.toDateString()
          )
          .reduce((sum, p) => sum + p.amount, 0);

        last7Days.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          revenue: dayRevenue,
        });
      }
      setRevenueData(last7Days);
    }

    void loadAdminData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Admin Dashboard</h1>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 mb-8 sm:mb-12">
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600 text-sm mb-1">Total Revenue</p>
              <p className="text-2xl sm:text-3xl font-bold text-teal-600">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600 text-sm mb-1">Total Orders</p>
              <p className="text-2xl sm:text-3xl font-bold">{stats.totalOrders}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600 text-sm mb-1">Patients</p>
              <p className="text-2xl sm:text-3xl font-bold">{stats.totalPatients}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600 text-sm mb-1">Avg Order Value</p>
              <p className="text-2xl sm:text-3xl font-bold">
                {formatCurrency(stats.averageOrderValue)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8 sm:mb-12">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Revenue (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0d9488"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Order Status Distribution</h3>
              <div className="space-y-3">
                {[
                  {
                    label: "Pending Review",
                    count: orders.filter((o) => o.status === "pending_review")
                      .length,
                  },
                  {
                    label: "Approved",
                    count: orders.filter((o) => o.status === "approved").length,
                  },
                  {
                    label: "Sent to Pharmacy",
                    count: orders.filter((o) => o.status === "sent_to_pharmacy")
                      .length,
                  },
                  {
                    label: "Fulfilled",
                    count: orders.filter(
                      (o) => o.status === "fulfilled" || o.status === "delivered"
                    ).length,
                  },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Management</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
            <Link href="/admin/products">
              <Button fullWidth variant="outline">
                Manage Products
              </Button>
            </Link>
            <Link href="/admin/integrations">
              <Button fullWidth variant="outline">
                Questionnaire Source
              </Button>
            </Link>
            <Link href="/admin/integrations">
              <Button fullWidth variant="outline">
                Integration Logs
              </Button>
            </Link>
            <Link href="/admin/integrations">
              <Button fullWidth variant="outline">
                Spruce Texting
              </Button>
            </Link>
          </div>
        </div>

        {/* Recent Orders */}
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Orders</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">
                      Payment / QB
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">
                      Pharmacy
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.slice(0, 10).map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 text-sm font-mono">
                        {order.id.slice(-6)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge className={getStatusColor(order.status)}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge className={getStatusColor(order.paymentStatus)}>
                          {getStatusLabel(order.paymentStatus)}
                        </Badge>
                        <div className="mt-1">
                          <Badge className={getStatusColor(order.quickbooksStatus)}>
                            {getStatusLabel(order.quickbooksStatus)}
                          </Badge>
                        </div>
                        {payments[order.id]?.transactionId && (
                          <p className="mt-1 text-xs text-gray-500">{payments[order.id].transactionId}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge className={getStatusColor(order.pharmacyStatus)}>
                          {getStatusLabel(order.pharmacyStatus)}
                        </Badge>
                        {pharmacyOrders[order.id]?.lifeFileOrderId && (
                          <p className="mt-1 text-xs text-gray-500">LF {pharmacyOrders[order.id].lifeFileOrderId}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link href={`/admin/orders#${order.id}`}>
                          <Button size="sm" variant="outline">
                            Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminDashboardContent />
    </ProtectedRoute>
  );
}
