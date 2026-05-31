import fs from "fs";
import path from "path";

describe("PracticeQ wake contract", () => {
  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/practiceq/wake/route.ts"), "utf8");
  const paymentSource = fs.readFileSync(path.join(process.cwd(), "app/start/payment/page.tsx"), "utf8");

  it("proxies wake requests server-side so the browser never receives the PracticeQ API key", () => {
    expect(routeSource).toContain("PRACTICEQ_REMOTE_PUBLIC_URL");
    expect(routeSource).toContain("PRACTICEQ_API_KEY");
    expect(routeSource).toContain('new URL("/wake"');
    expect(routeSource).toContain('"x-practiceq-api-key"');
  });

  it("warms PracticeQ remote worker as soon as the payment page opens", () => {
    expect(paymentSource).toContain('fetch("/api/practiceq/wake"');
    expect(paymentSource).toContain('method: "POST"');
  });
});
