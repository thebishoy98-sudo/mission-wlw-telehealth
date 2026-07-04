"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";
import { RefreshCw, CheckCircle2, CreditCard } from "lucide-react";

type RefillOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  pharmacyStatus: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

type DoseOption = { id: string; label: string; price: number };

type SubscriptionRow = {
  id: string;
  status: string;
  patientId: string;
  patientName: string;
  productName: string;
  doseId: string;
  doseLabel: string;
  doses: DoseOption[];
  intervalDays: number;
  coversThrough: string | null;
  nextRunAt: string | null;
  lastChargedAt: string | null;
  dueForReview: boolean;
  hasCardOnFile: boolean;
  cardLast4: string | null;
  orders: RefillOrder[];
};

type ManageAction = "cancel" | "pause" | "resume" | "reactivate" | "skip";

/**
 * Shared subscription management UI used by both the provider and admin tabs.
 * Renders the <main> content only — the host page supplies its own Navbar and
 * route protection. `patientHref` controls where patient links point.
 */
export function SubscriptionsManager({
  patientHref,
}: {
  patientHref?: (patientId: string) => string;
}) {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acking, setAcking] = useState("");
  const [managing, setManaging] = useState("");
  const [enrollPhone, setEnrollPhone] = useState("");
  const [enrollMsg, setEnrollMsg] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  // Charge-only (over-shipment correction) form state, keyed to the open row.
  const [adjustId, setAdjustId] = useState("");
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  // 7-week dose-review state, keyed to the subscription being sent.
  const [reviewDose, setReviewDose] = useState<Record<string, string>>({});
  const [reviewSaving, setReviewSaving] = useState("");
  const [supplementId, setSupplementId] = useState("");
  const [supplementOverride, setSupplementOverride] = useState("");
  const [supplementReason, setSupplementReason] = useState("");
  const [supplementSaving, setSupplementSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load subscriptions: ${res.status}`);
      const data = await res.json();
      setRows(data.subscriptions ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const manage = async (action: ManageAction, subscriptionId: string) => {
    const confirms: Partial<Record<ManageAction, string>> = {
      cancel: "Unenroll this patient? Future auto-refills will stop.",
      skip: "Skip this round? The next charge and shipment move out by one cycle (~8 weeks).",
      reactivate: "Reactivate this subscription on a fresh 8-week cycle?",
    };
    if (confirms[action] && !window.confirm(confirms[action])) return;
    setManaging(subscriptionId + action);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, subscriptionId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${action} failed`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setManaging("");
    }
  };

  const enroll = async () => {
    if (!enrollPhone.trim()) return;
    setEnrolling(true);
    setEnrollMsg("");
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enroll", phone: enrollPhone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Enroll failed");
      setEnrollMsg(
        data.alreadyActive
          ? "That patient is already actively subscribed."
          : data.mode === "activated"
            ? "Subscription activated (card on file)."
            : "No card on file — texted the patient a pay + save-card enrollment link."
      );
      setEnrollPhone("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnrolling(false);
    }
  };

  const openAdjust = (sub: SubscriptionRow) => {
    if (adjustId === sub.id) {
      setAdjustId("");
      return;
    }
    setAdjustId(sub.id);
    // Default the charge date to this sub's next scheduled run (the 7-week mark).
    setAdjustDate(sub.nextRunAt ? sub.nextRunAt.slice(0, 10) : "");
    setAdjustAmount("");
    setAdjustNote("");
  };

  const scheduleChargeOnly = async (subscriptionId: string) => {
    setAdjustSaving(true);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule_charge_only",
          subscriptionId,
          nextRunAt: adjustDate || undefined,
          overrideAmount: adjustAmount.trim() || undefined,
          note: adjustNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Schedule failed");
      setAdjustId("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdjustSaving(false);
    }
  };

  const saveDose = async (sub: SubscriptionRow) => {
    const doseId = reviewDose[sub.id] ?? sub.doseId;
    if (doseId === sub.doseId) return;
    setReviewSaving(sub.id);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_dose", subscriptionId: sub.id, doseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Dose update failed");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReviewSaving("");
    }
  };

  const openSupplement = (sub: SubscriptionRow) => {
    if (supplementId === sub.id) {
      setSupplementId("");
      return;
    }
    setSupplementId(sub.id);
    setSupplementOverride("");
    setSupplementReason("");
    const currentIndex = sub.doses.findIndex((dose) => dose.id === sub.doseId);
    const nextDose = sub.doses[currentIndex + 1];
    if (nextDose) {
      setReviewDose((previous) => ({ ...previous, [sub.id]: nextDose.id }));
    }
  };

  const chargeSupplement = async (sub: SubscriptionRow) => {
    const doseId = reviewDose[sub.id] ?? sub.doseId;
    if (doseId === sub.doseId) return;
    if (!window.confirm(
      "This will charge the saved card and dispatch supplemental medication at the selected dose. Continue?"
    )) return;
    setSupplementSaving(true);
    setError("");
    try {
      const res = await fetch("/api/provider/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "charge_dose_adjustment",
          subscriptionId: sub.id,
          doseId,
          overrideAmount: supplementOverride.trim() || undefined,
          overrideReason: supplementReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Supplemental charge failed");
      setSupplementId("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSupplementSaving(false);
    }
  };

  const acknowledge = async (orderId: string) => {
    setAcking(orderId);
    try {
      const res = await fetch("/api/provider/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "acknowledge_refill" }),
      });
      if (!res.ok) throw new Error(`Acknowledge failed: ${res.status}`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAcking("");
    }
  };

  const active = rows.filter((r) => r.status === "active");
  const inactive = rows.filter((r) => r.status !== "active");

  const btn = "rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50";
  const nameNode = (sub: SubscriptionRow) =>
    patientHref ? (
      <Link href={patientHref(sub.patientId)} className="font-semibold text-gray-900 hover:text-forest-700 hover:underline">
        {sub.patientName}
      </Link>
    ) : (
      <span className="font-semibold text-gray-900">{sub.patientName}</span>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <RefreshCw className="h-6 w-6 text-forest-700" /> Auto-Refill Subscriptions
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Everyone on recurring 8-week treatment. Enroll or unenroll patients, skip a patient&apos;s
            next round, or reactivate a cancelled plan.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Manually enroll a patient</h2>
        <p className="mt-1 text-xs text-gray-500">
          Enter the patient&apos;s phone. If they have a card on file we activate the subscription now;
          otherwise we text them a pay + save-card enrollment link.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={enrollPhone}
            onChange={(e) => setEnrollPhone(e.target.value)}
            placeholder="(732) 555-0123"
            className="w-56 rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
          />
          <Button onClick={() => void enroll()} disabled={enrolling || !enrollPhone.trim()}>
            {enrolling ? "Working…" : "Enroll patient"}
          </Button>
          {enrollMsg && <span className="text-sm text-forest-800">{enrollMsg}</span>}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
          Loading subscriptions…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
          No subscriptions yet. Patients enroll when they pay through a &quot;save card&quot; link.
        </div>
      ) : (
        <div className="space-y-4">
          {[...active, ...inactive].map((sub) => (
            <Card key={sub.id}>
              <CardContent className="p-5">
                {sub.dueForReview && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Week-seven billing is due. The saved card and current refill dose are processed automatically.
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {nameNode(sub)}
                      <Badge variant={sub.status === "active" ? "success" : "default"}>{sub.status}</Badge>
                      {sub.hasCardOnFile ? (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <CreditCard className="h-3.5 w-3.5" /> card •••• {sub.cardLast4 ?? "????"}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">no card on file (pay-link)</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {sub.productName} — {sub.doseLabel}
                    </p>
                    {sub.status === "active" && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="text-xs font-medium text-gray-700">
                          Automatic refill dose
                          <select
                            value={reviewDose[sub.id] ?? sub.doseId}
                            onChange={(e) => setReviewDose((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                            className="mt-1 block rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
                          >
                            {sub.doses.map((dose) => (
                              <option key={dose.id} value={dose.id}>
                                {dose.label} — ${dose.price.toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          variant="outline"
                          onClick={() => void saveDose(sub)}
                          disabled={reviewSaving === sub.id || (reviewDose[sub.id] ?? sub.doseId) === sub.doseId}
                        >
                          {reviewSaving === sub.id ? "Saving…" : "Save dose"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>Next billing: <span className="font-medium text-gray-800">{sub.nextRunAt ? formatDateTime(sub.nextRunAt) : "—"}</span></p>
                    <p>Supply through: {sub.coversThrough ? formatDateTime(sub.coversThrough) : "—"}</p>
                    <p>Last charged: {sub.lastChargedAt ? formatDateTime(sub.lastChargedAt) : "—"}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {sub.status === "active" && (
                        <>
                          <button
                            type="button"
                            onClick={() => void manage("skip", sub.id)}
                            disabled={managing === sub.id + "skip"}
                            className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
                          >
                            {managing === sub.id + "skip" ? "…" : "Skip this round"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdjust(sub)}
                            className={`${btn} ${adjustId === sub.id ? "border-forest-400 bg-forest-50 text-forest-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                          >
                            Charge-only refill
                          </button>
                          <button
                            type="button"
                            onClick={() => openSupplement(sub)}
                            disabled={!sub.hasCardOnFile || !sub.lastChargedAt}
                            className={`${btn} ${supplementId === sub.id ? "border-forest-400 bg-forest-50 text-forest-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                          >
                            Increase dose / add medication
                          </button>
                          <button
                            type="button"
                            onClick={() => void manage("pause", sub.id)}
                            disabled={managing === sub.id + "pause"}
                            className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
                          >
                            {managing === sub.id + "pause" ? "…" : "Pause"}
                          </button>
                        </>
                      )}
                      {sub.status === "paused" && (
                        <button
                          type="button"
                          onClick={() => void manage("resume", sub.id)}
                          disabled={managing === sub.id + "resume"}
                          className={`${btn} border-forest-300 text-forest-800 hover:bg-forest-50`}
                        >
                          {managing === sub.id + "resume" ? "…" : "Resume"}
                        </button>
                      )}
                      {sub.status === "cancelled" && (
                        <button
                          type="button"
                          onClick={() => void manage("reactivate", sub.id)}
                          disabled={managing === sub.id + "reactivate"}
                          className={`${btn} border-forest-300 text-forest-800 hover:bg-forest-50`}
                        >
                          {managing === sub.id + "reactivate" ? "…" : "Reactivate"}
                        </button>
                      )}
                      {sub.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => void manage("cancel", sub.id)}
                          disabled={managing === sub.id + "cancel"}
                          className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}
                        >
                          {managing === sub.id + "cancel" ? "…" : "Unenroll"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {supplementId === sub.id && (() => {
                  const currentDose = sub.doses.find((dose) => dose.id === sub.doseId);
                  const selectedDose = sub.doses.find((dose) => dose.id === (reviewDose[sub.id] ?? sub.doseId));
                  const difference = Math.max(0, (selectedDose?.price ?? 0) - (currentDose?.price ?? 0));
                  const overrideNeedsReason = !!supplementOverride.trim() && !supplementReason.trim();
                  return (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">Increase dose / add medication</p>
                      <p className="mt-1 text-xs text-gray-700">
                        Price difference: <span className="font-semibold">${difference.toFixed(2)}</span>. Confirming will
                        charge the saved card and dispatch supplemental medication automatically.
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="text-xs font-medium text-gray-700">
                          New dose
                          <select
                            value={reviewDose[sub.id] ?? sub.doseId}
                            onChange={(e) => setReviewDose((previous) => ({ ...previous, [sub.id]: e.target.value }))}
                            className="mt-1 block rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                          >
                            {sub.doses.map((dose) => (
                              <option key={dose.id} value={dose.id}>{dose.label} — ${dose.price.toFixed(2)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-medium text-gray-700">
                          Override amount (optional)
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={supplementOverride}
                            onChange={(e) => setSupplementOverride(e.target.value)}
                            className="mt-1 block w-36 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                          />
                        </label>
                        <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-700">
                          Override reason
                          <input
                            type="text"
                            value={supplementReason}
                            onChange={(e) => setSupplementReason(e.target.value)}
                            placeholder="Required when overriding the difference"
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                          />
                        </label>
                        <Button
                          onClick={() => void chargeSupplement(sub)}
                          disabled={supplementSaving || difference <= 0 || overrideNeedsReason}
                        >
                          {supplementSaving ? "Charging…" : "Charge difference & dispatch"}
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {adjustId === sub.id && (
                  <div className="mt-4 rounded-xl border border-forest-100 bg-forest-50/60 p-3">
                    <p className="text-sm font-semibold text-gray-900">Charge-only refill (over-shipment correction)</p>
                    <p className="mt-1 text-xs text-gray-600">
                      On the charge date we&apos;ll bill the card on file but <span className="font-semibold">not</span> ship
                      anything (they already received the supply), and text the patient + admins. Leave the amount blank to
                      charge the normal dose price, or enter a prorated amount.
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-xs font-medium text-gray-600">
                        Charge date
                        <input
                          type="date"
                          value={adjustDate}
                          onChange={(e) => setAdjustDate(e.target.value)}
                          className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
                        />
                      </label>
                      <label className="text-xs font-medium text-gray-600">
                        Amount ($, optional)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          placeholder="normal price"
                          className="mt-1 block w-36 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
                        />
                      </label>
                      <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-600">
                        Note to patient (optional)
                        <input
                          type="text"
                          value={adjustNote}
                          onChange={(e) => setAdjustNote(e.target.value)}
                          placeholder="e.g. This covers the extra vial shipped on 7/1."
                          className="mt-1 block w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-700"
                        />
                      </label>
                      <Button onClick={() => void scheduleChargeOnly(sub.id)} disabled={adjustSaving}>
                        {adjustSaving ? "Scheduling…" : "Schedule charge"}
                      </Button>
                    </div>
                  </div>
                )}

                {sub.orders.length > 0 && (
                  <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                    {sub.orders.map((order) => (
                      <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          {patientHref ? (
                            <Link href={patientHref(sub.patientId)} className="font-mono text-xs text-gray-500 hover:underline">
                              #{order.id.slice(-8)}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-gray-500">#{order.id.slice(-8)}</span>
                          )}
                          <Badge variant="default">{order.status}</Badge>
                          <span className="text-xs text-gray-400">{formatDateTime(order.createdAt)}</span>
                        </div>
                        {order.acknowledgedAt ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                            {order.acknowledgedBy ? ` by ${order.acknowledgedBy}` : ""}
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => void acknowledge(order.id)}
                            disabled={acking === order.id}
                          >
                            {acking === order.id ? "Saving…" : "Acknowledge"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
