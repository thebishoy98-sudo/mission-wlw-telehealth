import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

type AuditIssue = {
  type: string;
  text?: string;
  otherText?: string;
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
  otherRect?: { x: number; y: number; width: number; height: number };
};

type RouteCase = {
  name: string;
  path: string;
  seedIntake?: boolean;
  waitFor?: RegExp;
};

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "phone-landscape", width: 896, height: 414 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
] as const;

const PUBLIC_ROUTES: RouteCase[] = [
  { name: "landing", path: "/", waitFor: /Start Your Free Assessment|Get Started/i },
  { name: "products", path: "/products", waitFor: /Treatment Options|Tirzepatide/i },
  { name: "product-detail", path: "/products/tirzepatide", waitFor: /Available Dose Options|Product not found/i },
  { name: "patient-login", path: "/login", waitFor: /Patient Portal/i },
  { name: "provider-login", path: "/login/provider", waitFor: /Provider Portal/i },
  { name: "admin-login", path: "/login/admin", waitFor: /Admin Console/i },
  { name: "intake-info", path: "/start/info", waitFor: /Choose Your Treatment/i },
  { name: "intake-questionnaire", path: "/start/questionnaire", seedIntake: true, waitFor: /Health Questionnaire/i },
  { name: "intake-consent", path: "/start/consent", seedIntake: true, waitFor: /CONSENT FOR MEDICAL TREATMENT|Patient Name/i },
  { name: "identity-upload", path: "/start/uploads", seedIntake: true, waitFor: /Identity Verification/i },
  { name: "payment", path: "/start/payment", seedIntake: true, waitFor: /Order Summary|Payment/i },
];

const ADMIN_ROUTES: RouteCase[] = [
  { name: "admin-dashboard", path: "/admin", waitFor: /Admin Dashboard/i },
  { name: "admin-orders", path: "/admin/orders", waitFor: /Order Management/i },
  { name: "admin-products", path: "/admin/products", waitFor: /Product Management|Products/i },
  { name: "admin-notifications", path: "/admin/notifications", waitFor: /Notification Settings|Admin phone/i },
];

const PROVIDER_ROUTES: RouteCase[] = [
  { name: "provider-dashboard", path: "/provider", waitFor: /Provider Dashboard/i },
];

const STAFF_CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@telehealth.com",
    password: process.env.E2E_ADMIN_PASSWORD ?? "admin123",
    endpoint: "/api/auth/admin-login",
  },
  provider: {
    email: process.env.E2E_PROVIDER_EMAIL ?? process.env.PROVIDER_EMAIL ?? "provider@example.com",
    password: process.env.E2E_PROVIDER_PASSWORD ?? process.env.PROVIDER_PASSWORD ?? "provider123",
    endpoint: "/api/auth/provider-login",
  },
} as const;

function seededIntakeState() {
  return {
    firstName: "Ui",
    lastName: "Audit",
    dateOfBirth: "1990-04-14",
    gender: "female",
    phone: "4075550100",
    email: "ui-audit@example.com",
    address: {
      street1: "6319 Davisson Ave",
      city: "Orlando",
      state: "FL",
      zipCode: "32810",
      country: "USA",
    },
    shippingAddress: {
      street1: "6319 Davisson Ave",
      city: "Orlando",
      state: "FL",
      zipCode: "32810",
      country: "USA",
    },
    productId: "tirzepatide",
    doseId: "tirzepatide_20mg_8_week",
    questionnaireAnswers: {
      pq_height: "5'6\"",
      pq_current_weight: "210",
      pq_ideal_weight: "170",
    },
    consentAcknowledged: true,
    signedName: "Ui Audit",
    consented: true,
    consentSignedAt: "2026-06-02T12:00:00.000Z",
    licenseUploaded: false,
    selfieUploaded: false,
    paymentProcessed: false,
    identityStatus: "missing",
  };
}

async function seedIntake(context: BrowserContext) {
  await context.addInitScript((state) => {
    window.sessionStorage.setItem("tele_intake_form_state", JSON.stringify(state));
  }, seededIntakeState());
}

async function loginStaff(context: BrowserContext, role: "admin" | "provider") {
  const creds = STAFF_CREDS[role];
  const response = await context.request.post(`${BASE}${creds.endpoint}`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!response.ok()) {
    return { ok: false, status: response.status(), body: (await response.text()).slice(0, 180) };
  }
  return { ok: true, status: response.status(), body: "" };
}

function formatIssue(issue: AuditIssue) {
  const rect = issue.rect
    ? ` [${Math.round(issue.rect.x)},${Math.round(issue.rect.y)} ${Math.round(issue.rect.width)}x${Math.round(issue.rect.height)}]`
    : "";
  const other = issue.otherText ? ` vs "${issue.otherText}"` : "";
  const text = issue.text ? ` "${issue.text}"` : "";
  return `${issue.type}${text}${other}${rect}${issue.selector ? ` (${issue.selector})` : ""}`;
}

async function waitForStablePage(page: Page, route: RouteCase) {
  await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 20_000 });
  if (route.waitFor) {
    await expect(page.locator("body")).toContainText(route.waitFor, { timeout: 20_000 });
  }
  await page.addStyleTag({
    content: "html, body { scroll-behavior: auto !important; } *, *::before, *::after { animation-duration: 0.001s !important; transition-duration: 0.001s !important; }",
  });
  await page.waitForTimeout(150);
}

