"use client";

import { useAuth, UserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  /** Allow any of these roles. Takes precedence over requiredRole. */
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRole, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const roles = allowedRoles ?? (requiredRole ? [requiredRole] : []);
  const permitted = !!user && roles.includes(user.role);
  // Where to send an unauthenticated user to sign in (first listed role).
  const loginRole = roles[0] ?? "patient";

  useEffect(() => {
    if (isLoading) return;
    if (!permitted) {
      router.replace(`/login/${loginRole}`);
    }
  }, [isLoading, permitted, loginRole, router]);

  if (isLoading || !permitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-forest-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
