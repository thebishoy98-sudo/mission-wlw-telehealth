"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatDateTime } from "@/lib/utils";
import { RefreshCw, CheckCircle2, CreditCard } from "lucide-react";

type RefillOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  pharmacyStatus: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

type SubscriptionRow = {
  id: string;
  status: string;
  patientId: string;
  patientName: string;
  productName: string;
  doseLabel: string;
  intervalDays: number;
  coversThrough: string | null;
  nextRunAt: string | null;
  lastChargedAt: string | null;
  hasCardOnFile: boolean;
  cardLast4: string | null;
  orders: RefillOrder[];
};

function SubscriptionsContent() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acking, setAcking] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load subscriptions: ${res.status}`);
      const data = await res.json();
      setRows(data.subscriptions ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const acknowledge = async (orderId: string) => {
    setAcking(orderId);
    try {
      const res = await fetch("/api/provider/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "acknowledge_refill" }),
      });
      if (!res.ok) throw new Error(`Acknowledge failed: ${res.status}`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAcking("");
    }
  };

  const active = rows.filter((r) => r.status === "active");
  const inactive = rows.filter((r) => r.status !== "active");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <RefreshCw className="h-6 w-6 text-forest-700" /> Auto-Refill Subscriptions
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Patients on recurring 8-week treatment. Acknowledging a refill is for your records only —
              it does <span className="font-semibold">not</span> gate dispatch; refills ship automatically.
            </p>
          </div>
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
            Loading subscriptions…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
            No subscriptions yet. Patients enroll when they pay through a &quot;save card&quot; link.
          </div>
        ) : (
          <div className="space-y-4">
            {[...active, ...inactive].map((sub) => (
              <Card key={sub.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/provider/patients/${sub.patientId}`}
                          className="font-semibold text-gray-900 hover:text-forest-700 hover:underline"
                        >
                          {sub.patientName}
                        </Link>
                        <Badge variant={sub.status === "active" ? "success" : "default"}>{sub.status}</Badge>
                        {sub.hasCardOnFile ? (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <CreditCard className="h-3.5 w-3.5" /> card •••• {sub.cardLast4 ?? "????"}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">no card on file (pay-link)</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {sub.productName} — {sub.doseLabel}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>Next billing: <span className="font-medium text-gray-800">{sub.nextRunAt ? formatDateTime(sub.nextRunAt) : "—"}</span></p>
                      <p>Supply through: {sub.coversThrough ? formatDateTime(sub.coversThrough) : "—"}</p>
                      <p>Last charged: {sub.lastChargedAt ? formatDateTime(sub.lastChargedAt) : "—"}</p>
                    </div>
                  </div>

                  {sub.orders.length > 0 && (
                    <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                      {sub.orders.map((order) => (
                        <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Link href={`/provider/patients/${sub.patientId}`} className="font-mono text-xs text-gray-500 hover:underline">
                              #{order.id.slice(-8)}
                            </Link>
                            <Badge variant="default">{order.status}</Badge>
                            <span className="text-xs text-gray-400">{formatDateTime(order.createdAt)}</span>
                          </div>
                          {order.acknowledgedAt ? (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                              {order.acknowledgedBy ? ` by ${order.acknowledgedBy}` : ""}
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => void acknowledge(order.id)}
                              disabled={acking === order.id}
                            >
                              {acking === order.id ? "Saving…" : "Acknowledge"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProviderSubscriptionsPage() {
  return (
    <ProtectedRoute requiredRole="provider">
      <SubscriptionsContent />
    </ProtectedRoute>
  );
}
