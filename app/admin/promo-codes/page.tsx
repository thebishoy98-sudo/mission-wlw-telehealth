"use client";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatCurrency } from "@/lib/utils";
import { Trash2, Plus, ToggleLeft, ToggleRight } from "lucide-react";

type PromoCode = {
  id: string;
  code: string;
  type: "flat" | "percent";
  amount: number;
  active: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
};

function PromoCodesContent() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"flat" | "percent">("flat");
  const [newAmount, setNewAmount] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/promo-codes", { cache: "no-store" });
    const d = await r.json();
    setCodes(d.codes ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newCode.trim() || !newAmount) return;
    setCreating(true);
    setError("");
    try {
      const r = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          type: newType,
          amount: newAmount,
          maxUses: newMaxUses || undefined,
          expiresAt: newExpiry || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setNewCode("");
      setNewAmount("");
      setNewMaxUses("");
      setNewExpiry("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/promo-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this promo code?")) return;
    await fetch(`/api/admin/promo-codes?id=${id}`, { method: "DELETE" });
    await load();
  };

  const formatDiscount = (code: PromoCode) =>
    code.type === "flat" ? formatCurrency(Number(code.amount)) + " off" : `${code.amount}% off`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Promo Codes</h1>
          <p className="text-gray-500 text-sm">Create and manage discount codes for patient checkout.</p>
        </div>

        {/* Create new code */}
        <Card className="mb-8">
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create New Code
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Code (e.g. SUMMER50)"
                label="Code"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as "flat" | "percent")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
                >
                  <option value="flat">Flat ($)</option>
                  <option value="percent">Percent (%)</option>
                </select>
              </div>
              <Input
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder={newType === "flat" ? "50" : "10"}
                label={newType === "flat" ? "Amount ($)" : "Percent (%)"}
                type="number"
                min="1"
              />
              <Input
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
                placeholder="Unlimited"
                label="Max Uses (optional)"
                type="number"
                min="1"
              />
              <Input
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                label="Expires At (optional)"
                type="date"
              />
            </div>
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            <Button onClick={() => void create()} disabled={creating || !newCode.trim() || !newAmount}>
              {creating ? "Creating..." : "Create Code"}
            </Button>
          </CardContent>
        </Card>

        {/* Codes table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No promo codes yet. Create one above.</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Discount</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Uses</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Expires</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {codes.map((c) => (
                      <tr key={c.id} className={`hover:bg-gray-50 ${!c.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-4 font-mono font-bold text-forest-800">{c.code}</td>
                        <td className="px-4 py-4 text-gray-700">{formatDiscount(c)}</td>
                        <td className="px-4 py-4 text-right text-gray-600">
                          {c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}
                        </td>
                        <td className="px-4 py-4 text-gray-500 text-xs">
                          {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => void toggle(c.id, !c.active)}
                            className={`transition-colors ${c.active ? "text-forest-700" : "text-gray-300"}`}
                          >
                            {c.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <button onClick={() => void remove(c.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function PromoCodesPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <PromoCodesContent />
    </ProtectedRoute>
  );
}
