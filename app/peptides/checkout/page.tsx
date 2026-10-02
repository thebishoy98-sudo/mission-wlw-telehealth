"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Lock, CreditCard } from "lucide-react";
import * as Types from "@/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";
import { clearCart, getCart, type CartItem } from "@/lib/cart-store";
import { ShopTopBar } from "@/components/peptides/ShopTopBar";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

export default function PeptideCheckout() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Types.Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    street1: "", city: "", state: "", zipCode: "",
    cardNumber: "", cardExpiry: "", cardCvc: "",
  });

  useEffect(() => {
    setCart(getCart());
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => setProducts(((payload.products ?? []) as Types.Product[]).filter((p) => !!p.category)))
      .finally(() => setLoading(false));
  }, []);

  const lines = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const dose = product?.doses.find((d) => d.id === item.doseId);
      return { ...item, product, dose };
    }).filter((line) => line.product && line.dose);
  }, [cart, products]);

  const total = lines.reduce((sum, line) => sum + line.dose!.price * line.quantity, 0);

  const update = (field: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) return;
    setSubmitting(true);
    setError("");

    const [expMonth, expYear] = form.cardExpiry.split("/").map((s) => s.trim());
    const res = await fetch("/api/peptides/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        contact: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
        },
        shippingAddress: {
          street1: form.street1,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
          country: "USA",
        },
        card: {
          number: form.cardNumber.replace(/\s/g, ""),
          expMonth,
          expYear: expYear?.length === 2 ? `20${expYear}` : expYear,
          cvc: form.cardCvc,
          name: `${form.firstName} ${form.lastName}`,
        },
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      setError(result.error ?? "Checkout failed. Please check your details and try again.");
      setSubmitting(false);
      return;
    }

    clearCart();
    router.push(`/peptides/checkout/confirmation?orderIds=${encodeURIComponent(result.orderIds.join(","))}`);
  };

  if (!loading && lines.length === 0) {
    return (
      <div className="min-h-screen bg-cream-100">
        <ShopTopBar />
        <div className="flex items-center justify-center px-4 py-20">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
            <p className="text-gray-600 mb-4">Your cart is empty.</p>
            <Link href="/peptides" className="text-forest-800 font-semibold text-sm">
              Browse peptides &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <ShopTopBar />
      <div className="py-10 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto grid md:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-5">
          <h1 className="text-2xl font-bold text-forest-800">Checkout</h1>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Contact</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
              <Input label="Last Name" required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
            <Input label="Email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
            <Input label="Phone" type="tel" required value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Shipping Address</h2>
            <Input label="Street Address" required value={form.street1} onChange={(e) => update("street1", e.target.value)} />
            <div className="grid grid-cols-3 gap-4">
              <Input label="City" required value={form.city} onChange={(e) => update("city", e.target.value)} className="col-span-1" />
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">State</label>
                <select
                  required
                  value={form.state}
                  onChange={(e) => update("state", e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-800 text-sm"
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Input label="Zip Code" required value={form.zipCode} onChange={(e) => update("zipCode", e.target.value)} />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Payment</h2>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Lock className="w-3 h-3" /> Secure
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Card Number</label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  value={form.cardNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    update("cardNumber", digits.replace(/(.{4})/g, "$1 ").trim());
                  }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-800 font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry (MM/YY)</label>
                <input
                  type="text"
                  required
                  placeholder="12/26"
                  maxLength={5}
                  value={form.cardExpiry}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, "");
                    if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                    update("cardExpiry", v);
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-800 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CVV</label>
                <input
                  type="password"
                  required
                  placeholder="&bull;&bull;&bull;"
                  maxLength={4}
                  value={form.cardCvc}
                  onChange={(e) => update("cardCvc", e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-800 font-mono text-sm"
                />
              </div>
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-fit space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>
          <div className="space-y-3">
            {lines.map((line) => (
              <div key={`${line.productId}_${line.doseId}`} className="flex items-center gap-3">
                <div className="shrink-0 bg-gray-50 rounded-lg p-1">
                  <Image src={line.product!.image} alt={line.product!.name} width={24} height={40} className="object-contain" style={{ maxHeight: "40px", width: "auto" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{line.product!.name}</div>
                  <div className="text-xs text-gray-400">Qty {line.quantity}</div>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(line.dose!.price * line.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-xl font-bold text-forest-800">{formatCurrency(total)}</span>
          </div>
          <Button type="submit" fullWidth disabled={submitting || !lines.length}>
            {submitting ? "Processing..." : `Pay ${formatCurrency(total)}`}
          </Button>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Research/wellness peptides shipped directly — no clinical review is performed on this order.
          </p>
        </div>
      </form>
      </div>
    </div>
  );
}
