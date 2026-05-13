"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, UserRole } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const ROLE_CONFIG: {
  role: UserRole;
  label: string;
  description: string;
  demoEmail: string;
  demoPassword: string;
  destination: string;
  passwordHint?: string;
}[] = [
  {
    role: "patient",
    label: "Patient",
    description: "Access your orders, reorder, or request a dose increase",
    demoEmail: "alice@example.com",
    demoPassword: "any password",
    destination: "/patient",
    passwordHint: "Patients: use any password (demo mode)",
  },
  {
    role: "provider",
    label: "Provider",
    description: "Review patient intakes and approve prescriptions",
    demoEmail: "dr.johnson@telehealth.com",
    demoPassword: "provider123",
    destination: "/provider",
  },
  {
    role: "admin",
    label: "Admin",
    description: "Manage orders, products, CMS, and integrations",
    demoEmail: "admin@telehealth.com",
    demoPassword: "admin123",
    destination: "/admin",
  },
];

export default function LoginPage() {
  const [activeRole, setActiveRole] = useState<UserRole>("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  const config = ROLE_CONFIG.find((r) => r.role === activeRole)!;

  const handleRoleSwitch = (role: UserRole) => {
    setActiveRole(role);
    setEmail("");
    setPassword("");
    setError("");
  };

  const handleDemoFill = () => {
    setEmail(config.demoEmail);
    setPassword(config.demoPassword === "any password" ? "demo" : config.demoPassword);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = login(email, password, activeRole);
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Login failed.");
      return;
    }

    router.push(config.destination);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-gray-100 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        <span className="text-xl font-bold text-gray-900 tracking-tight">Telehealth</span>
      </Link>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">

          {/* Role tabs */}
          <div className="flex border-b border-gray-100">
            {ROLE_CONFIG.map(({ role, label }) => (
              <button
                key={role}
                onClick={() => handleRoleSwitch(role)}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                  activeRole === role
                    ? "text-teal-700 border-b-2 border-teal-600 bg-teal-50/50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
            <p className="text-sm text-gray-500 mb-6">{config.description}</p>

            {/* Demo credentials callout */}
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1.5">
                Demo credentials
              </p>
              <div className="text-sm text-teal-800 space-y-0.5">
                <div>
                  <span className="font-medium">Email:</span> {config.demoEmail}
                </div>
                <div>
                  <span className="font-medium">Password:</span>{" "}
                  {config.demoPassword}
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemoFill}
                className="mt-2.5 text-xs font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900"
              >
                Fill automatically
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={config.demoEmail}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config.passwordHint ?? "Enter your password"}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                {config.passwordHint && (
                  <p className="mt-1 text-xs text-gray-400">{config.passwordHint}</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            {activeRole === "patient" && (
              <p className="mt-6 text-center text-sm text-gray-500">
                New patient?{" "}
                <Link href="/start/info" className="text-teal-600 font-semibold hover:text-teal-700">
                  Start your intake
                </Link>
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          This is a demo. No real medical services are provided.
        </p>
      </div>
    </div>
  );
}
