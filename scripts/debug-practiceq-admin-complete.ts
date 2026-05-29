/**
 * Debug script: test ONLY the PracticeQ admin "Set as Completed" browser flow.
 *
 * Usage:
 *   PRACTICEQ_DEBUG_INTAKE_ID=<id> npx ts-node -P tsconfig.scripts.json scripts/debug-practiceq-admin-complete.ts
 *
 * If PRACTICEQ_DEBUG_INTAKE_ID is not set, the script queries the PracticeQ API
 * for the most recent Pending intake and uses that.
 *
 * Required env vars (in .env.production.local or environment):
 *   PRACTICEQ_ADMIN_EMAIL
 *   PRACTICEQ_ADMIN_PASSWORD
 *   PRACTICEQ_API_KEY   (used to look up recent intakes when no ID is given)
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { getIntakeSummaryFeed } from "@/services/practiceq";

function loadLocalEnv(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadLocalEnv(".env.production.local");
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

// Force the admin complete path on
process.env.PRACTICEQ_ADMIN_SET_COMPLETED = "true";
process.env.PRACTICEQ_ADMIN_HEADLESS = "false"; // watch it live

const outDir = path.join(process.cwd(), "output", "playwright", "practiceq-admin-complete-debug");

async function shot(page: any, label: string) {
  await fs.promises.mkdir(outDir, { recursive: true });
  const png = path.join(outDir, `${label}.png`);
  const txt = path.join(outDir, `${label}.txt`);
  await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  const text: string = await page.locator("body").innerText().catch(() => "");
  await fs.promises.writeFile(txt, text);
  console.log(`[${label}] url=${page.url()}`);
  console.log(text.slice(0, 600));
  console.log("---");
}

/**
 * Returns the intake ID to test, or null to use list-browse mode
 * (navigate to #/history and let the automation find the pending row).
 */
async function resolveIntakeId(): Promise<string | null> {
  const fromEnv = process.env.PRACTICEQ_DEBUG_INTAKE_ID?.trim();
  if (fromEnv) {
    console.log(`Using intake ID from env: ${fromEnv}`);
    return fromEnv;
  }

  console.log("No PRACTICEQ_DEBUG_INTAKE_ID — querying PracticeQ API for recent Pending intakes (last 90 days)...");
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const feed = await getIntakeSummaryFeed({ startDate: cutoff.toISOString().slice(0, 10) });
    const pending = feed.all.find(
      (f) => /pending/i.test(String((f as any).status ?? ""))
    ) ?? feed.all[0];
    if (pending) {
      console.log(`Found intake: id=${pending.id} client=${pending.clientName} status=${(pending as any).status}`);
      return pending.id;
    }
  } catch {
    // fall through to list-browse mode
  }

  console.log("No intakes found via API (key may not be set) — will use list-browse mode on #/history");
  return null;
}

