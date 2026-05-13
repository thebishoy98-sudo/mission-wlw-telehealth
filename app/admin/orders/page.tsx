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

                    {selectedOrder.status === "approved" && selectedOrder.pharmacyStatus === "draft" && (
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
