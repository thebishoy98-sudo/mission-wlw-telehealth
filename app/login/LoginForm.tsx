"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    description: "Access orders, refill status, and reorder options.",
    destination: "/patient",
    emailPlaceholder: "you@example.com",
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password, role);

    if (!result.success) {
      setError(result.error || "Sign in failed.");
      setLoading(false);
      return;
    }

    router.push(config.destination);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
          <ArrowLeft className="h-4 w-4" />
          All portals
        </Link>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
                <span className="text-sm font-bold text-white">M</span>
              </div>
              <span className="text-base font-bold tracking-tight text-gray-900">Mission WLW</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{config.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{config.title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">{config.description}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email address</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={config.emailPlaceholder}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-3 text-base text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-teal-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                autoComplete={role === "patient" ? "current-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-3 text-base text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-teal-500 sm:text-sm"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" fullWidth disabled={loading}>
              <Lock className="mr-2 h-4 w-4" />
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>

        {role === "patient" && (
          <p className="mt-5 text-center text-sm text-gray-600">
            New patient?{" "}
            <Link href="/start/info" className="font-semibold text-teal-700 hover:text-teal-800">
              Start your intake
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
