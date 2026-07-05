"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, getOrderStatusLabel, formatDateTime, formatCurrency, getFedExTrackingUrl } from "@/lib/utils";
import { Package, Clock, CheckCircle2, Copy, Check, RefreshCw } from "lucide-react";

type PatientPharmacyOrder = Pick<Types.PharmacyOrder, "orderId" | "status" | "trackingNumber" | "shippedAt">;

const TIMELINE_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "pharmacy", label: "At Pharmacy" },
  { key: "delivered", label: "Delivered" },
];

function getStepIndex(status: Types.OrderStatus): number {
  if (status === "delivered" || status === "fulfilled") return 4;
  if (status === "sent_to_pharmacy") return 3;
  if (status === "approved") return 2;
  if (status === "pending_review") return 1;
  return 0;
}

function OrderTimeline({ status }: { status: Types.OrderStatus }) {
  const current = getStepIndex(status);
  return (
    <div className="mt-3 mb-1">
      <div className="flex items-center gap-0">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= current;
          const active = i === current;
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                  done ? "bg-forest-800 text-white" : "bg-gray-100 text-gray-400"
                } ${active ? "ring-2 ring-forest-400 ring-offset-1" : ""}`}>
                  {done && i < current ? "✓" : i + 1}
                </div>
                <span className={`text-[9px] mt-0.5 font-medium leading-tight text-center max-w-[48px] ${done ? "text-forest-800" : "text-gray-400"}`}>
                  {step.label}
                </span>
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-0.5 mb-3.5 ${i < current ? "bg-forest-800" : "bg-gray-100"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Types.OrderStatus }) {
  if (status === "delivered" || status === "fulfilled") {
    return <CheckCircle2 size={16} className="text-green-500" />;
  }
  return <Clock size={16} className="text-gray-400" />;
}

function PatientPortalContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [patient, setPatient] = useState<Types.Patient | null>(null);
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [products, setProducts] = useState<Record<string, Types.Product>>({});
  const [pharmacyOrders, setPharmacyOrders] = useState<Record<string, PatientPharmacyOrder>>({});

  useEffect(() => {
    if (!user?.patientId) return;
    const patientId = user.patientId;
    let cancelled = false;
    async function loadOrders() {
      const productMap: Record<string, Types.Product> = {};
      try {
        const response = await fetch("/api/patient/orders", { cache: "no-store" });
        if (!response.ok) throw new Error("server orders unavailable");
        const data = await response.json() as {
          patient: Types.Patient;
          orders: Types.Order[];
          products: Types.Product[];
          pharmacyOrders: PatientPharmacyOrder[];
        };
        if (cancelled) return;
        const patientOrders = [...data.orders].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        data.products.forEach((product) => {
          productMap[product.id] = product;
        });
        setPatient(data.patient);
        setOrders(patientOrders);
        setProducts(productMap);
        setPharmacyOrders(Object.fromEntries((data.pharmacyOrders ?? []).map((pharmacyOrder) => [pharmacyOrder.orderId, pharmacyOrder])));
        return;
      } catch {
        const localPatient = db.patientDb.getById(patientId);
        const patientOrders = db.orderDb
          .getByPatient(patientId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        patientOrders.forEach((o) => {
          if (!productMap[o.productId]) {
            const p = db.productDb.getById(o.productId);
            if (p) productMap[o.productId] = p;
          }
        });
        if (!cancelled) {
          setPatient(localPatient ?? null);
          setOrders(patientOrders);
          setProducts(productMap);
          const localPharmacyOrders: Record<string, PatientPharmacyOrder> = {};
          patientOrders.forEach((order) => {
            const pharmacyOrder = db.pharmacyOrderDb.getByOrder(order.id);
            if (pharmacyOrder) localPharmacyOrders[order.id] = pharmacyOrder;
          });
          setPharmacyOrders(localPharmacyOrders);
        }
      }
    }
    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeOrders = orders.filter(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "rejected" &&
      o.status !== "draft"
  );

  const handleReorder = (order: Types.Order) => {
    router.push(`/patient/reorder?orderId=${encodeURIComponent(order.id)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="patient" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your prescriptions and refills below.
          </p>
        </div>

        {/* Order history */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Your orders
        </h2>

        {activeOrders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No orders yet</p>
              <Link href="/products" className="mt-4 inline-block">
                <Button>Browse treatments</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const product = products[order.productId];
              const dose = product?.doses.find((d) => d.id === order.doseId);
              const pharmacyOrder = pharmacyOrders[order.id];
              const trackingNumber = pharmacyOrder?.trackingNumber?.trim();
              return (
                <Card key={order.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <StatusIcon status={order.status} />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {product?.name ?? "Unknown product"}
                          </p>
                          {dose && (
                            <p className="text-sm text-gray-500">
                              {dose.label} &bull;{" "}
                              {formatCurrency(dose.price)} - 8-week prescription
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge className={getStatusColor(order.status)}>
                              {getOrderStatusLabel(order)}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(order.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-gray-500">
                            {trackingNumber ? (
                              <>
                                Tracking number:{" "}
                                <a
                                  href={getFedExTrackingUrl(trackingNumber)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono font-semibold text-forest-800 underline underline-offset-2 hover:text-forest-900"
                                >
                                  {trackingNumber}
                                </a>
                              </>
                            ) : (
                              "Tracking number will be provided here once your order ships."
                            )}
                          </p>
                          <OrderTimeline status={order.status} />
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleReorder(order)}>
                        Reorder
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Subscription self-service */}
        <SubscriptionSection />

        {/* Referral section */}
        {user?.patientId && (
          <ReferralSection />
        )}

      </div>
    </div>
  );
}

type PatientSubscription = {
  id: string;
  status: string;
  productName: string;
  doseLabel: string;
  intervalWeeks: number;
  nextRunAt: string | null;
  coversThrough: string | null;
};

function SubscriptionSection() {
  const [subs, setSubs] = useState<PatientSubscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cancelling, setCancelling] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/patient/subscription", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSubs(data.subscriptions ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { void load(); }, []);

  const manage = async (action: "cancel" | "reactivate", id: string) => {
    if (action === "cancel" && !window.confirm("Cancel your auto-refill subscription? You can restart it anytime.")) return;
    setCancelling(id);
    setError("");
    try {
      const res = await fetch("/api/patient/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, subscriptionId: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Could not ${action}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling("");
    }
  };

  // Only render the section once we know there's something to show.
  if (!loaded || subs.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <RefreshCw className="h-4 w-4 text-forest-700" /> Auto-Refill Subscription
      </h2>
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
      <div className="space-y-3">
        {subs.map((sub) => (
          <Card key={sub.id}>
            <CardContent className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{sub.productName}</p>
                  {sub.doseLabel && <p className="text-sm text-gray-500">{sub.doseLabel}</p>}
                  <p className="mt-1 text-xs text-gray-500">
                    Ships automatically every {sub.intervalWeeks} weeks.
                    {sub.nextRunAt ? ` Next order: ${formatDateTime(sub.nextRunAt)}.` : ""}
                  </p>
                  {sub.status === "paused" && (
                    <Badge className="mt-1 bg-yellow-100 text-yellow-800">Paused</Badge>
                  )}
                  {sub.status === "cancelled" && (
                    <Badge className="mt-1 bg-gray-100 text-gray-700">Cancelled</Badge>
                  )}
                </div>
                {sub.status === "cancelled" ? (
                  <Button
                    size="sm"
                    onClick={() => void manage("reactivate", sub.id)}
                    disabled={cancelling === sub.id}
                  >
                    {cancelling === sub.id ? "Reactivating…" : "Reactivate"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void manage("cancel", sub.id)}
                    disabled={cancelling === sub.id}
                  >
                    {cancelling === sub.id ? "Cancelling…" : "Cancel subscription"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReferralSection() {
  const [copied, setCopied] = useState(false);
  const [referral, setReferral] = useState<{ link: string; balance: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/patient/referral", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data?.link) {
          setReferral({ link: data.link, balance: Number(data.balance) || 0 });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!referral) return null;

  const copy = () => {
    navigator.clipboard.writeText(referral.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Refer a Friend</h2>
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-gray-600 mb-4">
            Share your personal link. Your friend gets $50 off their first order and you earn $50 after their payment succeeds.
          </p>
          <div className="mb-4 rounded-xl bg-forest-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-forest-700">Available referral credit</p>
            <p className="mt-1 text-xl font-bold text-forest-900">{formatCurrency(referral.balance)}</p>
            <p className="mt-1 text-xs text-gray-500">Automatically applied to your next order or refill.</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
            <span className="flex-1 text-xs font-mono text-gray-700 truncate">{referral.link}</span>
            <button
              onClick={copy}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-forest-800 hover:text-forest-700 transition-colors"
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-green-600" /><span className="text-green-600">Copied!</span></>
              ) : (
                <><Copy className="w-3.5 h-3.5" />Copy</>
              )}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PatientPortal() {
  return (
    <ProtectedRoute requiredRole="patient">
      <PatientPortalContent />
    </ProtectedRoute>
  );
}
