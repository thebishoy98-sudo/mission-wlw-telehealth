import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

export async function POST(req: NextRequest) {
  try {
    const { orderId, reviewedBy = "manual-review", notes } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const update = {
      identityStatus: "manual_approved" as const,
      identityReason: notes ?? "Identity manually approved.",
      identityReviewedAt: new Date().toISOString(),
      identityReviewedBy: reviewedBy,
    };

    db.orderDb.update(orderId, update);
    await dbServer.orderDb.update(orderId, update).catch(() => {});

    const review = db.providerReviewDb.getByOrder(orderId);
    if (review) {
      db.providerReviewDb.update(review.id, {
        identityReviewRequired: false,
        notes: notes ?? review.notes,
      });
      await dbServer.providerReviewDb.update(review.id, {
        identityReviewRequired: false,
        notes: notes ?? review.notes,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, orderId, identityStatus: update.identityStatus });
  } catch (error) {
    console.error("Identity approval error:", error);
    return NextResponse.json({ error: "Identity approval failed" }, { status: 500 });
  }
}
