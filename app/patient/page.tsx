"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatDateTime, formatCurrency } from "@/lib/utils";
import { Package, RefreshCcw, TrendingUp, Clock, CheckCircle2 } from "lucide-react";

const REORDERABLE_STATUSES: Types.OrderStatus[] = [
  "approved",
  "sent_to_pharmacy",
  "processing",
  "fulfilled",
  "shipped",
  "delivered",
];

function StatusIcon({ status }: { status: Types.OrderStatus }) {
  if (status === "delivered" || status === "fulfilled") {
    return <CheckCircle2 size={16} className="text-green-500" />;
  }
  return <Clock size={16} className="text-amber-500" />;
}

function PatientPortalContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [products, setProducts] = useState<Record<string, Types.Product>>({});

  useEffect(() => {
    if (!user?.patientId) return;
    const patientOrders = db.orderDb
      .getByPatient(user.patientId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    setOrders(patientOrders);

    const productMap: Record<string, Types.Product> = {};
    patientOrders.forEach((o) => {
      if (!productMap[o.productId]) {
        const p = db.productDb.getById(o.productId);
        if (p) productMap[o.productId] = p;
      }
    });
    setProducts(productMap);
  }, [user]);

  const activeOrders = orders.filter(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "rejected" &&
      o.status !== "draft"
  );

  const mostRecentReorderable = activeOrders.find((o) =>
    REORDERABLE_STATUSES.includes(o.status)
  );

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

        {/* Quick actions if they have an eligible order */}
        {mostRecentReorderable && (
          <Card className="mb-8 border-teal-200 bg-teal-50/60">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Package size={18} className="text-teal-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">
                    Ready to refill?
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {products[mostRecentReorderable.productId]?.name ??
                      "Your current prescription"}{" "}
                    &mdash;{" "}
                    {products[mostRecentReorderable.productId]?.doses.find(
                      (d) => d.id === mostRecentReorderable.doseId
                    )?.label ?? "current dose"}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Link
                    href={`/patient/reorder?orderId=${mostRecentReorderable.id}&action=reorder`}
                  >
                    <Button size="sm" variant="outline">
                      <RefreshCcw size={14} className="mr-1.5" />
                      Reorder
                    </Button>
                  </Link>
                  <Link
                    href={`/patient/reorder?orderId=${mostRecentReorderable.id}&action=increase_dose`}
                  >
                    <Button size="sm">
                      <TrendingUp size={14} className="mr-1.5" />
                      Increase Dose
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
              const canReorder = REORDERABLE_STATUSES.includes(order.status);

              return (
                <Card key={order.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
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
                        </div>
                      </div>

                      {canReorder && (
                        <div className="flex gap-2 flex-shrink-0">
                          <Link
                            href={`/patient/reorder?orderId=${order.id}&action=reorder`}
                          >
                            <Button size="sm" variant="outline">
                              <RefreshCcw size={13} className="mr-1" />
                              Reorder
                            </Button>
                          </Link>
                          <Link
                            href={`/patient/reorder?orderId=${order.id}&action=increase_dose`}
                          >
                            <Button size="sm">
                              <TrendingUp size={13} className="mr-1" />
                              Increase Dose
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/status">
            <Button variant="ghost" size="sm">
              Track order status
            </Button>
          </Link>
        </div>
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
