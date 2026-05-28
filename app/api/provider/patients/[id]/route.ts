import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { loadProviderPatientChart } from "@/lib/provider-chart";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chart = await loadProviderPatientChart(params.id, {
      patients: dbServer.patientDb,
      orders: dbServer.orderDb,
      products: dbServer.productDb,
      questions: dbServer.questionDb,
      answers: dbServer.answerDb,
      consents: dbServer.consentDb,
      uploads: dbServer.uploadDb,
      payments: dbServer.paymentDb,
      pharmacyOrders: dbServer.pharmacyOrderDb,
      reviews: dbServer.providerReviewDb,
      practiceqPackets: dbServer.practiceqPacketDb,
      practiceqMirror: { getForOrder: getPracticeQMirrorForOrder },
    });

    if (!chart) {
      return NextResponse.json({ error: "Patient chart not found" }, { status: 404 });
    }

    return NextResponse.json(chart, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("Provider patient chart load error:", error);
    return NextResponse.json({ error: "Patient chart load failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { orderId, action, reviewedBy = "Dr. Provider" } = await req.json();
    if (!orderId || action !== "mark_chart_viewed") {
      return NextResponse.json({ error: "orderId and action=mark_chart_viewed required" }, { status: 400 });
    }

    const review = await dbServer.providerReviewDb.getByOrder(orderId);
    if (!review || review.patientId !== params.id) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updated = await dbServer.providerReviewDb.update(review.id, {
      chartViewedAt: now,
      chartViewedBy: reviewedBy,
    });

    await dbServer.integrationLogDb.create({
      id: `log_chartview_${Date.now()}`,
      timestamp: now,
      integrationName: "system",
      action: `Provider confirmed chart review for order ${orderId.slice(-6)}`,
      orderId,
      patientId: params.id,
      status: "success",
      details: { action: "chart_reviewed", reviewedBy },
    }).catch(() => {});

    return NextResponse.json({ success: true, review: updated ?? { ...review, chartViewedAt: now, chartViewedBy: reviewedBy } });
  } catch (error) {
    console.error("Provider chart update error:", error);
    return NextResponse.json({ error: "Provider chart update failed" }, { status: 500 });
  }
}
