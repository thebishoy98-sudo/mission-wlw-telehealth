import fs from "fs";
import path from "path";

describe("patient portal reorder and tracking contract", () => {
  const patientPage = fs.readFileSync(path.join(process.cwd(), "app/patient/page.tsx"), "utf8");
  const patientOrdersRoute = fs.readFileSync(path.join(process.cwd(), "app/api/patient/orders/route.ts"), "utf8");
  const reorderPage = fs.readFileSync(path.join(process.cwd(), "app/patient/reorder/page.tsx"), "utf8");
  const reorderRoute = fs.readFileSync(path.join(process.cwd(), "app/api/patient/reorder/[orderId]/route.ts"), "utf8");
  const paymentPage = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");
  const paymentRoute = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");
  const checkoutIdentityReuse = fs.readFileSync(path.join(process.cwd(), "lib/checkout-identity-reuse.ts"), "utf8");
  const confirmationPage = fs.readFileSync(path.join(process.cwd(), "app/start/confirmation/page.tsx"), "utf8");
  const navbar = fs.readFileSync(path.join(process.cwd(), "components/layout/Navbar.tsx"), "utf8");
  const footer = fs.readFileSync(path.join(process.cwd(), "components/layout/Footer.tsx"), "utf8");
  const statusPage = fs.readFileSync(path.join(process.cwd(), "app/status/page.tsx"), "utf8");

  it("shows tracking inline on order cards and removes the separate track order button", () => {
    expect(patientOrdersRoute).toContain("pharmacyOrders");
    expect(patientPage).toContain("Tracking number:");
    expect(patientPage).toContain("getFedExTrackingUrl(trackingNumber)");
    expect(patientPage).toContain('target="_blank"');
    expect(patientPage).toContain("Tracking number will be provided here once your order ships.");
    expect(patientPage).not.toContain("Track order status");
    expect(confirmationPage).not.toContain("Track My Order");
    expect(footer).not.toContain("Track My Order");
  });

  it("routes reorder through dose selection directly to checkout without restarting intake", () => {
    expect(patientPage).toContain("handleReorder");
    expect(patientPage).toContain('router.push(`/patient/reorder?orderId=${encodeURIComponent(order.id)}`)');
    expect(patientPage).not.toContain("/start/info?reorder=1");
    expect(reorderPage).toContain("Prescription option");
    expect(reorderPage).toContain("questionnaireAnswers");
    expect(reorderPage).toContain("isReorder: true");
    expect(reorderPage).toContain("reorderSourceOrderId: data.order.id");
    expect(reorderPage).toContain('router.push("/start/payment")');
    expect(reorderPage).toContain("formatDoseOptionLabel(dose)");
    expect(reorderPage).toContain("formatDoseOptionSummary(selectedDoseOption)");
    expect(reorderPage).not.toContain("/start/questionnaire");
    expect(reorderPage).not.toContain("/start/info");
    expect(reorderRoute).toContain("answerDb.getByOrder");
    expect(reorderRoute).toContain("normalizeProduct");
    expect(reorderRoute).toContain("order.patientId !== patientId");
    expect(reorderPage).toContain("Back to Order History");
    expect(reorderPage).not.toContain("Back to My Orders");
  });

  it("reuses identity verification for reorder checkout without identity reminder sms or admin flag", () => {
    expect(paymentPage).toContain("isReorder: intakeState.isReorder");
    expect(paymentPage).toContain("reorderSourceOrderId: intakeState.reorderSourceOrderId");
    expect(paymentPage).toContain('identityStatus: intakeState.identityStatus ?? "missing"');
    expect(paymentPage).toContain("intakeState.isReorder && intakeState.reorderSourceOrderId");
    expect(paymentRoute).toContain("reorderSourceOrderId");
    expect(paymentRoute).toContain("resolveReusableCheckoutIdentity");
    expect(paymentRoute).toContain("patientOrdersForIdentity");
    expect(paymentRoute).toContain("checkoutIdentityReused");
    expect(paymentRoute).toContain("reorderSkipsQuestionnaireValidation");
    expect(checkoutIdentityReuse).toContain("Reorder identity reused");
    expect(checkoutIdentityReuse).toContain("previous verified order");
    expect(paymentRoute).toContain("!checkoutIdentityReused");
  });

  it("sends signed-in order navigation to the patient order list, not the public status tracker", () => {
    expect(navbar).toContain('href: "/patient"');
    expect(navbar).toContain('label: "Order History"');
    expect(navbar).not.toContain("My Orders");
    expect(footer).toContain("Order History");
    expect(footer).not.toContain("My Orders");
    expect(navbar).not.toContain("My Status");
    expect(navbar).not.toContain("Order Status");
  });

  it("requires phone login for the legacy public status route", () => {
    expect(statusPage).toContain('redirect("/login/patient?next=/patient")');
    expect(statusPage).not.toContain("Order Status Tracker");
    expect(statusPage).not.toContain("/api/orders/");
    expect(statusPage).not.toContain("Enter your order ID and email.");
  });
});
