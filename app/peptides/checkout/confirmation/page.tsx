"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

function Confirmation() {
  const searchParams = useSearchParams();
  const orderIds = (searchParams.get("orderIds") ?? "").split(",").filter(Boolean);

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <CheckCircle className="w-12 h-12 text-forest-700 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-forest-800 mb-2">Order Confirmed</h1>
        <p className="text-sm text-gray-600 mb-5">
          Thanks for your order. We&apos;ll ship it directly to the address you provided.
        </p>
        {orderIds.length > 0 && (
          <p className="text-xs text-gray-400 mb-6">
            Order reference{orderIds.length > 1 ? "s" : ""}: {orderIds.join(", ")}
          </p>
        )}
        <Link
          href="/peptides"
          className="inline-block bg-forest-800 hover:bg-forest-700 text-white font-bold px-6 py-3 rounded-full text-sm transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

export default function PeptideCheckoutConfirmation() {
  return (
    <Suspense fallback={null}>
      <Confirmation />
    </Suspense>
  );
}
