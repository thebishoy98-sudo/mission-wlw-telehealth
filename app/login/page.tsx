import Link from "next/link";
import { ArrowRight, ClipboardCheck, ShieldCheck, UserRound } from "lucide-react";

const portals = [
  {
    label: "Patient Portal",
    href: "/login/patient",
    description: "View orders, check status, and request refills.",
    icon: UserRound,
  },
  {
    label: "Provider Portal",
    href: "/login/provider",
    description: "Review intakes, identity proof, and approvals.",
    icon: ClipboardCheck,
  },
  {
    label: "Admin Console",
    href: "/login/admin",
    description: "Manage orders, catalog, content, and integrations.",
    icon: ShieldCheck,
  },
];

export default function LoginChooserPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 sm:justify-start">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
            <span className="text-sm font-bold text-white">M</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">Mission WLW</span>
        </Link>

        <div className="mb-6 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Secure sign in</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Choose your portal</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Use the portal that matches your role. Patient, provider, and admin access are separated.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {portals.map(({ label, href, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-gray-900">{label}</h2>
              <p className="mt-2 min-h-[48px] text-sm leading-6 text-gray-600">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">
                Continue
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
