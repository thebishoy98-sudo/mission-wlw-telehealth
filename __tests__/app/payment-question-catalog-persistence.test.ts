import fs from "fs";
import path from "path";

const repoRoot = process.cwd();

describe("payment questionnaire persistence", () => {
  it("upserts seed-backed PracticeQ questions before saving submitted answers", () => {
    const routeSource = fs.readFileSync(path.join(repoRoot, "app/api/payments/charge/route.ts"), "utf8");
    const requeueSource = fs.readFileSync(path.join(repoRoot, "app/api/cron/requeue-pq-jobs/route.ts"), "utf8");
    const dbSource = fs.readFileSync(path.join(repoRoot, "lib/db.server.ts"), "utf8");

    expect(dbSource).toContain("async upsert(question: Question)");
    expect(dbSource).toContain("INSERT INTO questions");
    expect(routeSource).toContain("ensurePracticeQRequiredQuestions");
    expect(routeSource).toContain("dbServer.questionDb.upsert(question)");
    expect(routeSource.indexOf("dbServer.questionDb.upsert(question)")).toBeLessThan(
      routeSource.indexOf("dbServer.answerDb.create(a)")
    );
    expect(requeueSource).toContain("dbServer.questionDb.upsert(question)");
  });

  it("fails closed when canonical payment/order persistence fails", () => {
    const routeSource = fs.readFileSync(path.join(repoRoot, "app/api/payments/charge/route.ts"), "utf8");

    expect(routeSource).toContain("PaymentPersistenceError");
    expect(routeSource).toMatch(/requirePaymentPersistence\(\s*"order create"/);
    expect(routeSource).toMatch(/requirePaymentPersistence\(\s*"questionnaire answer create"/);
    expect(routeSource).toMatch(/requirePaymentPersistence\(\s*"payment create"/);
    expect(routeSource).toMatch(/requirePaymentPersistence\(\s*"order status update"/);
    expect(routeSource).not.toContain("dbServer.orderDb.create(normalizedOrderData).catch(() => normalizedOrderData)");
    expect(routeSource).not.toContain("dbServer.paymentDb.create(payment).catch(() => {})");
    expect(routeSource).not.toContain("dbServer.orderDb.update(orderId, orderUpdates).catch(() => {})");
  });
});
