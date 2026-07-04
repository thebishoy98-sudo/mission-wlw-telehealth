"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Image as ImageIcon, Video } from "lucide-react";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, getOrderStatusLabel, formatCurrency, formatDateTime, getFedExTrackingUrl } from "@/lib/utils";
import { Toast } from "@/components/ui/Toast";
import { getIdentityGate } from "@/lib/identity";
import { getOrderDispatchGate } from "@/lib/order-gates";
import { getPriorMedGate } from "@/lib/prior-med";
import { isBackToBackOrder } from "@/lib/order-cadence";
import { buildConsentCertificate } from "@/lib/consent";
import { getDisplayOrderNumber, getDisplayPracticeQStatus, isPracticeQSkippedForOrder } from "@/lib/order-display";

type AdminDashboardData = {
  orders: Types.Order[];
  patients: Types.Patient[];
  products: Types.Product[];
  payments: Types.Payment[];
  pharmacyOrders: Types.PharmacyOrder[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    q: string;
  };
};

type OrderDetailData = {
  practiceq: Types.PracticeQMirror | null;
  consent?: Types.ConsentRecord | null;
  identity?: {
    status: Types.IdentityStatus | "missing";
    reason?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    aiResult?: Types.IdentityAiResult | null;
    uploads: Types.Upload[];
  };
  diagnostics?: {
    practiceqAutomation: {
      status: string;
      attempts: number;
      handoffUrl?: string;
      handoffExpiresAt?: string;
      intakeId?: string;
      lastError?: string;
      updatedAt?: string;
    } | null;
    integrationLogs: Array<{
      id: string;
      timestamp: string;
      integrationName: string;
      action: string;
      status: "success" | "pending" | "error";
      details?: Record<string, unknown>;
      error?: string;
    }>;
    spruceMessages: Array<{
      id: string;
      templateKey: string;
      phoneNumber: string;
      messageText: string;
      status: Types.SpruceMessage["status"];
      scheduledFor?: string;
      sentAt?: string;
      createdAt: string;
    }>;
  };
};

const cleanText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text && text.toLowerCase() !== "null" ? text : "";
};

const patientDisplayName = (patient: Types.Patient | undefined, order: Types.Order) => {
  const name = [cleanText(patient?.firstName), cleanText(patient?.lastName)].filter(Boolean).join(" ");
  return name || cleanText(patient?.email) || cleanText(patient?.phone) || (order.practiceqClientId ? `PracticeQ Client ${order.practiceqClientId}` : `Order ${order.id.slice(-8)}`);
};

const patientSecondaryLine = (patient: Types.Patient | undefined, order: Types.Order) =>
  cleanText(patient?.email) || cleanText(patient?.phone) || order.id.slice(-8);

