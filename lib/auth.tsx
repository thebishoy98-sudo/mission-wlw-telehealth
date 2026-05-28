"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import * as db from "@/lib/db";

const AUTH_KEY = "tele_auth_session";
const PATIENT_PORTAL_PASSWORD = "patient123";

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

const STAFF_CREDENTIALS: Record<
  string,
  { password: string; role: UserRole; name: string }
> = {
  "dr.johnson@telehealth.com": {
    password: "provider123",
    role: "provider",
    name: "Dr. Sarah Johnson",
  },
  "admin@telehealth.com": {
    password: "admin123",
    role: "admin",
    name: "Admin User",
  },
};

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
      if (password !== PATIENT_PORTAL_PASSWORD) {
        return { success: false, error: "Invalid email or password." };
      }
      const patients = db.patientDb.getAll();
      const patient = patients.find(
        (p) => p.email.toLowerCase() === normalized
      );
      if (!patient) {
        return { success: false, error: "No patient account found with that email." };
      }
      const authUser: AuthUser = {
        id: `patient_session_${patient.id}`,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        role: "patient",
        patientId: patient.id,
      };
      setUser(authUser);
      localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
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

    const staff = STAFF_CREDENTIALS[normalized];
    if (!staff || staff.role !== role || staff.password !== password) {
      return { success: false, error: "Invalid email or password." };
    }

    const authUser: AuthUser = {
      id: `${role}_session`,
      name: staff.name,
      email: normalized,
      role: staff.role,
    };
    setUser(authUser);
    localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
    return { success: true };
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
