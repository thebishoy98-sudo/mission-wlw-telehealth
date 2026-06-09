import { expect, test } from "@playwright/test";

const seededIntakeState = {
  firstName: "Mobile",
  lastName: "Audit",
  dateOfBirth: "1990-04-14",
  gender: "female",
  phone: "4075550100",
  email: "mobile-audit@example.com",
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
};

test("questionnaire action buttons do not overflow on iPhone width", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript((state) => {
    window.sessionStorage.setItem("tele_intake_form_state", JSON.stringify(state));
  }, seededIntakeState);

  await page.goto("/start/questionnaire", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText("Health Questionnaire");

  const metrics = await page.evaluate(() => {
    const nextButton = Array.from(document.querySelectorAll("button")).find((button) =>
      /Next|Continue/.test(button.textContent ?? "")
    );
    const rect = nextButton?.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      nextRight: rect?.right ?? 0,
    };
  });

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.nextRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});
