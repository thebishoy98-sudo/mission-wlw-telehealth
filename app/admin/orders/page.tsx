"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatCurrency, formatDateTime } from "@/lib/utils";
import * as lifefileService from "@/services/lifefile";
import * as spruceService from "@/services/spruce";
import { Toast } from "@/components/ui/Toast";
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";

export default function OrdersManagement() {
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Types.Order | null>(null);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});
  const [trackingNumber, setTrackingNumber] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const allOrders = db.orderDb.getAll();
    setOrders(
      allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );

    const patientMap: Record<string, Types.Patient> = {};
    allOrders.forEach((order) => {
      const patient = db.patientDb.getById(order.patientId);
      if (patient) patientMap[order.patientId] = patient;
    });
    setPatients(patientMap);
  }, []);

  const identityIcon = (status: Types.IdentityStatus | undefined) => {
    switch (status) {
      case "verified":        return <ShieldCheck className="w-4 h-4 text-green-500" />;
      case "manual_approved": return <ShieldCheck className="w-4 h-4 text-teal-500" />;
      case "needs_review":    return <ShieldAlert className="w-4 h-4 text-yellow-500" />;
      case "rejected":        return <ShieldX className="w-4 h-4 text-red-500" />;
      default:                return <Shield className="w-4 h-4 text-gray-300" />;
    }
  };

  const identityLabel = (status: Types.IdentityStatus | undefined) => {
    const labels: Record<string, string> = {
      verified: "Verified",
      manual_approved: "Manually Approved",
      needs_review: "Needs Review",
      rejected: "Rejected",
      missing: "Missing",
      pending: "Pending",
    };
    return labels[status ?? "missing"] ?? "Missing";
  };

  const handleApproveIdentity = (order: Types.Order) => {
    try {
      // Mark identity as manually approved
      db.orderDb.update(order.id, {
        identityStatus: "manual_approved",
        identityReviewedAt: new Date().toISOString(),
        identityReviewedBy: "admin",
        status: "sent_to_pharmacy",
      } as any);

      // Dispatch to pharmacy
      lifefileService.createPharmacyOrder(order);
      db.orderDb.update(order.id, { pharmacyStatus: "submitted" });

      // Notify patient
      const patient = db.patientDb.getById(order.patientId);
      if (patient) {
        spruceService.sendMessage(patient.id, "provider_approved", { orderId: order.id });
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, identityStatus: "manual_approved" as any, pharmacyStatus: "submitted" as any, status: "sent_to_pharmacy" as any }
            : o
        )
      );
      if (selectedOrder?.id === order.id) {
        setSelectedOrder((prev) => prev ? { ...prev, identityStatus: "manual_approved" as any, pharmacyStatus: "submitted" as any } : prev);
      }

      setToast({ message: "Identity approved — order dispatched to pharmacy.", type: "success" });
    } catch (error) {
      setToast({ message: "Error approving identity. Please try again.", type: "error" });
    }
  };

  const handleResendReminder = (order: Types.Order) => {
    try {
      const patient = db.patientDb.getById(order.patientId);
      if (!patient) throw new Error("Patient not found");
      spruceService.sendMessage(patient.id, "identity_verification_required", { orderId: order.id });
      setToast({ message: "Verification reminder SMS sent to patient.", type: "success" });
    } catch (error) {
      setToast({ message: "Error sending reminder. Please try again.", type: "error" });
    }
  };

  const handleSendToPharmacy = (order: Types.Order) => {
    try {
      const pharmacy = lifefileService.createPharmacyOrder(order);
      db.orderDb.update(order.id, { pharmacyStatus: "submitted" });

      // Send notification
      const patient = db.patientDb.getById(order.patientId);
      if (patient) {
        spruceService.sendMessage(patient.id, "sent_to_pharmacy", {
          orderId: order.id,
        });
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, pharmacyStatus: "submitted" as any }
            : o
        )
      );

      setToast({ message: "Order sent to pharmacy — patient notified via SMS.", type: "success" });
    } catch (error) {
      setToast({ message: "Error sending to pharmacy. Please try again.", type: "error" });
    }
  };

  const handleAddTracking = (order: Types.Order) => {
    if (!trackingNumber) return;

    try {
      lifefileService.addTrackingNumber(order.id, trackingNumber);

      const patient = db.patientDb.getById(order.patientId);
      if (patient) {
        spruceService.sendMessage(patient.id, "tracking", {
          trackingNumber,
          orderId: order.id,
        });
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, pharmacyStatus: "shipped" as any }
            : o
        )
      );

      setTrackingNumber("");
      setShowForm(false);
      setToast({ message: "Tracking added — SMS sent to patient.", type: "success" });
    } catch (error) {
      setToast({ message: "Error adding tracking number.", type: "error" });
    }
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Order Management</h1>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Order List */}
          <div className="md:col-span-2">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold">
                          Patient
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">
                          Identity
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold">
                          Pharmacy
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map((order) => {
                        const patient = patients[order.patientId];
                        return (
                          <tr
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className={`cursor-pointer hover:bg-gray-50 ${
                              selectedOrder?.id === order.id ? "bg-teal-50" : ""
                            }`}
                          >
                            <td className="px-6 py-4 text-sm">
                              <p className="font-semibold">
                                {patient
                                  ? `${patient.firstName} ${patient.lastName}`
                                  : "Unknown"}
                              </p>
                              <p className="text-xs text-gray-600">
                                {order.id.slice(-6)}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <Badge className={getStatusColor(order.status)}>
                                {getStatusLabel(order.status)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="flex items-center gap-1.5">
                                {identityIcon(order.identityStatus)}
                                <span className="text-xs text-gray-600">
                                  {identityLabel(order.identityStatus)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <Badge
                                className={getStatusColor(order.pharmacyStatus)}
                              >
                                {getStatusLabel(order.pharmacyStatus)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Details */}
          {selectedOrder && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-bold text-gray-900 mb-4">Order Details</h3>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>ID:</strong> {selectedOrder.id.slice(-6)}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      {getStatusLabel(selectedOrder.status)}
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {formatDateTime(selectedOrder.createdAt)}
                    </p>

                    {/* Identity status */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-1">
                        {identityIcon(selectedOrder.identityStatus)}
                        <span className="text-xs font-semibold text-gray-700">
                          Identity: {identityLabel(selectedOrder.identityStatus)}
                        </span>
                      </div>
                      {selectedOrder.identityReason && (
                        <p className="text-xs text-gray-500 ml-6">{selectedOrder.identityReason}</p>
                      )}
                      {(selectedOrder.identityAiResult as any)?.confidence !== undefined && (
                        <p className="text-xs text-gray-400 ml-6">
                          AI confidence: {Math.round(((selectedOrder.identityAiResult as any).confidence ?? 0) * 100)}%
                        </p>
                      )}
                      {(selectedOrder.identityAiResult as any)?.flags?.length > 0 && (
                        <ul className="ml-6 mt-1 space-y-0.5">
                          {((selectedOrder.identityAiResult as any).flags as string[]).map((f, i) => (
                            <li key={i} className="text-xs text-yellow-600">• {f}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Identity action buttons */}
                    {selectedOrder.identityStatus !== "verified" &&
                      selectedOrder.identityStatus !== "manual_approved" &&
                      selectedOrder.paymentStatus === "completed" && (
                        <div className="mt-4 space-y-2">
                          {selectedOrder.pharmacyStatus === "draft" && (
                            <Button
                              fullWidth
                              onClick={() => handleApproveIdentity(selectedOrder)}
                            >
                              <ShieldCheck className="w-4 h-4 mr-2" />
                              Approve Identity &amp; Dispatch
                            </Button>
                          )}
                          <Button
                            fullWidth
                            variant="outline"
                            onClick={() => handleResendReminder(selectedOrder)}
                          >
                            Resend Verification Reminder
                          </Button>
                        </div>
                      )}

                    {selectedOrder.status === "approved" && selectedOrder.pharmacyStatus === "draft" &&
                      (selectedOrder.identityStatus === "verified" || selectedOrder.identityStatus === "manual_approved") && (
                      <Button
                        fullWidth
                        className="mt-4"
                        onClick={() =>
                          handleSendToPharmacy(selectedOrder)
                        }
                      >
                        Send to Pharmacy
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {selectedOrder.pharmacyStatus === "submitted" && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-4">
                      Add Tracking
                    </h3>
                    {!showForm ? (
                      <Button
                        fullWidth
                        onClick={() => setShowForm(true)}
                      >
                        Add Tracking Number
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <Input
                          label="Tracking Number"
                          value={trackingNumber}
                          onChange={(e) =>
                            setTrackingNumber(e.target.value)
                          }
                          placeholder="UPS123456789"
                        />
                        <Button
                          fullWidth
                          onClick={() =>
                            handleAddTracking(selectedOrder)
                          }
                        >
                          Submit Tracking
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Payment Info */}
              {db.paymentDb.getByOrder(selectedOrder.id) && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-gray-900 mb-2">Payment</h3>
                    <p className="text-2xl font-bold text-teal-600">
                      {formatCurrency(
                        db.paymentDb.getByOrder(selectedOrder.id)?.amount || 0
                      )}
                    </p>
                    <Badge
                      className={getStatusColor(
                        selectedOrder.paymentStatus
                      )}
                    >
                      {getStatusLabel(
                        selectedOrder.paymentStatus
                      )}
                    </Badge>
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
