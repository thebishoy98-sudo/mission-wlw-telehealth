"use client";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Copy, Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";

type Affiliate = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  clicks: number;
  conversions: number;
  revenue: number;
};

type AffiliateOrder = {
  id: string;
  status: string;
  payment_status: string;
  product_id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  amount: number | null;
  pay_status: string | null;
};

function AffiliatesContent() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<{ code: string; link: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [salesMap, setSalesMap] = useState<Record<string, AffiliateOrder[]>>({});
  const [salesLoading, setSalesLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/affiliates", { cache: "no-store" });
    const d = await r.json();
    setAffiliates(d.affiliates ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    setNewLink(null);
    try {
      const r = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setNewLink({ code: d.affiliate.code, link: d.link });
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleSales = async (a: Affiliate) => {
    if (expanded === a.code) { setExpanded(null); return; }
    setExpanded(a.code);
    if (salesMap[a.code]) return; // already loaded
    setSalesLoading(a.code);
    try {
      const r = await fetch(`/api/admin/affiliates?code=${encodeURIComponent(a.code)}`, { cache: "no-store" });
      const d = await r.json();
      setSalesMap((prev) => ({ ...prev, [a.code]: d.orders ?? [] }));
    } finally {
      setSalesLoading(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this affiliate link?")) return;
    await fetch(`/api/admin/affiliates?id=${id}`, { method: "DELETE" });
    await load();
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Affiliate Links</h1>
          <p className="text-gray-500 text-sm">Issue trackable links, monitor clicks and conversions.</p>
        </div>

        {/* Issue new link */}
        <Card className="mb-8">
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Issue New Affiliate Link
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Affiliate name (e.g. Dr. Smith, FitnessBlog)"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && void create()}
              />
              <Button onClick={() => void create()} disabled={creating || !name.trim()} className="sm:w-36">
                {creating ? "Creating…" : "Issue Link"}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            {newLink && (
              <div className="mt-4 p-4 bg-forest-50 border border-forest-200 rounded-xl">
                <p className="text-sm font-semibold text-forest-800 mb-1">Link issued for <code>{newLink.code}</code>:</p>
                <div className="flex items-center gap-2 bg-white border border-forest-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700 flex-1 truncate font-mono">{newLink.link}</span>
                  <button
                    onClick={() => copy(newLink.link, "new")}
                    className="text-forest-700 hover:text-forest-900 shrink-0"
                  >
                    {copied === "new" ? <span className="text-xs font-bold text-green-600">Copied!</span> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats summary */}
        {affiliates.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Clicks", value: affiliates.reduce((s, a) => s + Number(a.clicks), 0) },
              { label: "Conversions", value: affiliates.reduce((s, a) => s + Number(a.conversions), 0) },
              { label: "Revenue", value: formatCurrency(affiliates.reduce((s, a) => s + Number(a.revenue), 0)), isRevenue: true },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-forest-800">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Affiliate table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : affiliates.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No affiliate links yet. Issue one above.</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Link</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Clicks</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Orders</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Revenue</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {affiliates.map((a) => {
                      const link = `${baseUrl}?ref=${a.code}`;
                      const cvr = Number(a.clicks) > 0
                        ? ((Number(a.conversions) / Number(a.clicks)) * 100).toFixed(1) + "%"
                        : "—";
                      const isOpen = expanded === a.code;
                      const orders = salesMap[a.code];
                      return (
                        <>
                        <tr key={a.id} className={`hover:bg-gray-50 cursor-pointer ${isOpen ? "bg-gray-50" : ""}`} onClick={() => void toggleSales(a)}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                              <div>
                                <p className="font-semibold text-gray-900">{a.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{a.code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 max-w-xs">
                              <span className="text-xs text-gray-500 font-mono truncate">{link}</span>
                              <button onClick={() => copy(link, a.id)} className="shrink-0 text-gray-400 hover:text-forest-700">
                                {copied === a.id
                                  ? <span className="text-xs font-bold text-green-600">✓</span>
                                  : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-semibold">{Number(a.clicks)}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-semibold text-forest-800">{Number(a.conversions)}</span>
                            <span className="block text-xs text-gray-400">{cvr} cvr</span>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-forest-800">
                            {formatCurrency(Number(a.revenue))}
                          </td>
                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => void remove(a.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${a.id}-sales`}>
                            <td colSpan={6} className="bg-gray-50 px-4 pb-4 pt-0">
                              {salesLoading === a.code ? (
                                <p className="text-sm text-gray-400 py-3">Loading sales...</p>
                              ) : !orders || orders.length === 0 ? (
                                <p className="text-sm text-gray-400 py-3">No orders through this link yet.</p>
                              ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden mt-1">
                                  <table className="w-full text-sm">
                                    <thead className="bg-white border-b">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Patient</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Amount</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y bg-white">
                                      {orders.map((o) => (
                                        <tr key={o.id}>
                                          <td className="px-3 py-2.5">
                                            <p className="font-medium text-gray-900">{[o.first_name, o.last_name].filter(Boolean).join(" ") || "Unknown"}</p>
                                            <p className="text-xs text-gray-400">{o.email}</p>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <p className="text-xs text-gray-500 font-mono">{o.product_id?.replace("product_", "") ?? "-"}</p>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <Badge className={getStatusColor(o.status)}>{getStatusLabel(o.status)}</Badge>
                                          </td>
                                          <td className="px-3 py-2.5 text-right font-semibold text-forest-800">
                                            {o.amount != null ? formatCurrency(Number(o.amount)) : "-"}
                                          </td>
                                          <td className="px-3 py-2.5 text-xs text-gray-500">{formatDateTime(o.created_at)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </>
                      );
                    })}
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

export default function AffiliatesPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AffiliatesContent />
    </ProtectedRoute>
  );
}
