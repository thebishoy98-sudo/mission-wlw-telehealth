"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type MonthlySales = {
  key: string;
  label: string;
  orders: number;
  patients: number;
  revenue: number;
  newRevenue: number;
  subscriptionRevenue: number;
  newCustomers: number;
};

type AnalyticsData = {
  monthly: MonthlySales[];
};

function AdminAnalyticsContent() {
  const [monthly, setMonthly] = useState<MonthlySales[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/admin/analytics", { cache: "no-store" });
        if (!response.ok) throw new Error(`Analytics request failed with ${response.status}`);
        const data = (await response.json()) as AnalyticsData;
        if (!isMounted) return;
        setMonthly(data.monthly);
        setSelectedKey(data.monthly[data.monthly.length - 1]?.key ?? "");
      } catch {
        if (isMounted) setError("Could not load analytics data. Please refresh the page.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const selected = monthly.find((month) => month.key === selectedKey) ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Sales Analytics</h1>

        {loading && (
          <Card className="mb-8">
            <CardContent className="p-6 text-sm text-gray-600">Loading analytics...</CardContent>
          </Card>
        )}

        {!loading && error && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Month picker + summary for the selected month */}
            <div className="mb-8 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="month-select" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Month
                </label>
                <select
                  id="month-select"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  {monthly.map((month) => (
                    <option key={month.key} value={month.key}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selected && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 mb-8 sm:mb-12">
                <Card>
                  <CardContent className="p-6">
                    <p className="text-gray-600 text-sm mb-1">Total Revenue ({selected.label})</p>
                    <p className="text-2xl sm:text-3xl font-bold text-forest-800">
                      {formatCurrency(selected.revenue)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <p className="text-gray-600 text-sm mb-1">New Customer Revenue</p>
                    <p className="text-2xl sm:text-3xl font-bold text-indigo-700">
                      {formatCurrency(selected.newRevenue)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <p className="text-gray-600 text-sm mb-1">Subscription Revenue</p>
                    <p className="text-2xl sm:text-3xl font-bold text-teal-700">
                      {formatCurrency(selected.subscriptionRevenue)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <p className="text-gray-600 text-sm mb-1">New Customers</p>
                    <p className="text-2xl sm:text-3xl font-bold">{selected.newCustomers}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Revenue by month, split by source */}
            <div className="mb-8 sm:mb-12">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Revenue by Month (New vs. Subscription)</h3>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} width={90} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="newRevenue" stackId="revenue" fill="#6366f1" name="New Customer Revenue" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="subscriptionRevenue" stackId="revenue" fill="#0d9488" name="Subscription Revenue" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* New customers by month */}
            <div className="mb-8 sm:mb-12">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">New Customers by Month</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="newCustomers" fill="#6366f1" name="New Customers" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Month-by-month table */}
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Monthly Breakdown</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold">Month</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold">Total Revenue</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold">New Customer Revenue</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold">Subscription Revenue</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold">New Customers</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold">Orders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...monthly].reverse().map((month) => (
                        <tr key={month.key} className={month.key === selectedKey ? "bg-forest-50" : ""}>
                          <td className="px-6 py-4 text-sm font-medium">{month.label}</td>
                          <td className="px-6 py-4 text-sm text-right">{formatCurrency(month.revenue)}</td>
                          <td className="px-6 py-4 text-sm text-right">{formatCurrency(month.newRevenue)}</td>
                          <td className="px-6 py-4 text-sm text-right">{formatCurrency(month.subscriptionRevenue)}</td>
                          <td className="px-6 py-4 text-sm text-right">{month.newCustomers}</td>
                          <td className="px-6 py-4 text-sm text-right">{month.orders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminAnalyticsContent />
    </ProtectedRoute>
  );
}