export default function OrdersManagement() {
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Types.Order | null>(null);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});
  const [products, setProducts] = useState<Record<string, Types.Product>>({});
  const [payments, setPayments] = useState<Record<string, Types.Payment>>({});
  const [pharmacyOrders, setPharmacyOrders] = useState<Record<string, Types.PharmacyOrder>>({});
  const [selectedPracticeQ, setSelectedPracticeQ] = useState<Types.PracticeQMirror | null>(null);
  const [selectedConsent, setSelectedConsent] = useState<Types.ConsentRecord | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<OrderDetailData["identity"] | null>(null);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<OrderDetailData["diagnostics"] | null>(null);
  const [practiceQLoading, setPracticeQLoading] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [paymentLink, setPaymentLink] = useState("");
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeclinedOrders, setShowDeclinedOrders] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    q: "",
  });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const response = await fetch(`/api/admin/dashboard?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as AdminDashboardData;
      const sortedOrders = [...data.orders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sortedOrders);
      setPatients(Object.fromEntries(data.patients.map((patient) => [patient.id, patient])));
      setProducts(Object.fromEntries(data.products.map((product) => [product.id, product])));
      setPayments(Object.fromEntries(data.payments.map((payment) => [payment.orderId, payment])));
      setPharmacyOrders(Object.fromEntries(data.pharmacyOrders.map((pharmacyOrder) => [pharmacyOrder.orderId, pharmacyOrder])));
      setSelectedOrder((current) => current ? sortedOrders.find((order) => order.id === current.id) ?? current : sortedOrders[0] ?? null);
      setPagination(data.pagination ?? { page, pageSize: 25, total: sortedOrders.length, totalPages: 1, q: searchQuery });
    } catch {
      const localOrders = db.orderDb.getAll().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(localOrders);
      setPatients(Object.fromEntries(localOrders.map((order) => [order.patientId, db.patientDb.getById(order.patientId)]).filter((entry) => entry[1])));
      setPayments(Object.fromEntries(localOrders.map((order) => [order.id, db.paymentDb.getByOrder(order.id)]).filter((entry) => entry[1])));
      setPharmacyOrders(Object.fromEntries(localOrders.map((order) => [order.id, db.pharmacyOrderDb.getByOrder(order.id)]).filter((entry) => entry[1])));
      setPagination({ page: 1, pageSize: 25, total: localOrders.length, totalPages: 1, q: "" });
    } finally {
      setLoading(false);
    }
  }, [page, pagination.pageSize, searchQuery]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    setPaymentLink("");
    if (!selectedOrder) {
      setSelectedPracticeQ(null);
      setSelectedConsent(null);
      setSelectedIdentity(null);
      setSelectedDiagnostics(null);
      return;
    }

    let cancelled = false;
    setPracticeQLoading(true);
    fetch(`/api/orders/${selectedOrder.id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Order detail unavailable");
        return (await response.json()) as OrderDetailData;
      })
      .then((detail) => {
        if (!cancelled) {
          setSelectedPracticeQ(detail.practiceq ?? null);
          setSelectedConsent(detail.consent ?? null);
          setSelectedIdentity(detail.identity ?? null);
          setSelectedDiagnostics(detail.diagnostics ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedPracticeQ(null);
          setSelectedConsent(null);
          setSelectedIdentity(null);
          setSelectedDiagnostics(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPracticeQLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  };

  const handleSendToPharmacy = async (order: Types.Order) => {
    try {
      const gate = getOrderDispatchGate(order);
      if (!gate.canDispatch) {
        setToast({
          message: !gate.identity.canDispatch
            ? "Identity must be verified or manually approved before pharmacy dispatch."
            : !gate.priorMed.canDispatch
              ? "Prior GLP-1 prescription proof must be approved before pharmacy dispatch."
              : "Back-to-back reorder must be approved before pharmacy dispatch.",
          type: "error",
        });
        return;
      }
      const patient = patients[order.patientId] ?? db.patientDb.getById(order.patientId);
      const product = products[order.productId] ?? db.productDb.getById(order.productId);
      const response = await fetch("/api/orders/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, patientData: patient, productData: product }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "Pharmacy dispatch failed");
      }

      await loadOrders();
      setToast({ message: "Order sent to pharmacy - patient notified via SMS.", type: "success" });
    } catch (error) {
      setToast({ message: (error as Error).message || "Error sending to pharmacy.", type: "error" });
    }
  };

  const handleAddTracking = async (order: Types.Order) => {
    if (!trackingNumber) return;
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Error adding tracking number.");
      }

      if (data.order) {
        setOrders((prev) => prev.map((item) => item.id === order.id ? data.order : item));
        setSelectedOrder((current) => current?.id === order.id ? data.order : current);
      } else {
        setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, pharmacyStatus: "shipped", status: "shipped" } : item));
      }
      if (data.pharmacy) {
        setPharmacyOrders((prev) => ({ ...prev, [order.id]: data.pharmacy }));
      }
      setTrackingNumber("");
      setShowForm(false);
      setToast({ message: "Tracking added - SMS sent to patient.", type: "success" });
      await loadOrders();
    } catch (error) {
      setToast({ message: (error as Error).message || "Error adding tracking number.", type: "error" });
    }
  };

  const handleApproveIdentity = async (order: Types.Order) => {
    try {
      const response = await fetch("/api/identity/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          reviewedBy: "admin",
          notes: "Manually approved by admin",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Identity approval failed");

      await loadOrders();
      setSelectedOrder((current) =>
        current?.id === order.id
          ? {
              ...current,
              identityStatus: "manual_approved",
              identityReason: "Manually approved by admin",
              identityReviewedAt: new Date().toISOString(),
              identityReviewedBy: "admin",
            }
          : current
      );
      setToast({ message: "Identity approved by admin.", type: "success" });
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    }
  };

  const handleCreatePaymentLink = async (order: Types.Order) => {
    setPaymentLinkLoading(true);
    try {
      const response = await fetch("/api/admin/orders/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Payment link creation failed");
      setPaymentLink(payload.url);
      try {
        await navigator.clipboard.writeText(payload.url);
        setToast({ message: "Payment link created and copied to clipboard.", type: "success" });
      } catch {
        setToast({ message: "Payment link created.", type: "success" });
      }
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    } finally {
      setPaymentLinkLoading(false);
    }
  };

  const handleResendIdentityReminder = async (order: Types.Order) => {
    try {
      const response = await fetch("/api/identity/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Verification reminder failed");
      setToast({ message: "Verification reminder sent to patient.", type: "success" });
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    }
  };

  const handleApprovePriorMed = async (order: Types.Order, action: "approve" | "deny") => {
    try {
      const response = await fetch("/api/prior-med/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          action,
          reviewedBy: "admin",
          notes: action === "approve" ? "Prior GLP-1 proof approved by admin" : "Prior GLP-1 proof rejected by admin",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Prior-med review failed");
      await loadOrders();
      setToast({
        message: action === "approve" ? "Prior GLP-1 proof approved." : "Prior GLP-1 proof rejected.",
        type: "success",
      });
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    }
  };

  const handleResendPriorMed = async (order: Types.Order) => {
    try {
      const response = await fetch("/api/prior-med/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Prescription upload reminder failed");
      setToast({ message: "Prescription upload request sent to patient.", type: "success" });
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    }
  };

  const handleReorderReview = async (order: Types.Order, action: "approve" | "reject") => {
    try {
      const response = await fetch("/api/reorder-review/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          action,
          reviewedBy: "admin",
          notes: action === "approve" ? "Early reorder approved by admin" : "Early reorder rejected by admin",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Reorder review failed");
      await loadOrders();
      setToast({
        message: action === "approve" ? "Early reorder approved." : "Early reorder rejected.",
        type: "success",
      });
    } catch (error) {
      setToast({ message: (error as Error).message, type: "error" });
    }
  };

  const selectedPayment = selectedOrder ? payments[selectedOrder.id] : null;
  const selectedPharmacyOrder = selectedOrder ? pharmacyOrders[selectedOrder.id] : null;
  const selectedTrackingNumber = selectedPharmacyOrder?.trackingNumber?.trim() ?? "";
  const selectedPatient = selectedOrder ? patients[selectedOrder.patientId] : undefined;
  const priorPrescriptionUploads = selectedIdentity?.uploads?.filter((upload) => upload.type === "prior_prescription") ?? [];
  const identityOnlyUploads = selectedIdentity?.uploads?.filter((upload) => upload.type !== "prior_prescription") ?? [];
  const selectedPriorMedStatus = selectedOrder?.priorMedStatus ?? "not_required";
  const selectedPriorMedGate = selectedOrder ? getPriorMedGate(selectedOrder) : null;
  const priorMedApplies = selectedPriorMedStatus !== "not_required";
  const selectedReorderStatus = selectedOrder?.reorderReviewStatus;
  const selectedPracticeQSkipped = selectedOrder ? isPracticeQSkippedForOrder(selectedOrder) : false;
  const selectedPracticeQAutomationError =
    selectedDiagnostics?.practiceqAutomation?.status === "completed"
      ? undefined
      : selectedDiagnostics?.practiceqAutomation?.lastError;
  const selectedSpruceMessages = selectedDiagnostics?.spruceMessages ?? [];
  const chartFileHref = (fileId: string) => ["/api/provider/", "practice", "q-files/", fileId].join("");
  const latestErroredLogs = selectedDiagnostics?.integrationLogs
    .filter((log) => log.status === "error")
    .filter((log) => !(selectedPracticeQSkipped && log.integrationName === "practiceq"))
    .slice(0, 3) ?? [];
  const visibleOrders = showDeclinedOrders
    ? orders
    : orders.filter((order) => order.paymentStatus !== "failed");

  useEffect(() => {
    if (!selectedOrder || visibleOrders.some((order) => order.id === selectedOrder.id)) return;
    setSelectedOrder(visibleOrders[0] ?? null);
  }, [selectedOrder, visibleOrders]);

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <Navbar variant="admin" />
        <div className="container-max py-8 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Order Management</h1>

          <Card className="mb-6">
            <CardContent className="p-4 sm:p-5">
              <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input
                    label="Search patients or orders"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Name, email, phone, order ID, status"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit">Search</Button>
                  {searchQuery && (
                    <Button type="button" variant="outline" onClick={clearSearch}>
                      Clear
                    </Button>
                  )}
                </div>
              </form>
              <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={showDeclinedOrders}
                  onChange={(event) => setShowDeclinedOrders(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-forest-800 focus:ring-forest-700"
                />
                Show payment declined
              </label>
              <p className="mt-3 text-sm text-gray-500">
                Showing {visibleOrders.length} of {orders.length} loaded orders
                {searchQuery ? ` for "${searchQuery}"` : ""}.
              </p>
            </CardContent>
          </Card>

          {loading && (
            <Card className="mb-6">
              <CardContent className="p-5 text-sm text-gray-600">Loading admin order data...</CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-8">
            <div className="min-w-0">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[34rem] overflow-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="sticky top-0 border-b bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Patient</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Product</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Order</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Payment</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">PracticeQ</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Pharmacy</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Identity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibleOrders.map((order) => {
                          const patient = patients[order.patientId];
                          const payment = payments[order.id];
                          const pharmacyOrder = pharmacyOrders[order.id];
                          const flaggedBackToBack = isBackToBackOrder(order, orders);
                          return (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className={`cursor-pointer hover:bg-gray-50 ${selectedOrder?.id === order.id ? "bg-green-50" : ""}`}
                            >
                              <td className="px-4 py-4 text-sm">
                                <p className="max-w-[11rem] truncate font-semibold text-gray-900">{patientDisplayName(patient, order)}</p>
                                <p className="max-w-[11rem] truncate text-xs text-gray-500">{patientSecondaryLine(patient, order)}</p>
                                {order.reorderReviewStatus === "flagged" ? (
                                  <Badge className="mt-1 bg-amber-100 text-amber-800">⚠ Reorder: needs review</Badge>
                                ) : order.reorderReviewStatus === "rejected" ? (
                                  <Badge className="mt-1 bg-red-100 text-red-800">Reorder rejected</Badge>
                                ) : flaggedBackToBack ? (
                                  <Badge className="mt-1 bg-amber-100 text-amber-800">⚠ Back-to-back</Badge>
                                ) : null}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                {(() => {
                                  const product = products[order.productId];
                                  const dose = product?.doses?.find((d) => d.id === order.doseId);
                                  return product ? (
                                    <>
                                      <p className="font-semibold text-gray-900 whitespace-nowrap">{product.name}</p>
                                      {dose && <p className="text-xs text-gray-500 whitespace-nowrap">{dose.strength ?? dose.label}</p>}
                                    </>
                                  ) : (
                                    <p className="text-xs text-gray-400 font-mono">{order.productId?.slice(-12) ?? "—"}</p>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <Badge className={getStatusColor(order.status)}>{getOrderStatusLabel(order)}</Badge>
                                <p className="mt-1 font-mono text-xs text-gray-500">{getDisplayOrderNumber(order, pharmacyOrder)}</p>
                                {pharmacyOrder?.lifeFileOrderId && <p className="text-[11px] text-gray-400">Order ID {order.id.slice(-8)}</p>}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <Badge className={getStatusColor(order.paymentStatus)}>{getStatusLabel(order.paymentStatus)}</Badge>
                                <div className="mt-1">
                                  <Badge className={getStatusColor(order.quickbooksStatus)}>{getStatusLabel(order.quickbooksStatus)}</Badge>
                                </div>
                                {payment?.transactionId && <p className="mt-1 max-w-[10rem] truncate text-xs text-gray-500">{payment.transactionId}</p>}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <Badge className={getStatusColor(getDisplayPracticeQStatus(order))}>{getStatusLabel(getDisplayPracticeQStatus(order))}</Badge>
                                {order.practiceqClientId && <p className="mt-1 text-xs text-gray-500">Client {order.practiceqClientId}</p>}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <Badge className={getStatusColor(order.pharmacyStatus)}>{getStatusLabel(order.pharmacyStatus)}</Badge>
                                {pharmacyOrder?.lifeFileOrderId && <p className="mt-1 max-w-[8rem] truncate text-xs text-gray-500">LF {pharmacyOrder.lifeFileOrderId}</p>}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <Badge className={getIdentityGate(order).canDispatch ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                                  {order.identityStatus ?? "missing"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-gray-500">
                      Page {pagination.page} of {pagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pagination.page <= 1 || loading}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pagination.page >= pagination.totalPages || loading}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {!selectedOrder ? (
                <Card>
                  <CardContent className="p-6 text-sm text-gray-500">
                    Select an order to view details, identity evidence, and PracticeQ linkage.
                  </CardContent>
                </Card>
              ) : (
                <>
                {(() => {
                  const prod = products[selectedOrder.productId];
                  const dose = prod?.doses?.find((d) => d.id === selectedOrder.doseId);
                  return prod ? (
                    <Card>
                      <CardContent className="p-6">
                        <h3 className="font-bold text-gray-900 mb-3">What Was Ordered</h3>
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 bg-white border border-gray-200 rounded-xl p-1.5">
                            {prod.image && (
                              <Image src={prod.image} alt={prod.name} width={32} height={52} className="object-contain" style={{ maxHeight: "52px", width: "auto" }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900">{prod.name}</p>
                            {dose && (
                              <>
                                <p className="text-sm text-gray-600">{dose.label}{dose.strength ? ` - ${dose.strength}` : ""}</p>
                                <p className="text-sm font-semibold text-forest-800">{formatCurrency(dose.price)} - 8-week supply</p>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Order Details</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>LifeFile order number:</strong> <span className="font-mono text-xs">{getDisplayOrderNumber(selectedOrder, selectedPharmacyOrder)}</span></p>
                      {selectedPharmacyOrder?.lifeFileOrderId && <p><strong>Order ID:</strong> <span className="font-mono text-xs">{selectedOrder.id.slice(-8)}</span></p>}
                      <p>
                        <strong>Status:</strong> {getOrderStatusLabel(selectedOrder)}
                        {selectedTrackingNumber && (
                          <>
                            {" "}
                            <span className="text-gray-400">|</span>{" "}
                            <strong>Tracking:</strong>{" "}
                            <a
                              href={getFedExTrackingUrl(selectedTrackingNumber)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-semibold text-forest-800 underline underline-offset-2 hover:text-forest-900"
                            >
                              {selectedTrackingNumber}
                            </a>
                          </>
                        )}
                      </p>
                      <p><strong>Created:</strong> {formatDateTime(selectedOrder.createdAt)}</p>
                      <p><strong>Identity:</strong> {selectedOrder.identityStatus ?? "missing"}</p>
                      {selectedOrder.identityReason && <p className="text-gray-600">{selectedOrder.identityReason}</p>}

                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                        <p><strong>Payment:</strong> {getStatusLabel(selectedOrder.paymentStatus)}</p>
                        {selectedPayment?.transactionId && <p><strong>QB payment tx:</strong> <span className="font-mono text-xs">{selectedPayment.transactionId}</span></p>}
                        <p><strong>QuickBooks:</strong> {getStatusLabel(selectedOrder.quickbooksStatus)}</p>
                        <p><strong>PracticeQ:</strong> {getStatusLabel(getDisplayPracticeQStatus(selectedOrder))}</p>
                        <p><strong>Pharmacy:</strong> {getStatusLabel(selectedOrder.pharmacyStatus)}</p>
                        {selectedPharmacyOrder?.lastError && <p className="text-red-600">{selectedPharmacyOrder.lastError}</p>}
                      </div>

                      {selectedPracticeQSkipped && (
                        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
                          PracticeQ was skipped for this reorder because a previous verified chart is already on file.
                        </div>
                      )}

                      {((selectedDiagnostics?.practiceqAutomation && !selectedPracticeQSkipped) || latestErroredLogs.length > 0) && (
                        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                          <p className="font-semibold text-gray-900">Latest Integration Details</p>
                          {latestErroredLogs.map((log) => (
                            <div key={log.id} className="mt-2 border-t border-gray-100 pt-2">
                              <p className="font-medium text-gray-800">
                                {log.integrationName}: {log.action}
                              </p>
                              {log.error && <p className="mt-1 text-red-700">{log.error}</p>}
                              {log.details && Object.keys(log.details).length > 0 && (
                                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] text-gray-600">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                          {selectedDiagnostics?.practiceqAutomation && !selectedPracticeQSkipped && (
                            <div className="mt-2 border-t border-gray-100 pt-2">
                              <p className="font-medium text-gray-800">PracticeQ Automation</p>
                              <p>Status: {selectedDiagnostics.practiceqAutomation.status}</p>
                              <p>Attempts: {selectedDiagnostics.practiceqAutomation.attempts}</p>
                              {selectedPracticeQAutomationError && (
                                <p className="text-red-700">{selectedPracticeQAutomationError}</p>
                              )}
                              {selectedDiagnostics.practiceqAutomation.handoffUrl && (
                                <a
                                  href={selectedDiagnostics.practiceqAutomation.handoffUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex font-medium text-forest-800 hover:text-forest-900"
                                >
                                  Open PracticeQ consent handoff
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {!getIdentityGate(selectedOrder).canDispatch && selectedOrder.paymentStatus === "completed" && (
                        <div className="mt-4 space-y-2">
                          <Button
                            fullWidth
                            variant="outline"
                            onClick={() => handleApproveIdentity(selectedOrder)}
                          >
                            Manually Approve Identity
                          </Button>
                          <Button
                            fullWidth
                            variant="outline"
                            onClick={() => handleResendIdentityReminder(selectedOrder)}
                          >
                            Resend Verification Reminder
                          </Button>
                        </div>
                      )}

                      {(selectedOrder.status === "approved" || selectedOrder.status === "pending_review") && (selectedOrder.pharmacyStatus === "draft" || selectedOrder.pharmacyStatus === "error") && (
                        <Button fullWidth className="mt-4" onClick={() => handleSendToPharmacy(selectedOrder)}>
                          Send to Pharmacy
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Patient Text Updates</h3>
                    {selectedSpruceMessages.length === 0 ? (
                      <p className="text-sm text-gray-500">No patient text updates have been recorded for this order.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedSpruceMessages.map((message) => (
                          <div key={message.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={getStatusColor(message.status)}>{getStatusLabel(message.status)}</Badge>
                              <span className="font-mono text-xs text-gray-500">{message.templateKey}</span>
                              <span className="text-xs text-gray-500">Created {formatDateTime(message.createdAt)}</span>
                              {message.sentAt && (
                                <span className="text-xs text-gray-500">Sent {formatDateTime(message.sentAt)}</span>
                              )}
                            </div>
                            <p className="mt-2 break-words text-gray-700">{message.messageText}</p>
                            <p className="mt-1 font-mono text-xs text-gray-500">{message.phoneNumber}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {selectedConsent && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Consent Certificate</h3>
                      <div className="rounded-xl border border-green-50 bg-green-50 p-3 text-sm text-forest-900">
                        {buildConsentCertificate(selectedConsent, selectedPatient)}
                      </div>
                      <div className="mt-4 space-y-2 text-sm">
                        <p><strong>Signed by:</strong> {selectedConsent.signedName}</p>
                        <p><strong>Signed at:</strong> {formatDateTime(selectedConsent.signedAt)}</p>
                        {selectedConsent.ipAddress && <p><strong>IP:</strong> {selectedConsent.ipAddress}</p>}
                        {selectedConsent.consentVersion && <p><strong>Version:</strong> {selectedConsent.consentVersion}</p>}
                        {selectedConsent.userAgent && <p className="break-words"><strong>Browser:</strong> {selectedConsent.userAgent}</p>}
                      </div>
                      <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                        {selectedConsent.consentText}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Identity Evidence</h3>
                    <div className="mb-4 space-y-2 text-sm">
                      <p><strong>Status:</strong> {selectedIdentity?.status ?? selectedOrder.identityStatus ?? "missing"}</p>
                      {(selectedIdentity?.reason || selectedOrder.identityReason) && (
                        <p className="text-gray-600">{selectedIdentity?.reason ?? selectedOrder.identityReason}</p>
                      )}
                      {selectedIdentity?.reviewedAt && (
                        <p className="text-xs text-gray-500">
                          Reviewed {formatDateTime(selectedIdentity.reviewedAt)}
                          {selectedIdentity.reviewedBy ? ` by ${selectedIdentity.reviewedBy}` : ""}
                        </p>
                      )}
                    </div>

                    {selectedIdentity?.aiResult ? (
                      <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                        <p className="font-semibold text-gray-900">AI Analysis</p>
                        <p className="mt-1 text-gray-700">{selectedIdentity.aiResult.summary}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge className={getStatusColor(selectedIdentity.aiResult.status)}>
                            {getStatusLabel(selectedIdentity.aiResult.status)}
                          </Badge>
                          <Badge className="bg-blue-100 text-blue-800">
                            {Math.round((selectedIdentity.aiResult.confidence ?? 0) * 100)}% confidence
                          </Badge>
                        </div>
                        {selectedIdentity.aiResult.flags?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase text-gray-500">Reasons / Flags</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-600">
                              {selectedIdentity.aiResult.flags.map((flag) => <li key={flag}>{flag}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mb-4 text-sm text-gray-500">No AI identity analysis has been recorded yet.</p>
                    )}

                    {identityOnlyUploads.length ? (
                      <div className="grid grid-cols-1 gap-3">
                        {identityOnlyUploads.map((upload) => (
                          <div key={upload.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">
                                {upload.type === "driver_license" ? "Submitted License" : "Identity Video"}
                              </p>
                              {upload.type === "selfie_video" ? <Video className="h-4 w-4 text-gray-400" /> : <ImageIcon className="h-4 w-4 text-gray-400" />}
                            </div>
                            <AdminIdentityUploadPreview upload={upload} />
                            <p className="mt-2 truncate text-xs text-gray-500">{upload.filename}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No ID or identity video has been submitted for this order.</p>
                    )}
                  </CardContent>
                </Card>

                {priorMedApplies && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Prior GLP-1 Proof</h3>
                      <div className="mb-4 space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">Status:</span>
                          <Badge className={selectedPriorMedGate?.canDispatch ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                            {selectedPriorMedStatus.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        {selectedOrder.priorMedReason && <p className="text-gray-600">{selectedOrder.priorMedReason}</p>}
                        {selectedOrder.priorMedReviewedAt && (
                          <p className="text-xs text-gray-500">
                            Reviewed {formatDateTime(selectedOrder.priorMedReviewedAt)}
                            {selectedOrder.priorMedReviewedBy ? ` by ${selectedOrder.priorMedReviewedBy}` : ""}
                          </p>
                        )}
                      </div>

                      {priorPrescriptionUploads.length ? (
                        <div className="mb-4 grid grid-cols-1 gap-3">
                          {priorPrescriptionUploads.map((upload) => (
                            <div key={upload.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                              <p className="mb-2 text-sm font-semibold text-gray-900">Uploaded prescription</p>
                              <AdminIdentityUploadPreview upload={upload} />
                              <p className="mt-2 truncate text-xs text-gray-500">{upload.filename}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-4 text-sm text-gray-500">The patient has not uploaded their previous prescription yet.</p>
                      )}

                      <div className="space-y-2">
                        {selectedPriorMedStatus === "submitted" && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button fullWidth onClick={() => handleApprovePriorMed(selectedOrder, "approve")}>
                              Approve Proof &amp; Continue
                            </Button>
                            <Button fullWidth variant="outline" onClick={() => handleApprovePriorMed(selectedOrder, "deny")}>
                              Reject Proof
                            </Button>
                          </div>
                        )}
                        {(selectedPriorMedStatus === "pending_upload" || selectedPriorMedStatus === "rejected") && (
                          <Button fullWidth variant="outline" onClick={() => handleResendPriorMed(selectedOrder)}>
                            Resend Prescription Upload Request
                          </Button>
                        )}
                        {selectedPriorMedStatus === "approved" && (
                          <p className="text-sm text-green-700">Prior GLP-1 proof approved — dispatch may proceed.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedReorderStatus && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Back-to-Back Reorder</h3>
                      <div className="mb-4 space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">Status:</span>
                          <Badge
                            className={
                              selectedReorderStatus === "approved"
                                ? "bg-green-100 text-green-800"
                                : selectedReorderStatus === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                            }
                          >
                            {selectedReorderStatus === "flagged" ? "needs review" : selectedReorderStatus}
                          </Badge>
                        </div>
                        {selectedOrder.reorderReviewReason && <p className="text-gray-600">{selectedOrder.reorderReviewReason}</p>}
                        {selectedOrder.reorderReviewedAt && (
                          <p className="text-xs text-gray-500">
                            Reviewed {formatDateTime(selectedOrder.reorderReviewedAt)}
                            {selectedOrder.reorderReviewedBy ? ` by ${selectedOrder.reorderReviewedBy}` : ""}
                          </p>
                        )}
                      </div>
                      {selectedReorderStatus === "flagged" && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button fullWidth onClick={() => handleReorderReview(selectedOrder, "approve")}>
                            Approve Reorder &amp; Continue
                          </Button>
                          <Button fullWidth variant="outline" onClick={() => handleReorderReview(selectedOrder, "reject")}>
                            Reject Reorder
                          </Button>
                        </div>
                      )}
                      {selectedReorderStatus === "approved" && (
                        <p className="text-sm text-green-700">Early reorder approved — dispatch may proceed.</p>
                      )}
                      {selectedReorderStatus === "rejected" && (
                        <p className="text-sm text-red-700">Early reorder rejected — dispatch remains blocked.</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">PracticeQ</h3>
                    {practiceQLoading ? (
                      <p className="text-sm text-gray-500">Loading PracticeQ details...</p>
                    ) : !selectedPracticeQ ? (
                      <p className="text-sm text-gray-500">No PracticeQ record is linked to this order.</p>
                    ) : !selectedPracticeQ.available ? (
                      <div className="space-y-2 text-sm">
                        <Badge className="bg-gray-100 text-gray-700">Unavailable</Badge>
                        <p className="text-gray-600">{selectedPracticeQ.reason}</p>
                        {selectedPracticeQ.clientId && <p className="font-mono text-xs text-gray-500">Client {selectedPracticeQ.clientId}</p>}
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <Badge className="bg-green-100 text-green-800">Connected</Badge>
                          {selectedPracticeQ.status && (
                            <Badge className={getStatusColor(selectedPracticeQ.status.toLowerCase())}>{selectedPracticeQ.status}</Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-gray-600">
                          {selectedPracticeQ.clientId && <p>Client ID: <span className="font-mono text-xs">{selectedPracticeQ.clientId}</span></p>}
                          {selectedPracticeQ.intakeId && <p>Intake ID: <span className="font-mono text-xs">{selectedPracticeQ.intakeId}</span></p>}
                          {selectedPracticeQ.questionnaireName && <p>Form: {selectedPracticeQ.questionnaireName}</p>}
                          {selectedPracticeQ.submittedAt && <p>Submitted: {formatDateTime(selectedPracticeQ.submittedAt)}</p>}
                        </div>
                        {selectedPracticeQ.practiceQUrl && (
                          <a
                            href={selectedPracticeQ.practiceQUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-sm font-medium text-forest-800 hover:text-forest-800"
                          >
                            Open in PracticeQ
                          </a>
                        )}
                        {(selectedPracticeQ.answerFileId || selectedPracticeQ.pdfFileId) && (
                          <div className="flex flex-wrap gap-2">
                            {selectedPracticeQ.answerFileId && (
                              <a
                                href={chartFileHref(selectedPracticeQ.answerFileId)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-green-50"
                              >
                                Answers JSON
                              </a>
                            )}
                            {selectedPracticeQ.pdfFileId && (
                              <a
                                href={chartFileHref(selectedPracticeQ.pdfFileId)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-green-50"
                              >
                                Chart PDF
                              </a>
                            )}
                          </div>
                        )}
                        {selectedPracticeQ.answers.length > 0 && (
                          <div className="border-t pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Answers</p>
                            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                              {selectedPracticeQ.answers.map((answer, index) => (
                                <div key={`${answer.question}-${index}`} className="rounded-lg bg-gray-50 p-2">
                                  <p className="text-xs font-medium text-gray-700">{answer.question}</p>
                                  <p className="text-xs text-gray-600">{answer.answer || "No answer"}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {(selectedOrder.status === "approved" || selectedOrder.status === "pending_review") && (selectedOrder.pharmacyStatus === "draft" || selectedOrder.pharmacyStatus === "error") && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-3">Pharmacy Dispatch</h3>
                      <Button fullWidth onClick={() => handleSendToPharmacy(selectedOrder)}>
                        Send to Pharmacy
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {selectedOrder.pharmacyStatus === "submitted" && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Add Tracking</h3>
                      {!showForm ? (
                        <Button fullWidth onClick={() => setShowForm(true)}>Add Tracking Number</Button>
                      ) : (
                        <div className="space-y-3">
                          <Input
                            label="Tracking Number"
                            value={trackingNumber}
                            onChange={(event) => setTrackingNumber(event.target.value)}
                            placeholder="784578178554"
                          />
                          <Button fullWidth onClick={() => handleAddTracking(selectedOrder)}>Submit Tracking</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedOrder.paymentStatus !== "completed" && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-2">Payment Recovery</h3>
                      <p className="mb-4 text-sm text-gray-600">
                        Send the patient a secure link to pay for this exact order without
                        redoing intake, questionnaire, or identity verification.
                      </p>
                      <Button fullWidth onClick={() => handleCreatePaymentLink(selectedOrder)} disabled={paymentLinkLoading}>
                        {paymentLinkLoading ? "Creating..." : "Create Payment Link"}
                      </Button>
                      {paymentLink && (
                        <div className="mt-3 space-y-2">
                          <p className="break-all rounded-xl border border-gray-100 bg-gray-50 p-3 font-mono text-xs text-gray-700">
                            {paymentLink}
                          </p>
                          <Button
                            fullWidth
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(paymentLink)
                                .then(() => setToast({ message: "Payment link copied.", type: "success" }))
                                .catch(() => setToast({ message: "Copy failed - select and copy the link manually.", type: "error" }));
                            }}
                          >
                            Copy Link
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedPayment && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-2">Payment</h3>
                      <p className="text-2xl font-bold text-forest-800">{formatCurrency(selectedPayment.amount)}</p>
                      <p className="text-xs text-gray-500 mb-2">
                        Card ending {selectedPayment.cardLast4}
                        {selectedPayment.transactionId ? ` - ${selectedPayment.transactionId}` : ""}
                      </p>
                      <Badge className={getStatusColor(selectedOrder.paymentStatus)}>{getStatusLabel(selectedOrder.paymentStatus)}</Badge>
                    </CardContent>
                  </Card>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

function AdminIdentityUploadPreview({ upload }: { upload: Types.Upload }) {
  const src = upload.base64Data || `/api/provider/uploads/${encodeURIComponent(upload.id)}`;
  if (!upload.base64Data && !upload.storageUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-white text-sm text-gray-500">
        Media is stored securely, but no preview URL is available.
      </div>
    );
  }

  if (upload.mimeType.startsWith("video/")) {
    return <video controls playsInline src={src} className="aspect-video w-full rounded-lg bg-white object-contain" />;
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-white">
      <Image
        src={src}
        alt={upload.type === "driver_license" ? "Submitted license" : "Submitted identity capture"}
        fill
        unoptimized
        className="object-contain"
      />
    </div>
  );
}
