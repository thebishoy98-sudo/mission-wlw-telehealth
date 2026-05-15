import { NextResponse } from "next/server";
import { serviceConfig } from "@/lib/service-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    integrations: {
      practiceq: serviceConfig.practiceq.useMock ? "mock" : "live",
      quickbooks: serviceConfig.quickbooks.useMock ? "mock" : "live",
      lifefile: serviceConfig.lifefile.useMock ? "mock" : "live",
      spruce: serviceConfig.spruce.useMock ? "mock" : "live",
    },
  });
}
