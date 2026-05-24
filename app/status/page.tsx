"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { getStatusLabel, getStatusColor, formatDateTime } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

export default function PatientStatus() {
  const [orders, setOrders] = useState<Types.Order[]>([]);
  const [patients, setPatients] = useState<Record<string, Types.Patient>>({});

  useEffect(() => {
    const allOrders = db.orderDb.getAll();
    setOrders(allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

    const patientMap: Record<string, Types.Patient> = {};
    allOrders.forEach((order) => {
      const patient = db.patientDb.getById(order.patientId);
      if (patient) patientMap[order.patientId] = patient;
    });
    setPatients(patientMap);
  }, []);

  const getStatusIcon = (status: string) => {
    if (
      status === "delivered" ||
      status === "fulfilled" ||
      status === "completed"
    ) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
    if (status === "rejected" || status === "error") {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="customer" />
      <div className="container-max py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">Order Status Tracker</h1>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-gray-600">No orders found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const patient = patients[order.patientId];
              const pharmacy = db.pharmacyOrderDb.getByOrder(order.id);
              const practiceq = db.practiceqDb.getByOrder(order.id);
              const messages = db.spruceDb.getByOrder(order.id);

              return (
                <Card key={order.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order {order.id.slice(-6)}
                        </h3>
                        {patient && (
                          <p className="text-sm text-gray-600">
                            {patient.firstName} {patient.lastName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(order.status)}
                        <Badge className={getStatusColor(order.status)}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 text-sm">
                      <div>
                        <p className="text-gray-600">Payment Status</p>
                        <Badge
                          className={getStatusColor(order.paymentStatus)}
                        >
                          {getStatusLabel(order.paymentStatus)}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-600">Provider Review</p>
                        <Badge
                          className={getStatusColor(order.practiceQStatus)}
                        >
                          {getStatusLabel(order.practiceQStatus)}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-600">Pharmacy</p>
                        <Badge
                          className={getStatusColor(order.pharmacyStatus)}
                        >
                          {getStatusLabel(order.pharmacyStatus)}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-gray-600">Created</p>
                        <p className="font-mono text-xs text-gray-700">
                          {formatDateTime(order.createdAt)}
                        </p>
                      </div>
                    </div>

                    {pharmacy?.trackingNumber && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm font-semibold text-green-900">
                          📦 Tracking: {pharmacy.trackingNumber}
                        </p>
                      </div>
                    )}

                    {messages.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-gray-900 mb-2">
                          Recent Updates ({messages.length})
                        </p>
                        <div className="space-y-1">
                          {messages.slice(-3).map((msg) => (
                            <p key={msg.id} className="text-xs text-gray-600">
                              • {msg.messageText}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
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
