import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import * as spruce from "@/services/spruce";
import * as spruceServer from "@/services/spruce.server";
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

    const order =
      (await dbServer.orderDb.getById(orderId).catch(() => null)) ??
      db.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "pending_review" && order.status !== "approved") {
      return NextResponse.json(
        { error: `Cannot review order in status: ${order.status}` },
        { status: 409 }
      );
    }

    const review =
      (await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null)) ??
      db.providerReviewDb.getByOrder(orderId);

    if (action === "approve") {
      const orderUpdate = {
        status: "approved" as const,
        approvedAt: new Date().toISOString(),
        providerNotes: notes,
      };
      db.orderDb.update(orderId, orderUpdate);
      await dbServer.orderDb.update(orderId, orderUpdate).catch(() => {});

      if (review) {
        const reviewUpdate = {
          status: "approved",
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        } as const;
        db.providerReviewDb.update(review.id, reviewUpdate);
        await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
      } else {
        const createdReview = {
          id: generateId(),
          orderId,
          patientId: order.patientId,
          status: "approved" as const,
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        };
        db.providerReviewDb.create(createdReview);
        await dbServer.providerReviewDb.create(createdReview).catch(() => {});
      }

      // Send approval SMS
      try {
        const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
        if (patient) {
          await spruceServer.sendMessage(patient, "approved", { orderId });
        } else {
          spruce.sendMessage(order.patientId, "approved", { orderId });
        }
      } catch { /* non-fatal */ }

      const log = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "system" as const,
        action: "Provider approved order",
        orderId,
        patientId: order.patientId,
        status: "success" as const,
        details: { reviewedBy, notes },
      };
      db.integrationLogDb.create(log);
      await dbServer.integrationLogDb.create(log).catch(() => {});

    } else if (action === "reject") {
      if (!rejectionReason) {
        return NextResponse.json(
          { error: "rejectionReason required for reject action" },
          { status: 400 }
        );
      }

      const orderUpdate = {
        status: "rejected" as const,
        rejectionReason,
        providerNotes: notes,
      };
      db.orderDb.update(orderId, orderUpdate);
      await dbServer.orderDb.update(orderId, orderUpdate).catch(() => {});

      if (review) {
        const reviewUpdate = {
          status: "rejected" as const,
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          rejectionReason,
          notes,
        };
        db.providerReviewDb.update(review.id, reviewUpdate);
        await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
      }

      // Send rejection SMS
      try {
        const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
        if (patient) {
          await spruceServer.sendMessage(patient, "rejected", { orderId });
        } else {
          spruce.sendMessage(order.patientId, "rejected", { orderId });
        }
      } catch { /* non-fatal */ }

      const log = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "system" as const,
        action: "Provider rejected order",
        orderId,
        patientId: order.patientId,
        status: "success" as const,
        details: { reviewedBy, rejectionReason, notes },
      };
      db.integrationLogDb.create(log);
      await dbServer.integrationLogDb.create(log).catch(() => {});

    } else {
      // needs_more_info
      const orderUpdate = {
        status: "pending_review" as const,
        providerNotes: notes,
      };
      db.orderDb.update(orderId, orderUpdate);
      await dbServer.orderDb.update(orderId, orderUpdate).catch(() => {});

      if (review) {
        const reviewUpdate = {
          status: "needs_more_info" as const,
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          notes,
        };
        db.providerReviewDb.update(review.id, reviewUpdate);
        await dbServer.providerReviewDb.update(review.id, reviewUpdate).catch(() => {});
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
