import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { loadProviderPatientChart } from "@/lib/provider-chart";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { getStaffSessionFromRequest } from "@/lib/staff-session";
import { logPhiAccess, actorFromHeaders } from "@/lib/phi-audit";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const auditCtx = actorFromHeaders(req.headers);
    logPhiAccess({
      action: "view", resource: "patient", resourceId: id,
      patientId: id, actor: auditCtx.actor,
      actorIp: auditCtx.actorIp, requestId: auditCtx.requestId,
      outcome: "success",
    });
    const chart = await loadProviderPatientChart(id, {
      selectedOrderId: req.nextUrl.searchParams.get("orderId") ?? undefined,
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
      practiceqAutomationJobs: dbServer.practiceqAutomationJobDb,
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
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { orderId, action } = await req.json();
    const patchSession = getStaffSessionFromRequest(req);
    const reviewedBy = patchSession?.name ?? patchSession?.email ?? "provider";
    if (!orderId || action !== "mark_chart_viewed") {
      return NextResponse.json({ error: "orderId and action=mark_chart_viewed required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const review = await dbServer.providerReviewDb.getByOrder(orderId);
    let updated;
    if (review) {
      if (review.patientId !== id) {
        return NextResponse.json({ error: "Review not found" }, { status: 404 });
      }
      updated = await dbServer.providerReviewDb.update(review.id, {
        chartViewedAt: now,
        chartViewedBy: reviewedBy,
      });
    } else {
      const order = await dbServer.orderDb.getById(orderId);
      if (!order || order.patientId !== id) {
        return NextResponse.json({ error: "Review not found" }, { status: 404 });
      }
      updated = {
        id: generateId(),
        orderId,
        patientId: id,
        status: "pending" as const,
        chartViewedAt: now,
        chartViewedBy: reviewedBy,
      };
      await dbServer.providerReviewDb.create(updated);
    }

    const responseReview = updated ?? {
      ...review,
      chartViewedAt: now,
      chartViewedBy: reviewedBy,
    };

    await dbServer.integrationLogDb.create({
      id: `log_chartview_${Date.now()}`,
      timestamp: now,
      integrationName: "system",
      action: `Provider confirmed chart review for order ${orderId.slice(-6)}`,
      orderId,
      patientId: id,
      status: "success",
      details: { action: "chart_reviewed", reviewedBy },
    }).catch(() => {});

    return NextResponse.json({ success: true, review: responseReview });
  } catch (error) {
    console.error("Provider chart update error:", error);
    return NextResponse.json({ error: "Provider chart update failed" }, { status: 500 });
  }
}
