"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { AdminNotificationEvent, AdminNotificationSettings } from "@/types";

const EVENT_LABELS: Record<AdminNotificationEvent, string> = {
  identity_review_needed: "Identity review is needed",
  reorder_review_needed: "Back-to-back reorder needs review",
  subscription_charge_alert: "Subscription charge processed (e.g. over-shipment)",
  subscription_review_needed: "Refill due for dose review (7-week mark)",
  order_received: "New order is received",
  pharmacy_shipped: "Pharmacy ships an order",
};

const defaultSettings: AdminNotificationSettings = {
  phones: [],
  events: {
    identity_review_needed: true,
    reorder_review_needed: true,
    subscription_charge_alert: true,
    subscription_review_needed: true,
    order_received: true,
    pharmacy_shipped: true,
  },
};

export default function AdminNotificationsPage() {
  const [settings, setSettings] = useState<AdminNotificationSettings>(defaultSettings);
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/notification-settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Could not load notification settings.");
        setSettings(payload.settings ?? defaultSettings);
      })
      .catch((err) => setError(err.message ?? "Could not load notification settings."))
      .finally(() => setLoading(false));
  }, []);

  const canAddPhone = useMemo(() => phoneInput.replace(/\D/g, "").length >= 10, [phoneInput]);

  const saveSettings = async (next: AdminNotificationSettings) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not save notification settings.");
      setSettings(payload.settings);
      setMessage("Notification settings saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addPhone = () => {
    if (!canAddPhone) return;
    const next = { ...settings, phones: [...settings.phones, phoneInput] };
    setPhoneInput("");
    void saveSettings(next);
  };

  const removePhone = (phone: string) => {
    void saveSettings({ ...settings, phones: settings.phones.filter((item) => item !== phone) });
  };

  const toggleEvent = (event: AdminNotificationEvent) => {
    void saveSettings({
      ...settings,
      events: { ...settings.events, [event]: !settings.events[event] },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12">
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-forest-800">
              <Bell className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Notifications</h1>
          </div>
          <p className="max-w-2xl text-sm text-gray-600">
            Configure which admin phone numbers receive operational text alerts.
          </p>
        </div>

        {error && <div className="mb-5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-5 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Admin Phone Numbers</h2>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  label="Phone number"
                  placeholder="(555) 111-2222"
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(event.target.value)}
                />
                <div className="flex items-end">
                  <Button type="button" onClick={addPhone} disabled={!canAddPhone || saving}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : settings.phones.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  No admin phone numbers are configured yet.
                </p>
              ) : (
                <div className="divide-y rounded-lg border border-gray-100 bg-white">
                  {settings.phones.map((phone) => (
                    <div key={phone} className="flex items-center justify-between gap-3 p-3">
                      <span className="font-mono text-sm text-gray-800">{phone}</span>
                      <button
                        type="button"
                        onClick={() => removePhone(phone)}
                        className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${phone}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Alert Events</h2>
              <div className="space-y-3">
                {(Object.keys(EVENT_LABELS) as AdminNotificationEvent[]).map((event) => (
                  <label key={event} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={settings.events[event]}
                      onChange={() => toggleEvent(event)}
                      disabled={saving}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-forest-800 focus:ring-forest-700"
                    />
                    <span className="text-sm font-medium text-gray-800">{EVENT_LABELS[event]}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
