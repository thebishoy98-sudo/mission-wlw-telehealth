import fs from "fs";
import path from "path";

describe("identity upload route contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/identity/upload/route.ts"), "utf8");
  const orchestrationSource = fs.readFileSync(
    path.join(process.cwd(), "services/practiceq-automation-orchestration.ts"),
    "utf8"
  );
  const pageSource = fs.readFileSync(path.join(process.cwd(), "app/verify-identity/[token]/page.tsx"), "utf8");

  it("validates identity upload tokens before patients record media", () => {
    expect(source).toContain("export async function GET");
    expect(source).toContain("dbServer.orderDb.getByIdentityUploadToken(token)");
    expect(source).toContain("uploadNeeded");
    expect(pageSource).toContain("/api/identity/upload?token=");
    expect(pageSource).toContain("Verification link not found");
  });

  it("resumes the PracticeQ completion workflow after delayed verified identity", () => {
    expect(source).toContain("buildIdentityUploadOrderUpdate");
    expect(source).toContain("buildIdentityUploadReviewUpdate");
    expect(source).toContain("resumePracticeQAfterIdentityApproval");
    expect(orchestrationSource).toContain("shouldRetryPracticeQCompletionAfterIdentityApproval");
    expect(orchestrationSource).toContain("dbServer.practiceqAutomationJobDb.getByOrder(order.id)");
    expect(orchestrationSource).toContain("completePracticeQSession(job.id)");
  });

  it("sends a receipt text and flags staff when delayed identity still needs review", () => {
    expect(source).toContain("identity_review_received");
    expect(source).toContain("sendAdminNotification(\"identity_review_needed\"");
  });
});

describe("identity reminder public URL contract", () => {
  const paymentRoute = fs.readFileSync(path.join(process.cwd(), "app/api/payments/charge/route.ts"), "utf8");
  const resendRoute = fs.readFileSync(path.join(process.cwd(), "app/api/identity/resend/route.ts"), "utf8");
  const reminderRoute = fs.readFileSync(path.join(process.cwd(), "app/api/cron/identity-reminders/route.ts"), "utf8");

  it("does not build patient SMS links from Render's internal request origin", () => {
    for (const route of [paymentRoute, resendRoute, reminderRoute]) {
      expect(route).toContain("getPublicBaseUrl(req)");
      expect(route).not.toContain("buildIdentityUploadUrl(req.nextUrl.origin");
    }
  });
});
