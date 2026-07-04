"use client";

import { Navbar } from "@/components/layout/Navbar";
import { SubscriptionsManager } from "@/components/subscriptions/SubscriptionsManager";

export default function AdminSubscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <SubscriptionsManager />
    </div>
  );
}
