"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getStatusLabel, getStatusColor, formatDateTime } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import type { Order } from "@/types";

type LookupResult = {
  order: Order;
  patient: { firstName: string; lastName: string; email?: string } | null;
  product: { name: string } | null;
  pharmacy: { status: string; trackingNumber?: string; shippedAt?: string } | null;
};

export default function PatientStatus() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getStatusIcon = (status: string) => {
    if (status === "delivered" || status === "fulfilled" || status === "completed") {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
    if (status === "rejected" || status === "error") {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!orderId.trim() || !email.trim()) {
      setError("Enter your order ID and email.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ email: email.trim() });
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId.trim())}?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Order not found.");
      setResult(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />
      <div className="container-max py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Order Status Tracker</h1>
        <p className="mb-8 max-w-2xl text-gray-600">
          Enter the order ID from your confirmation and the email used at checkout.
        </p>

        <Card className="mb-8 max-w-2xl">
          <CardContent className="p-6">
            <form onSubmit={lookup} className="space-y-4">
              <Input label="Order ID" value={orderId} onChange={(event) => setOrderId(event.target.value)} />
              <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Checking..." : "Check Status"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Order {result.order.id.slice(-8)}</h3>
                  <p className="text-sm text-gray-600">{result.product?.name ?? "Treatment order"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.order.status)}
                  <Badge className={getStatusColor(result.order.status)}>{getStatusLabel(result.order.status)}</Badge>
                </div>
              </div>

              <div className="grid gap-5 text-sm md:grid-cols-2">
                <div>
                  <p className="text-gray-600">Payment Status</p>
                  <Badge className={getStatusColor(result.order.paymentStatus)}>
                    {getStatusLabel(result.order.paymentStatus)}
                  </Badge>
                </div>
                <div>
                  <p className="text-gray-600">Pharmacy</p>
                  <Badge className={getStatusColor(result.order.pharmacyStatus)}>
                    {getStatusLabel(result.order.pharmacyStatus)}
                  </Badge>
                </div>
                <div>
                  <p className="text-gray-600">Created</p>
                  <p className="font-mono text-xs text-gray-700">{formatDateTime(result.order.createdAt)}</p>
                </div>
                {result.pharmacy?.trackingNumber && (
                  <div>
                    <p className="text-gray-600">Tracking</p>
                    <p className="font-semibold text-gray-900">{result.pharmacy.trackingNumber}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
