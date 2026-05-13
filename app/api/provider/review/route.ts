import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as spruce from "@/services/spruce";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, action, notes, rejectionReason, reviewedBy } = body;

    if (!orderId || !action || !reviewedBy) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, action, reviewedBy" },
        { status: 400 }
      );
    }

    if (!["approve", "reject", "needs_more_info"].includes(action)) {
      return NextResponse.json(
        { error: "action must be approve | reject | needs_more_info" },
        { status: 400 }
      );
    }

    const order = db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "pending_review" && order.status !== "approved") {
      return NextResponse.json(
        { error: `Cannot review order in status: ${order.status}` },
        { status: 409 }
      );
    }

    const review = db.providerReviewDb.getByOrder(orderId);

    if (action === "approve") {
      db.orderDb.update(orderId, {
        status: "sent_to_pharmacy",
        approvedAt: new Date().toISOString(),
        providerNotes: notes,
      });

      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "approved",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        });
      } else {
        db.providerReviewDb.create({
          id: generateId(),
          orderId,
          patientId: order.patientId,
          status: "approved",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        });
      }

      // Send approval SMS
      try {
        spruce.sendMessage(order.patientId, "approved", { orderId });
      } catch { /* non-fatal */ }

      db.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "system",
        action: "Provider approved order",
        orderId,
        patientId: order.patientId,
        status: "success",
        details: { reviewedBy, notes },
      });

    } else if (action === "reject") {
      if (!rejectionReason) {
        return NextResponse.json(
          { error: "rejectionReason required for reject action" },
          { status: 400 }
        );
      }

      db.orderDb.update(orderId, {
        status: "rejected",
        rejectionReason,
        providerNotes: notes,
      });

      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "rejected",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          rejectionReason,
          notes,
        });
      }

      // Send rejection SMS
      try {
        spruce.sendMessage(order.patientId, "rejected", { orderId });
      } catch { /* non-fatal */ }

      db.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "system",
        action: "Provider rejected order",
        orderId,
        patientId: order.patientId,
        status: "success",
        details: { reviewedBy, rejectionReason, notes },
      });

    } else {
      // needs_more_info
      db.orderDb.update(orderId, {
        status: "pending_review",
        providerNotes: notes,
      });

      if (review) {
        db.providerReviewDb.update(review.id, {
          status: "needs_more_info",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        });
      }
    }

    return NextResponse.json({ success: true, action, orderId });
  } catch (err) {
    console.error("Provider review error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
