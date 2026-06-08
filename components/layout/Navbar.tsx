"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Menu, X, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavbarProps {
  variant?: "customer" | "provider" | "admin" | "patient";
}

export function Navbar({ variant = "customer" }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    const loginPath = user ? `/login/${user.role}` : "/login";
    logout();
    router.push(loginPath);
  };

  const links = {
    customer: [
      { label: "Products", href: "/products" },
      { label: "Order History", href: "/patient" },
    ],
    patient: [
      { label: "Order History", href: "/patient" },
      { label: "Products", href: "/products" },
    ],
    provider: [
      { label: "Dashboard", href: "/provider" },
    ],
    admin: [
      { label: "Dashboard", href: "/admin" },
      { label: "Orders", href: "/admin/orders" },
      { label: "Products", href: "/admin/products" },
      { label: "Notifications", href: "/admin/notifications" },
      { label: "Affiliates", href: "/admin/affiliates" },
      { label: "Promo Codes", href: "/admin/promo-codes" },
    ],
  };

  const navLinks = links[variant];
  const displayName =
    variant === "provider" && user?.role === "provider"
      ? "Dotson, Karen"
      : user?.name;

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/mission-logo-full.jpeg"
              alt="Mission Weight Loss & Wellness"
              width={160}
              height={50}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3.5 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-forest-50 text-forest-800"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {variant === "customer" && !user && (
              <>
                <Link href="/login/patient" className="hidden sm:block">
                  <span className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    Sign in
                  </span>
                </Link>
                <Link href="/start/info" className="hidden sm:block">
                  <span className="inline-flex items-center bg-forest-800 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all">
                    Get Started
                  </span>
                </Link>
              </>
            )}
            {user && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <User size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 max-w-[140px] truncate">
                    {displayName}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
            <button
              onClick={() => setOpen(!open)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-4 pt-2 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "block px-3 py-2.5 rounded-lg text-sm font-medium",
                pathname === link.href
                  ? "bg-forest-50 text-forest-800"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              {link.label}
            </Link>
          ))}
          {variant === "customer" && !user && (
            <>
              <Link
                href="/login/patient"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Sign in
              </Link>
              <Link href="/start/info" onClick={() => setOpen(false)}>
                <span className="block mt-2 text-center bg-forest-800 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
                  Get Started
                </span>
              </Link>
            </>
          )}
          {user && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="px-3 py-1 text-xs text-gray-400 font-medium">{displayName}</p>
              <button
                onClick={() => { setOpen(false); handleLogout(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
