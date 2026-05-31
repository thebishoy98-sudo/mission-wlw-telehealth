import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { generateId } from "@/lib/utils";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { orderId, action, reviewedBy } = body;

    if (!orderId || !action || !reviewedBy) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, action, reviewedBy" },
        { status: 400 }
      );
    }

    if (action !== "mark_chart_viewed") {
      return NextResponse.json(
        { error: "action must be mark_chart_viewed" },
        { status: 400 }
      );
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);

    const now = new Date().toISOString();
    const viewUpdate = {
      chartViewedAt: now,
      chartViewedBy: reviewedBy,
    };
    let providerReview;
    if (review) {
      db.providerReviewDb.update(review.id, viewUpdate);
      const updatedReview = await dbServer.providerReviewDb.update(review.id, viewUpdate).catch(() => null);
      providerReview = updatedReview ?? { ...review, ...viewUpdate };
    } else {
      const createdReview = {
        id: generateId(),
        orderId,
        patientId: order.patientId,
        status: "pending" as const,
        chartViewedAt: now,
        chartViewedBy: reviewedBy,
      };
      db.providerReviewDb.create(createdReview);
      await dbServer.providerReviewDb.create(createdReview).catch(() => {});
      providerReview = createdReview;
    }

    const log = {
      id: generateId(),
      timestamp: now,
      integrationName: "system" as const,
      action: "Provider marked chart reviewed",
      orderId,
      patientId: order.patientId,
      status: "success" as const,
      details: { reviewedBy },
    };
    db.integrationLogDb.create(log);
    await dbServer.integrationLogDb.create(log).catch(() => {});

    return NextResponse.json({ success: true, action, orderId, review: providerReview });
  } catch (err) {
    console.error("Provider review error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
