"use client";

import { Navbar } from "@/components/layout/Navbar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SubscriptionsManager } from "@/components/subscriptions/SubscriptionsManager";

export default function ProviderSubscriptionsPage() {
  return (
    <ProtectedRoute allowedRoles={["provider", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <SubscriptionsManager patientHref={(patientId) => `/provider/patients/${patientId}`} />
      </div>
    </ProtectedRoute>
  );
}
