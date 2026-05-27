"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import * as Types from "@/types";
import { formatDateTime } from "@/lib/utils";

// ─── friendly display config per integration ───────────────────────────────

const INTEGRATIONS: Record<
  string,
  {
    label: string;
    color: string;
    dot: string;
    description: string;
    role: string;
    smsTemplates?: { trigger: string; message: string }[];
  }
> = {
  system: {
    label: "Platform",
    color: "bg-gray-100 text-gray-700",
    dot: "bg-gray-400",
    description: "Internal platform events handled directly by this system.",
    role: "Tracks every step a patient takes from sign-up through delivery.",
  },
  practiceq: {
    label: "PracticeQ",
    color: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    description: "A medical records and patient management platform used by licensed healthcare providers.",
    role: "When a patient completes their intake form, their full profile - questionnaire answers, signed consents, and uploaded documents - is automatically packaged and delivered to the reviewing provider inside PracticeQ.",
  },
  quickbooks: {
    label: "QuickBooks",
    color: "bg-green-100 text-green-700",
    dot: "bg-green-500",
    description: "Accounting software that keeps financial records organised and up to date.",
    role: "The moment a patient's payment is captured, a customer record and invoice are automatically created in QuickBooks. No manual bookkeeping required.",
  },
  lifefile: {
    label: "Life File Pharmacy",
    color: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
    description: "A compounding pharmacy partner that prepares and ships medications directly to patients.",
    role: "Once a provider approves a prescription, the full order - drug, dose, quantity, and the patient's shipping address - is transmitted directly to Life File. Status updates and tracking numbers flow back automatically.",
  },
  spruce: {
    label: "Spruce Texting",
    color: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
    description: "Healthcare SMS texting for patient order updates and reminders.",
    role: "Patients receive text updates for payment, identity verification, provider review, pharmacy dispatch, shipping, and delivery.",
    smsTemplates: [
      { trigger: "Intake submitted", message: "We've received your intake. A provider will review shortly." },
      { trigger: "Payment captured", message: "We've received your payment. Order ID confirmed." },
      { trigger: "Identity reminder", message: "Please upload your ID and 10-second identity video." },
      { trigger: "Sent to pharmacy", message: "Your order has been sent to our pharmacy partner." },
      { trigger: "Order shipped", message: "Your tracking info is ready. Contact us with any questions." },
    ],
  },
};

const FLOW_STEPS = [
  {
    step: "1",
    title: "Patient Completes Intake",
    body: "The patient fills out their health questionnaire, signs consent forms, uploads their ID, and pays online - all in one flow.",
    system: "Platform",
    detail: "Triggers: PracticeQ + QuickBooks",
  },
  {
    step: "2",
    title: "Records Sent to Provider via PracticeQ",
    body: "The moment intake is complete, the patient's full profile - answers, consent, and uploaded files - is packaged and sent to the reviewing provider inside PracticeQ.",
    system: "PracticeQ",
    detail: "Trigger: Patient submits intake",
  },
  {
    step: "3",
    title: "Payment Recorded in QuickBooks",
    body: "As soon as payment is captured, a customer record and invoice are automatically created in QuickBooks. No manual bookkeeping needed.",
    system: "QuickBooks",
    detail: "Trigger: Payment captured",
  },
  {
    step: "4",
    title: "Provider Reviews & Approves",
    body: "The provider reviews the patient's information in their dashboard and either approves or declines. Approved orders move forward automatically.",
    system: "Provider Dashboard",
    detail: "Manual step by licensed provider",
  },
  {
    step: "5",
    title: "Prescription Sent to Pharmacy",
    body: "Once approved, the prescription - including drug, dose, quantity, and the patient's shipping address - is transmitted directly to Life File Pharmacy.",
    system: "Life File",
    detail: "Trigger: Provider approves order",
  },
  {
    step: "6",
    title: "Patient Receives Text Updates",
    body: "Throughout the whole journey, patients receive plain-English text messages at every milestone: intake received, payment confirmed, order sent to pharmacy, and when it ships.",
    system: "Spruce",
    detail: "Trigger: Every status change",
  },
];

function humanReadableAction(log: Types.IntegrationLog): string {
  const map: Record<string, string> = {
    "Intake submitted": "Patient completed and submitted their intake form",
    "Intake packet submitted": "Patient records packaged and sent to provider",
    "Payment processed": "Payment successfully collected from patient",
    "Invoice created": "Invoice automatically recorded in accounting",
    "Pharmacy order submitted": "Prescription transmitted to pharmacy",
    "Pharmacy status updated": "Pharmacy sent a status update on the order",
    "SMS sent": "Text message sent to patient",
    "SMS queued (Spruce disabled)": "Text message queued because live Spruce sending is disabled",
    "SMS API send failed": "Text message failed to send through Spruce",
    "Patient SMS reply received": "Patient replied by text",
    "SMS delivery failed": "Spruce reported a text delivery failure",
  };
  return map[log.action] ?? log.action;
}