async function auditPageLayout(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const issues: AuditIssue[] = [];

    if (documentWidth > viewportWidth + 2 || bodyWidth > viewportWidth + 2) {
      issues.push({
        type: "horizontal-overflow",
        text: `viewport=${viewportWidth}, document=${documentWidth}, body=${bodyWidth}`,
      });
    }

    const ignoredTags = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "SVG", "PATH"]);
    const allElements = Array.from(document.querySelectorAll<HTMLElement>("body *"));

    const rectFor = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    };

    const isVisible = (el: HTMLElement) => {
      if (ignoredTags.has(el.tagName)) return false;
      if (el.closest("[aria-hidden='true'], [hidden], script, style, svg")) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    };

    const isInsideScroller = (el: HTMLElement, axis: "x" | "y") => {
      let current: HTMLElement | null = el.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflow = axis === "x" ? style.overflowX : style.overflowY;
        const scrollSize = axis === "x" ? current.scrollWidth : current.scrollHeight;
        const clientSize = axis === "x" ? current.clientWidth : current.clientHeight;
        if ((overflow === "auto" || overflow === "scroll") && scrollSize > clientSize + 2) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    const readableSelector = (el: HTMLElement) => {
      if (el.id) return `#${el.id}`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
      return `${el.tagName.toLowerCase()}${text ? `:${text}` : ""}`;
    };

    const visibleElements = allElements.filter(isVisible);
    for (const el of visibleElements) {
      if (isInsideScroller(el, "x")) continue;
      const rect = el.getBoundingClientRect();
      const controlLike = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/.test(el.tagName);
      const importantText = /^(H1|H2|H3|P)$/.test(el.tagName);
      if ((controlLike || importantText) && (rect.left < -2 || rect.right > viewportWidth + 2)) {
        issues.push({
          type: "offscreen-element",
          selector: readableSelector(el),
          text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 100),
          rect: rectFor(el),
        });
      }
    }

    const hasVisibleTextChild = (el: HTMLElement) =>
      Array.from(el.children).some((child) => {
        if (!(child instanceof HTMLElement)) return false;
        return isVisible(child) && (child.innerText || child.textContent || "").trim().length > 0;
      });

    const textBoxes = visibleElements
      .filter((el) => {
        const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
        if (text.length < 2) return false;
        if (hasVisibleTextChild(el)) return false;
        if (isInsideScroller(el, "x") || isInsideScroller(el, "y")) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        if (rect.bottom < 0 || rect.top > document.documentElement.scrollHeight) return false;
        return true;
      })
      .map((el) => ({
        el,
        text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
        rect: rectFor(el),
      }));

    const overlap = (a: AuditIssue["rect"], b: AuditIssue["rect"]) => {
      if (!a || !b) return 0;
      const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      return x * y;
    };

    for (let i = 0; i < textBoxes.length; i += 1) {
      for (let j = i + 1; j < textBoxes.length; j += 1) {
        const first = textBoxes[i];
        const second = textBoxes[j];
        if (first.el.contains(second.el) || second.el.contains(first.el)) continue;
        const area = overlap(first.rect, second.rect);
        if (area < 12) continue;
        const smaller = Math.min(first.rect.width * first.rect.height, second.rect.width * second.rect.height);
        if (area / smaller < 0.12) continue;
        issues.push({
          type: "text-overlap",
          text: first.text,
          otherText: second.text,
          rect: first.rect,
          otherRect: second.rect,
        });
        if (issues.length > 20) return { viewportWidth, viewportHeight, issues };
      }
    }

    return { viewportWidth, viewportHeight, issues };
  });
}

test.describe("Responsive UI audit", () => {
  for (const viewport of VIEWPORTS) {
    test(`public and checkout routes have no obvious layout collisions at ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      await seedIntake(context);
      const page = await context.newPage();
      const failures: string[] = [];

      for (const route of PUBLIC_ROUTES) {
        await waitForStablePage(page, route);
        const result = await auditPageLayout(page);
        if (result.issues.length) {
          failures.push(`${route.name} ${viewport.name}: ${result.issues.map(formatIssue).join("; ")}`);
        }
      }

      await context.close();
      expect(failures).toEqual([]);
    });

    test(`authenticated staff routes have no obvious layout collisions at ${viewport.name}`, async ({ browser }) => {
      const failures: string[] = [];

      const adminContext = await browser.newContext({ viewport });
      const adminLogin = await loginStaff(adminContext, "admin");
      if (adminLogin.ok) {
        const adminPage = await adminContext.newPage();
        for (const route of ADMIN_ROUTES) {
          await waitForStablePage(adminPage, route);
          const result = await auditPageLayout(adminPage);
          if (result.issues.length) {
            failures.push(`${route.name} ${viewport.name}: ${result.issues.map(formatIssue).join("; ")}`);
          }
        }
      } else {
        test.info().annotations.push({
          type: "staff-audit-skip",
          description: `Admin login unavailable (${adminLogin.status}); protected admin UI not audited in this environment.`,
        });
      }
      await adminContext.close();

      const providerContext = await browser.newContext({ viewport });
      const providerLogin = await loginStaff(providerContext, "provider");
      if (providerLogin.ok) {
        const providerPage = await providerContext.newPage();
        for (const route of PROVIDER_ROUTES) {
          await waitForStablePage(providerPage, route);
          const result = await auditPageLayout(providerPage);
          if (result.issues.length) {
            failures.push(`${route.name} ${viewport.name}: ${result.issues.map(formatIssue).join("; ")}`);
          }
        }
      } else {
        test.info().annotations.push({
          type: "staff-audit-skip",
          description: `Provider login unavailable (${providerLogin.status}); protected provider UI not audited in this environment.`,
        });
      }
      await providerContext.close();

      expect(failures).toEqual([]);
    });
  }
});
