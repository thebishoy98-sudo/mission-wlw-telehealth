"use client";

import { useEffect, useState } from "react";
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

function StatusIcon({ status }: { status: Types.OrderStatus }) {
  if (status === "delivered" || status === "fulfilled") {
    return <CheckCircle2 size={16} className="text-green-500" />;
  }
  return <Clock size={16} className="text-amber-500" />;
}

function PatientPortalContent() {
  const { user } = useAuth();
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