// ─── component ─────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [logs, setLogs] = useState<Types.IntegrationLog[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/integration-logs", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Could not load integration activity.");
        const allLogs = (payload.logs ?? []) as Types.IntegrationLog[];
        setLogs(allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setIntegrationStatus(payload.integrations ?? {});
      })
      .catch((err) => setError(err.message ?? "Could not load integration activity."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter ? logs.filter((l) => l.integrationName === filter) : logs;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-8 sm:py-12 space-y-8 sm:space-y-12">

        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">How the Platform Connects</h1>
          <p className="mt-2 text-gray-500 max-w-2xl">
            This platform doesn&apos;t work in isolation - it talks to several specialised tools behind the scenes.
            Here&apos;s what each one does and how they fit together.
          </p>
        </div>

        {/* Integration cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(INTEGRATIONS).filter(([k]) => k !== "system").map(([key, cfg]) => (
            <Card key={key}>
              <CardContent className="p-6 space-y-3">
                <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
                  {cfg.label}
                </span>
                <p className="text-sm text-gray-600">{cfg.description}</p>
                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What it does here</p>
                  <p className="text-sm text-gray-700">{cfg.role}</p>
                </div>
                {cfg.smsTemplates && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Messages patients receive</p>
                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full px-2 py-1 font-semibold ${
                        integrationStatus.spruce?.liveSending ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {integrationStatus.spruce?.liveSending ? "Live sending on" : "Live sending off"}
                      </span>
                      <span className={`rounded-full px-2 py-1 font-semibold ${
                        integrationStatus.spruce?.configured ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {integrationStatus.spruce?.configured ? "Credentials configured" : "Credentials missing"}
                      </span>
                    </div>
                    <div className="mb-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                      <p className="font-semibold">Webhook</p>
                      <p className="font-mono break-all">{integrationStatus.spruce?.webhookPath ?? "/api/webhooks/spruce"}</p>
                    </div>
                    <div className="space-y-2">
                      {cfg.smsTemplates.map((t) => (
                        <div key={t.trigger} className="bg-orange-50 rounded-lg px-3 py-2">
                          <p className="text-xs text-orange-600 font-medium mb-0.5">{t.trigger}</p>
                          <p className="text-sm text-gray-700 italic">&quot;{t.message}&quot;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Step-by-step flow */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Order Journey - Step by Step</h2>
          <div className="relative">
            {/* connecting line */}
            <div className="hidden md:block absolute left-6 top-6 bottom-6 w-0.5 bg-teal-200" />
            <div className="space-y-4">
              {FLOW_STEPS.map((s) => (
                <div key={s.step} className="relative flex gap-5 items-start">
                  <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow">
                    {s.step}
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{s.title}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{s.system}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{s.body}</p>
                    <p className="text-xs text-teal-600 font-medium">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Recent Activity</h2>
          <p className="text-sm text-gray-500 mb-6">A plain-English record of what the platform has been doing.</p>

          {/* filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { key: "", label: "All activity" },
              { key: "system", label: "Platform" },
              { key: "practiceq", label: "PracticeQ" },
              { key: "quickbooks", label: "QuickBooks" },
              { key: "lifefile", label: "Pharmacy" },
              { key: "spruce", label: "Messaging" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === key
                    ? "bg-teal-600 text-white"
                    : "bg-white text-gray-600 border border-gray-300 hover:border-teal-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0 divide-y max-h-[480px] overflow-y-auto">
              {loading && (
                <p className="text-center text-gray-400 py-12 text-sm">Loading activity...</p>
              )}
              {!loading && error && (
                <p className="text-center text-red-500 py-12 text-sm">{error}</p>
              )}
              {!loading && !error && filtered.length === 0 && (
                <p className="text-center text-gray-400 py-12 text-sm">No activity found.</p>
              )}
              {!loading && !error && filtered.map((log) => {
                const cfg = INTEGRATIONS[log.integrationName] ?? INTEGRATIONS.system;
                const isOk = log.status === "success";
                return (
                  <div key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className={`mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{humanReadableAction(log)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.timestamp)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                      isOk ? "bg-green-100 text-green-700" : log.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                    }`}>
                      {isOk ? "Done" : log.status === "pending" ? "Pending" : "Failed"}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
