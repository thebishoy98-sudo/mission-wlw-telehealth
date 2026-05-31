"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

const AUTH_KEY = "tele_auth_session";

export type UserRole = "patient" | "provider" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  patientId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    role: UserRole
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    setIsLoading(false);
  }, []);

  const login = async (
    email: string,
    password: string,
    role: UserRole
  ): Promise<{ success: boolean; error?: string }> => {
    const normalized = email.toLowerCase().trim();

    if (role === "admin") {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { success: false, error: payload.error ?? "Invalid email or password." };
      }
      setUser(payload.user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload.user));
      return { success: true };
    }

    if (role === "patient") {
      const response = await fetch("/api/auth/patient-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: email, code: password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { success: false, error: payload.error ?? "Invalid or expired code." };
      }
      setUser(payload.user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload.user));
      return { success: true };
    }

    if (role === "provider") {
      const response = await fetch("/api/auth/provider-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { success: false, error: payload.error ?? "Invalid email or password." };
      }
      setUser(payload.user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload.user));
      return { success: true };
    }

    return { success: false, error: "Invalid email or password." };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
