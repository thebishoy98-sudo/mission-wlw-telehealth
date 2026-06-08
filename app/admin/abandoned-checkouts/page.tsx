"use client";

import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { Product } from "@/types";
import { formatDateTime } from "@/lib/utils";

type AbandonedCheckout = {
  id: string;
  phone: string;
  email: string;
  firstName: string;
  productId: string;
  doseId: string;
  checkoutStep: string;
  startedAt: string;
  lastSeenAt: string;
  sms1hSent: boolean;
  sms24hSent: boolean;
  refCode: string;
  timeOnSiteSeconds: number;
};

const stepLabels: Record<string, string> = {
  treatment: "Treatment",
  name: "Name",
  contact: "Contact",
  details: "Details",
  address: "Address",
  consent: "Consent",
  info_complete: "Info complete",
  payment: "Payment",
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Under 1 min";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function checkoutStepLabel(step: string) {
  return stepLabels[step] ?? (step ? step.replace(/_/g, " ") : "Unknown");
}

function AbandonedCheckoutsContent() {
  const [checkouts, setCheckouts] = useState<AbandonedCheckout[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [checkoutResponse, productResponse] = await Promise.all([
          fetch("/api/admin/abandoned-checkouts", { cache: "no-store" }),
          fetch("/api/products", { cache: "no-store" }),
        ]);

        if (!checkoutResponse.ok) throw new Error("Could not load abandoned checkouts.");
        const checkoutPayload = await checkoutResponse.json();
        const productPayload = productResponse.ok ? await productResponse.json() : { products: [] };

        if (!mounted) return;
        setCheckouts(checkoutPayload.checkouts ?? []);
        setProducts(productPayload.products ?? []);
      } catch (err) {
        if (mounted) setError((err as Error).message || "Could not load abandoned checkouts.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      map.set(product.id, product);
      map.set(product.slug, product);
    }
    return map;
  }, [products]);

  const abandonedPaymentCount = checkouts.filter((checkout) => checkout.checkoutStep === "payment").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Abandoned Checkouts</h1>
          <p className="mt-2 text-sm text-gray-500">
            People who entered checkout information but have not completed payment.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase text-gray-400">Incomplete</p>
              <p className="mt-1 text-3xl font-bold text-forest-800">{checkouts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase text-gray-400">Reached Payment</p>
              <p className="mt-1 text-3xl font-bold text-forest-800">{abandonedPaymentCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase text-gray-400">Needs First Reminder</p>
              <p className="mt-1 text-3xl font-bold text-forest-800">
                {checkouts.filter((checkout) => !checkout.sms1hSent).length}
              </p>
            </CardContent>
          </Card>
        </div>

        {loading && (
          <Card>
            <CardContent className="p-5 text-sm text-gray-600">Loading abandoned checkout data...</CardContent>
          </Card>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Patient</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Contact</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Treatment</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Step</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Started</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Last Active</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Time on Site</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Reminders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {checkouts.map((checkout) => {
                      const product = productMap.get(checkout.productId);
                      const dose = product?.doses.find((item) => item.id === checkout.doseId);
                      return (
                        <tr key={checkout.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">
                            <p className="font-semibold text-gray-900">{checkout.firstName || "Unknown"}</p>
                            {checkout.refCode && <p className="text-xs text-gray-500">Ref {checkout.refCode}</p>}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <p className="text-gray-900">{checkout.phone || "-"}</p>
                            <p className="max-w-[14rem] truncate text-xs text-gray-500">{checkout.email || "-"}</p>
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <p className="font-semibold text-gray-900">{product?.name ?? (checkout.productId || "Unknown")}</p>
                            <p className="text-xs text-gray-500">{dose?.label ?? (checkout.doseId || "No dose selected")}</p>
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <Badge className={checkout.checkoutStep === "payment" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                              {checkoutStepLabel(checkout.checkoutStep)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">{formatDateTime(checkout.startedAt)}</td>
                          <td className="px-4 py-4 text-sm text-gray-600">{formatDateTime(checkout.lastSeenAt)}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                            {formatDuration(checkout.timeOnSiteSeconds)}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge className={checkout.sms1hSent ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                                1h {checkout.sms1hSent ? "sent" : "pending"}
                              </Badge>
                              <Badge className={checkout.sms24hSent ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                                24h {checkout.sms24hSent ? "sent" : "pending"}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {checkouts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                          No abandoned checkouts found.
                        </td>
                      </tr>
                    )}
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

export default function AbandonedCheckoutsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AbandonedCheckoutsContent />
    </ProtectedRoute>
  );
}
