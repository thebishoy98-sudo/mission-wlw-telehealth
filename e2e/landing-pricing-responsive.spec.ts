import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

type Box = { x: number; y: number; width: number; height: number };

function boxesOverlap(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pricingCard(page: Page, label: string): Locator {
  return page
    .locator("#pricing")
    .getByRole("heading", { name: label, exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
}

async function expectLabelAndBadgeDoNotOverlap(page: Page, label: string, weeklyLabel: string, badge: string) {
  const card = pricingCard(page, label);
  const weeklyBox = await card.getByText(weeklyLabel, { exact: true }).boundingBox();
  const badgeBox = await card.getByText(badge, { exact: true }).boundingBox();

  expect(weeklyBox, `${weeklyLabel} should have a visible layout box`).not.toBeNull();
  expect(badgeBox, `${badge} should have a visible layout box`).not.toBeNull();
  expect(weeklyBox!.width, `${weeklyLabel} should render with width`).toBeGreaterThan(0);
  expect(weeklyBox!.height, `${weeklyLabel} should render with height`).toBeGreaterThan(0);
  expect(badgeBox!.width, `${badge} should render with width`).toBeGreaterThan(0);
  expect(badgeBox!.height, `${badge} should render with height`).toBeGreaterThan(0);
  expect(boxesOverlap(weeklyBox!, badgeBox!)).toBe(false);
}

test.describe("Landing pricing responsive layout", () => {
  test("dose labels do not collide with badges on phone landscape", async ({ page }) => {
    await page.setViewportSize({ width: 896, height: 414 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "html, body { scroll-behavior: auto !important; }" });

    await expect(page.locator("#pricing")).toBeAttached();
    await page.evaluate(() => {
      document.getElementById("pricing")?.scrollIntoView({ block: "center" });
    });
    await expect(page.getByRole("heading", { name: /Compounded Tirzepatide/i })).toBeVisible();

    await expectLabelAndBadgeDoNotOverlap(page, "Tirzepatide 20mg", "2.5mg / week", "Starter Dose");
    await expectLabelAndBadgeDoNotOverlap(page, "Tirzepatide 40mg", "5mg / week", "Most Popular");
    await expectLabelAndBadgeDoNotOverlap(page, "Tirzepatide 60mg", "7.5mg / week", "Max Dose");
  });
});
