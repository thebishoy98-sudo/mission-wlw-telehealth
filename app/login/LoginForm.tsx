"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Lock } from "lucide-react";
import { useAuth, UserRole } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

const ROLE_CONTENT: Record<
  UserRole,
  { title: string; eyebrow: string; description: string; destination: string; emailPlaceholder: string }
> = {
  patient: {
    title: "Patient Portal",
    eyebrow: "Patient sign in",
    description: "Access orders and refill status with a one-time text code.",
    destination: "/patient",
    emailPlaceholder: "(732) 555-0123",
  },
  provider: {
    title: "Provider Portal",
    eyebrow: "Clinical review",
    description: "Review charts, identity proof, and prescription approvals.",
    destination: "/provider",
    emailPlaceholder: "provider@example.com",
  },
  admin: {
    title: "Admin Console",
    eyebrow: "Operations",
    description: "Manage orders, products, content, and integrations.",
    destination: "/admin",
    emailPlaceholder: "admin@example.com",
  },
};

export function LoginForm({ role }: { role: UserRole }) {
  const config = ROLE_CONTENT[role];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [patientOtpRequested, setPatientOtpRequested] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotFound(false);
    setLoading(true);

    if (role === "patient" && !patientOtpRequested) {
      const response = await fetch("/api/auth/patient-otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Could not send a code.");
        setLoading(false);
        return;
      }
      if (payload.found === false) {
        // No patient/order on file for this number — guide them to intake.
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPatientOtpRequested(true);
      setLoading(false);
      return;
    }

    const result = await login(email, password, role);

    if (!result.success) {
      setError(result.error || "Sign in failed.");
      setLoading(false);
      return;
    }

    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "";
    if (safeNext) {
      window.location.assign(safeNext);
      return;
    }
    router.push(config.destination);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-forest-800">
          <ArrowLeft className="h-4 w-4" />
          All portals
        </Link>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-gray-100">
                <Image
                  src="/mission-logo-icon.jpeg"
                  alt="Mission Weight Loss & Wellness"
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="text-base font-bold tracking-tight text-gray-900">Mission WLW</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-forest-800">{config.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{config.title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">{config.description}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {role === "patient" ? "Phone number" : "Email address"}
              </label>
              <input
                type={role === "patient" ? "tel" : "email"}
                required
                autoComplete={role === "patient" ? "tel" : "email"}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={config.emailPlaceholder}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-3 text-base text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-forest-700 sm:text-sm"
              />
            </div>

            {(role !== "patient" || patientOtpRequested) && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {role === "patient" ? "Text code" : "Password"}
                </label>
                <input
                  type={role === "patient" ? "text" : "password"}
                  required
                  inputMode={role === "patient" ? "numeric" : undefined}
                  autoComplete={role === "patient" ? "one-time-code" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={role === "patient" ? "Enter 6-digit code" : "Enter your password"}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-3 text-base text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-forest-700 sm:text-sm"
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {notFound && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                We couldn&apos;t find a prior order for this number. If you used a different phone, try that one — or{" "}
                <Link href="/start/info" className="font-semibold underline hover:text-amber-900">
                  start your intake
                </Link>{" "}
                to place your first order.
              </div>
            )}

            <Button type="submit" fullWidth disabled={loading}>
              <Lock className="mr-2 h-4 w-4" />
              {loading ? "Please wait..." : role === "patient" && !patientOtpRequested ? "Send text code" : "Sign in"}
            </Button>
            {role === "patient" && patientOtpRequested && (
              <button
                type="button"
                className="w-full text-center text-sm font-semibold text-forest-800 hover:text-forest-900"
                onClick={() => {
                  setPassword("");
                  setPatientOtpRequested(false);
                }}
              >
                Use a different phone number
              </button>
            )}
          </form>
        </div>

        {role === "patient" && (
          <p className="mt-5 text-center text-sm text-gray-600">
            New patient?{" "}
            <Link href="/start/info" className="font-semibold text-forest-800 hover:text-forest-900">
              Start your intake
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
