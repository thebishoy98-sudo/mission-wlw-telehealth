"use client";

import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatCurrency, formatDateTime } from "@/lib/utils";
import * as spruceService from "@/services/spruce";
import { Toast } from "@/components/ui/Toast";
import { getIdentityGate } from "@/lib/identity";

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

export default function OrdersManagement() {
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Types.Order | null>(null);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});
  const [products, setProducts] = useState<Record<string, Types.Product>>({});
  const [payments, setPayments] = useState<Record<string, Types.Payment>>({});
  const [pharmacyOrders, setPharmacyOrders] = useState<Record<string, Types.PharmacyOrder>>({});
  const [trackingNumber, setTrackingNumber] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
      setSelectedOrder((current) => current ? sortedOrders.find((order) => order.id === current.id) ?? current : current);
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
      if (!getIdentityGate(order).canDispatch) {
        setToast({ message: "Identity must be verified or manually approved before pharmacy dispatch.", type: "error" });
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

      if (patient) {
        spruceService.sendMessage(patient.id, "sent_to_pharmacy", { orderId: order.id });
      }
      await loadOrders();
      setToast({ message: "Order sent to pharmacy - patient notified via SMS.", type: "success" });
    } catch (error) {
      setToast({ message: (error as Error).message || "Error sending to pharmacy.", type: "error" });
    }
  };

  const handleAddTracking = (order: Types.Order) => {
    if (!trackingNumber) return;
    try {
      const pharmacyOrder = pharmacyOrders[order.id] ?? db.pharmacyOrderDb.getByOrder(order.id);
      if (!pharmacyOrder) {
        setToast({ message: "No pharmacy order found for tracking.", type: "error" });
        return;
      }

      db.pharmacyOrderDb.update(pharmacyOrder.id, {
        trackingNumber,
        status: "shipped",
        shippedAt: new Date().toISOString(),
      });

      const patient = patients[order.patientId] ?? db.patientDb.getById(order.patientId);
      if (patient) {
        spruceService.sendMessage(patient.id, "tracking", { trackingNumber, orderId: order.id });
      }

      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, pharmacyStatus: "shipped" } : item));
      setTrackingNumber("");
      setShowForm(false);
      setToast({ message: "Tracking added - SMS sent to patient.", type: "success" });
    } catch {
      setToast({ message: "Error adding tracking number.", type: "error" });
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

  const selectedPayment = selectedOrder ? payments[selectedOrder.id] : null;
  const selectedPharmacyOrder = selectedOrder ? pharmacyOrders[selectedOrder.id] : null;

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
              <p className="mt-3 text-sm text-gray-500">
                Showing {orders.length} of {pagination.total} matching orders
                {searchQuery ? ` for "${searchQuery}"` : ""}.
              </p>
            </CardContent>
          </Card>

          {loading && (
            <Card className="mb-6">
              <CardContent className="p-5 text-sm text-gray-600">Loading admin order data...</CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[32rem] overflow-auto">
                    <table className="w-full min-w-[760px]">
                      <thead className="sticky top-0 border-b bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-semibold">Patient</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold">Payment / QB</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold">Pharmacy</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold">Identity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {orders.map((order) => {
                          const patient = patients[order.patientId];
                          const payment = payments[order.id];
                          const pharmacyOrder = pharmacyOrders[order.id];
                          return (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className={`cursor-pointer hover:bg-gray-50 ${selectedOrder?.id === order.id ? "bg-teal-50" : ""}`}
                            >
                              <td className="px-6 py-4 text-sm">
                                <p className="font-semibold">{patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"}</p>
                                <p className="text-xs text-gray-500">{order.id.slice(-8)}</p>
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <Badge className={getStatusColor(order.paymentStatus)}>{getStatusLabel(order.paymentStatus)}</Badge>
                                <div className="mt-1">
                                  <Badge className={getStatusColor(order.quickbooksStatus)}>{getStatusLabel(order.quickbooksStatus)}</Badge>
                                </div>
                                {payment?.transactionId && <p className="mt-1 text-xs text-gray-500">{payment.transactionId}</p>}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <Badge className={getStatusColor(order.pharmacyStatus)}>{getStatusLabel(order.pharmacyStatus)}</Badge>
                                {pharmacyOrder?.lifeFileOrderId && <p className="mt-1 text-xs text-gray-500">LF {pharmacyOrder.lifeFileOrderId}</p>}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <Badge className={getIdentityGate(order).canDispatch ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
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

            {selectedOrder && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Order Details</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>ID:</strong> {selectedOrder.id.slice(-8)}</p>
                      <p><strong>Status:</strong> {getStatusLabel(selectedOrder.status)}</p>
                      <p><strong>Created:</strong> {formatDateTime(selectedOrder.createdAt)}</p>
                      <p><strong>Identity:</strong> {selectedOrder.identityStatus ?? "missing"}</p>
                      {selectedOrder.identityReason && <p className="text-gray-600">{selectedOrder.identityReason}</p>}

                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                        <p><strong>Payment:</strong> {getStatusLabel(selectedOrder.paymentStatus)}</p>
                        {selectedPayment?.transactionId && <p><strong>QB payment tx:</strong> <span className="font-mono text-xs">{selectedPayment.transactionId}</span></p>}
                        <p><strong>QuickBooks:</strong> {getStatusLabel(selectedOrder.quickbooksStatus)}</p>
                        <p><strong>Pharmacy:</strong> {getStatusLabel(selectedOrder.pharmacyStatus)}</p>
                        {selectedPharmacyOrder?.lifeFileOrderId && <p><strong>LifeFile ID:</strong> <span className="font-mono text-xs">{selectedPharmacyOrder.lifeFileOrderId}</span></p>}
                        {selectedPharmacyOrder?.lastError && <p className="text-red-600">{selectedPharmacyOrder.lastError}</p>}
                      </div>

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
                            placeholder="UPS123456789"
                          />
                          <Button fullWidth onClick={() => handleAddTracking(selectedOrder)}>Submit Tracking</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedPayment && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-gray-900 mb-2">Payment</h3>
                      <p className="text-2xl font-bold text-teal-600">{formatCurrency(selectedPayment.amount)}</p>
                      <p className="text-xs text-gray-500 mb-2">
                        Card ending {selectedPayment.cardLast4}
                        {selectedPayment.transactionId ? ` - ${selectedPayment.transactionId}` : ""}
                      </p>
                      <Badge className={getStatusColor(selectedOrder.paymentStatus)}>{getStatusLabel(selectedOrder.paymentStatus)}</Badge>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
