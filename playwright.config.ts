import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PROVIDER_EMAIL = process.env.PROVIDER_EMAIL ?? process.env.E2E_PROVIDER_EMAIL ?? "provider@example.com";
const PROVIDER_PASSWORD = process.env.PROVIDER_PASSWORD ?? process.env.E2E_PROVIDER_PASSWORD ?? "provider123";
const PROVIDER_SECRET = process.env.PROVIDER_SECRET ?? "local-provider-secret";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        env: {
          ...process.env,
          PROVIDER_EMAIL,
          PROVIDER_PASSWORD,
          PROVIDER_SECRET,
          PROVIDER_NAME: process.env.PROVIDER_NAME ?? "Dotson, Karen",
        },
        reuseExistingServer: true,
        timeout: 60000,
      },
});
