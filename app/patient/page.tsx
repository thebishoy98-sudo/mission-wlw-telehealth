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
import { getStatusLabel, getStatusColor, formatDateTime, formatCurrency } from "@/lib/utils";
import { Package, Clock, CheckCircle2 } from "lucide-react";

type PatientPharmacyOrder = Pick<Types.PharmacyOrder, "orderId" | "status" | "trackingNumber" | "shippedAt">;

function StatusIcon({ status }: { status: Types.OrderStatus }) {
  if (status === "delivered" || status === "fulfilled") {
    return <CheckCircle2 size={16} className="text-green-500" />;
  }
  return <Clock size={16} className="text-amber-500" />;
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
                              {formatCurrency(dose.price)}/mo
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge className={getStatusColor(order.status)}>
                              {getStatusLabel(order.status)}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(order.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-gray-500">
                            {trackingNumber ? (
                              <>
                                Tracking number:{" "}
                                <span className="font-mono font-semibold text-gray-700">{trackingNumber}</span>
                              </>
                            ) : (
                              "Tracking number will be provided here once your order ships."
                            )}
                          </p>
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

      </div>
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