async function main() {
  const email = process.env.PRACTICEQ_ADMIN_EMAIL ?? "";
  const password = process.env.PRACTICEQ_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("PRACTICEQ_ADMIN_EMAIL and PRACTICEQ_ADMIN_PASSWORD must be set.");
  }

  const intakeId = await resolveIntakeId();
  const intakeUrl = intakeId
    ? `https://app.intakeq.com/#/history/${encodeURIComponent(intakeId)}`
    : "https://app.intakeq.com/#/history";
  console.log(`\nTarget URL: ${intakeUrl}${intakeId ? "" : "  (list-browse mode — will find first Pending row)"}\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);

  try {
    // Step 1: Navigate directly to admin signin page (avoids redirect to forms.intakeq.com)
    console.log("Step 1: Navigate to app.intakeq.com/signin");
    await page.goto("https://app.intakeq.com/signin", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await shot(page, "01-signin-page");

    const signinBodyText: string = await page.locator("body").innerText().catch(() => "");
    const alreadyLoggedIn = !/login|sign in|password|email/i.test(signinBodyText) && page.url().includes("app.intakeq.com") && !page.url().includes("signin");
    if (!alreadyLoggedIn) {
      console.log("Step 2: Filling login credentials");
      const emailInput = page
        .locator("input[type='email'], input[name*='email' i], input[placeholder*='email' i]")
        .first();
      const passwordInput = page.locator("input[type='password']").first();
      if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
      if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(password);
      await shot(page, "02-login-filled");

      const signIn = page
        .getByRole("button", { name: /log\s*in|sign\s*in/i })
        .or(page.locator("button, input[type='submit']").filter({ hasText: /log\s*in|sign\s*in/i }))
        .first();
      if (await signIn.isVisible().catch(() => false)) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
          signIn.click({ timeout: 8000 }),
        ]);
        await page
          .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 20, null, { timeout: 12000 })
          .catch(() => {});
        await page.waitForTimeout(2000);
        await shot(page, "03-after-login");
      } else {
        console.warn("Could not find sign-in button — skipping login click");
        await shot(page, "03-no-signin-btn");
      }
    } else {
      console.log("Step 2: Already logged in (redirected away from signin)");
      await shot(page, "02-already-logged-in");
    }

    // Step 3: Navigate to intake history URL
    console.log(`Step 3: Navigate to ${intakeUrl}`);
    await page.goto(intakeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 20, null, { timeout: 12000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "04-history-page");

    // Step 4: The intake URL #/history/{intakeId} DIRECTLY loads the intake detail view.
    //   If in list-browse mode (no intakeId), click View on the first Not Completed row first.
    if (!intakeId) {
      console.log("Step 4: List-browse mode — clicking View on first Not Completed row");
      const viewHref = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tbody tr"));
        for (const row of rows) {
          // Not Completed rows have btn-default View link (status != 3)
          // Completed rows have btn-success/btn-primary
          const viewLink = row.querySelector("a.btn.btn-sm[href*='/history/']") as HTMLAnchorElement | null;
          const hasCompleted = row.querySelector("a.btn-success, a.btn-primary, button.btn-success");
          if (viewLink && !hasCompleted) return viewLink.getAttribute("href") ?? null;
        }
        // Fallback: first row with btn-default View
        const anyViewLink = document.querySelector("table tbody tr a.btn.btn-sm.btn-default[href*='/history/']") as HTMLAnchorElement | null;
        return anyViewLink?.getAttribute("href") ?? null;
      }).catch(() => null);
      console.log("  Not Completed view href:", viewHref);
      if (viewHref) {
        const detailUrl = "https://app.intakeq.com/" + viewHref.replace(/^#?\//, "#/");
        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2000);
        await shot(page, "04b-detail-view-opened");
      } else {
        console.error("Could not find a Not Completed intake to open — check history list");
        return;
      }
    } else {
      console.log("Step 4: Already on detail view (navigated directly by intake ID)");
    }

    // Step 5: Click the "More ▼" button in the detail view right panel
    console.log("Step 5: Clicking 'More' dropdown in detail view");
    const moreBtn = page
      .locator(".col-md-2.hidden-print .dropdown-toggle, .panel .dropdown-toggle, aside .dropdown-toggle")
      .filter({ hasText: /more/i })
      .first()
      .or(
        page
          .getByRole("button", { name: /^more$/i })
          .or(page.locator("button.dropdown-toggle, a.dropdown-toggle").filter({ hasText: /^more$/i }))
          .first()
      );

    let dropdownOpened = await moreBtn.isVisible().catch(() => false);
    if (dropdownOpened) {
      console.log("  Found More button via locator");
      await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
      await moreBtn.click({ timeout: 8000 }).catch(() => {});
    } else {
      console.log("  Falling back to DOM evaluate to find More button");
      dropdownOpened = await page.evaluate(() => {
        const isVisible = (el: Element) => {
          const node = el as HTMLElement;
          const s = window.getComputedStyle(node);
          const r = node.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
        };
        const btns = Array.from(document.querySelectorAll("button.dropdown-toggle, a.dropdown-toggle, [data-toggle='dropdown']"));
        console.log("[browser] dropdown-toggle buttons found:", btns.length);
        for (const el of btns) {
          const text = (el as HTMLElement).innerText?.trim() ?? "";
          console.log("[browser] btn:", text.slice(0, 40), "visible:", isVisible(el));
          if (/^\s*more\s*/i.test(text) && isVisible(el)) {
            (el as HTMLElement).scrollIntoView({ block: "center" });
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
    }

    await page.waitForTimeout(1000);
    await shot(page, "05-after-more-click");

    if (!dropdownOpened) {
      console.error("'More' button not found in detail view");
      return;
    }

    // Step 6: Click Set as Completed
    console.log("Step 6: Click Set as Completed");
    const setCompleted = page.locator('a[ng-click="setAsCompleted()"], li a[ng-click="setAsCompleted()"]').first();
    const setCompletedVisible =
      await setCompleted.isVisible({ timeout: 5000 }).catch(() => false) ||
      await page.locator("button, a, li").filter({ hasText: /^set as completed$/i }).first().isVisible().catch(() => false);

    if (!setCompletedVisible) {
      console.error("'Set as Completed' option NOT found in dropdown");
      const bodyText: string = await page.locator("body").innerText().catch(() => "");
      console.log("Page text:", bodyText.slice(0, 400));
      await shot(page, "07-set-completed-not-found");
      return;
    }
    console.log("  Found 'Set as Completed' — clicking");
    await setCompleted.click({ timeout: 8000 }).catch(async () => {
      await page.locator("button, a, li, span").filter({ hasText: /^set as completed$/i }).first().click({ timeout: 5000, force: true }).catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll("a, button, li, span"));
          const target = els.find(el => /^set as completed$/i.test((el as HTMLElement).innerText?.trim() ?? ""));
          (target as HTMLElement)?.click();
        });
      });
    });
    await page.waitForTimeout(1000);
    await shot(page, "07-after-set-completed-click");

    // Step 7: Click Yes in confirmation modal
    console.log("Step 7: Click Yes in confirmation modal");
    const modalYes = page
      .locator(".modal-dialog button")
      .filter({ hasText: /^\s*yes\s*$/i })
      .first();
    if (await modalYes.isVisible().catch(() => false)) {
      await modalYes.click({ timeout: 8000 }).catch(async () => {
        await modalYes.click({ force: true, timeout: 5000 }).catch(() => {});
      });
    } else {
      console.log("  Modal Yes not found — trying generic confirm/yes");
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a"));
        const yes = btns.find((el) => /^\s*yes\s*$/i.test(el.textContent ?? ""));
        (yes as HTMLElement)?.click();
      });
    }
    await page.waitForTimeout(3000);
    await shot(page, "08-after-yes");

    // Check final status
    const finalText: string = await page.locator("body").innerText().catch(() => "");
    const isCompleted = /completed/i.test(finalText);
    console.log(`\nResult: intake=${intakeId ?? "(list-browse)"} completed=${isCompleted}`);
    if (!isCompleted) {
      console.error("Page does not show 'Completed' status after the flow.");
    } else {
      console.log("SUCCESS — intake marked as Completed.");
    }

    console.log(`\nScreenshots saved to: ${outDir}`);
    await page.waitForTimeout(4000); // pause so you can see the final state
  } catch (err) {
    console.error("Fatal error:", err instanceof Error ? err.stack ?? err.message : err);
    await shot(page, "error");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
