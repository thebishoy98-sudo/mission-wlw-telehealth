"use client";
import Link from "next/link";

export default function QBDisconnectPage() {
  return (
    <div style={{ fontFamily: "sans-serif", margin: "0 auto", maxWidth: 720, padding: "3rem 1.5rem" }}>
      <h1 style={{ color: "#111827", fontSize: 32, marginBottom: 12 }}>Disconnected from QuickBooks</h1>
      <p style={{ color: "#374151", lineHeight: 1.6 }}>
        Your QuickBooks Online company connection to Mission WLW has been disconnected. Mission WLW will no longer use
        this QuickBooks authorization for new accounting, invoicing, or payment reconciliation actions.
      </p>
      <h2 style={{ color: "#111827", fontSize: 20, marginTop: 28 }}>Reconnect QuickBooks</h2>
      <p style={{ color: "#374151", lineHeight: 1.6 }}>
        If this disconnect was unintentional, an authorized admin can reconnect QuickBooks from Mission WLW using the
        QuickBooks connection flow.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <a href="/api/auth/qb/start" style={{ background: "#0f766e", borderRadius: 8, color: "white", padding: "10px 14px", textDecoration: "none" }}>
          Reconnect QuickBooks
        </a>
        <Link href="/" style={{ border: "1px solid #d1d5db", borderRadius: 8, color: "#111827", padding: "10px 14px", textDecoration: "none" }}>
          Return to Mission WLW
        </Link>
      </div>
    </div>
  );
}
