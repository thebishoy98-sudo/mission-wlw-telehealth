import fs from "fs";
import path from "path";

describe("staff session hardening contract", () => {
  const repoRoot = process.cwd();
  const authSource = fs.readFileSync(path.join(repoRoot, "lib/auth.tsx"), "utf8");
  const serverAuthSource = fs.readFileSync(path.join(repoRoot, "lib/server-auth.ts"), "utf8");
  const adminLoginSource = fs.readFileSync(path.join(repoRoot, "app/api/auth/admin-login/route.ts"), "utf8");
  const providerLoginSource = fs.readFileSync(path.join(repoRoot, "app/api/auth/provider-login/route.ts"), "utf8");
  const logoutSource = fs.readFileSync(path.join(repoRoot, "app/api/auth/logout/route.ts"), "utf8");
  const proxySource = fs.readFileSync(path.join(repoRoot, "proxy.ts"), "utf8");

  it("hydrates staff identity from the server instead of localStorage", () => {
    expect(authSource).toContain('fetch("/api/auth/session"');
    expect(authSource).not.toContain("localStorage.getItem");
    expect(authSource).not.toContain("localStorage.setItem");
    expect(authSource).not.toContain("localStorage.removeItem");
  });

  it("sets a signed staff session cookie instead of raw admin/provider secret cookies", () => {
    expect(adminLoginSource).toContain("createStaffSessionToken");
    expect(providerLoginSource).toContain("createStaffSessionToken");
    expect(adminLoginSource).toContain("STAFF_SESSION_COOKIE");
    expect(providerLoginSource).toContain("STAFF_SESSION_COOKIE");
    expect(adminLoginSource).not.toContain('cookies.set("admin_secret"');
    expect(providerLoginSource).not.toContain('cookies.set("provider_secret"');
  });

  it("authorizes staff APIs from signed staff sessions while keeping header secrets for service calls", () => {
    expect(serverAuthSource).toContain("getStaffSessionFromRequest");
    expect(serverAuthSource).toContain('req.headers?.get?.("x-admin-secret")');
    expect(serverAuthSource).toContain('req.headers?.get?.("x-provider-secret")');
    expect(serverAuthSource).not.toContain('readCookie(req, "admin_secret")');
    expect(serverAuthSource).not.toContain('readCookie(req, "provider_secret")');
  });

  it("authorizes admin pages from signed staff sessions at the proxy", () => {
    expect(proxySource).toContain("verifyStaffSessionCookieForProxy");
    expect(proxySource).toContain("STAFF_SESSION_COOKIE");
    expect(proxySource).toContain('req.headers.get("x-admin-secret")');
    expect(proxySource).not.toContain('req.cookies.get("admin_secret")');
  });

  it("logout clears the signed staff session and old bridge cookies", () => {
    expect(logoutSource).toContain("STAFF_SESSION_COOKIE");
    expect(logoutSource).toContain('"admin_secret"');
    expect(logoutSource).toContain('"provider_secret"');
  });
});
