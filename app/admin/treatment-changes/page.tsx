"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { formatCurrency } from "@/lib/utils";
import type { Product, DoseOption } from "@/types";

type Row = { id: string; first_name: string; last_name: string; status: string; dose_id: string; doses: DoseOption[] };
const description = (d: DoseOption) => `${d.weeklyDoseMg ?? "See prescription"} mg weekly · ${d.strength} total supply · ${formatCurrency(d.price)} for ${d.durationWeeks} weeks`;

export default function TreatmentChanges() {
  const [rows, setRows] = useState<Row[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    const res = await fetch("/api/admin/treatment-changes", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load treatment changes.");
    const data = await res.json();
    setRows(data.subscriptions); setProduct(data.product); setLoaded(true);
  }
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  async function save(row: Row) {
    setBusy(row.id); setMessage("");
    try {
      const res = await fetch("/api/admin/treatment-changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: row.id, doseId: selection[row.id], providerName: provider[row.id], providerApproved: approved[row.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed.");
      await load();
      setMessage("Replacement saved. Billing is paused. Review the next billing date in Subscriptions before reactivating.");
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(""); }
  }
  return <div className="min-h-screen bg-gray-50"><Navbar variant="admin" />
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <h1 className="text-2xl font-bold">Retatrutide treatment changes</h1>
      <p>Select the replacement prescribed by the patient's provider. Saving updates the subscription and unpaid refills, clears one-time price adjustments, and pauses billing. No charge or shipment is created.</p>
      <Link className="underline" href="/admin/subscriptions">Manage subscriptions and billing dates</Link>
      {message && <p role="status" className="rounded bg-white p-4">{message}</p>}
      {!loaded && !message && <p>Loading…</p>}
      {loaded && !rows.length && <p>No active or paused Retatrutide subscriptions need a replacement.</p>}
      {rows.map(row => {
        const current = row.doses.find(d => d.id === row.dose_id);
        const selected = product?.doses.find(d => d.id === selection[row.id]);
        return <section key={row.id} className="rounded border bg-white p-5 space-y-3">
          <h2 className="text-lg font-semibold">{row.first_name} {row.last_name}</h2>
          <p>Current: Retatrutide — {current ? description(current) : row.dose_id} ({row.status})</p>
          <p className="font-semibold">Replacement: {selected ? `Tirzepatide — ${description(selected)}` : "Choose a prescription below"}</p>
          <label className="block">Provider-approved replacement
            <select className="block w-full border rounded p-2" value={selection[row.id] ?? ""} onChange={e => {setSelection({...selection, [row.id]: e.target.value}); setApproved({...approved, [row.id]: false});}}>
              <option value="">Select a dose</option>
              {product?.doses.map(d => <option key={d.id} value={d.id}>{description(d)}</option>)}
            </select>
          </label>
          <label className="block">Approving provider
            <input className="block border rounded p-2" value={provider[row.id] ?? ""} onChange={e => setProvider({...provider, [row.id]: e.target.value})} />
          </label>
          <label className="block"><input type="checkbox" checked={approved[row.id] ?? false} onChange={e => setApproved({...approved, [row.id]: e.target.checked})} /> I confirm the provider approved this replacement and weekly dose.</label>
          <button className="rounded bg-forest-800 text-white px-4 py-2 disabled:opacity-50" disabled={!!busy || !selected || !provider[row.id]?.trim() || !approved[row.id]} onClick={() => void save(row)}>{busy === row.id ? "Saving…" : "Save replacement and pause billing"}</button>
        </section>;
      })}
    </main>
  </div>;
}
