import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import * as quickbooks from "@/services/quickbooks";
import { generateId } from "@/lib/utils";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const order = await dbServer.orderDb.getById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [patient, product, payment] = await Promise.all([
      dbServer.patientDb.getById(order.patientId),
      dbServer.productDb.getById(order.productId),
      dbServer.paymentDb.getByOrder(order.id),
    ]);

    if (!patient || !product || !payment) {
      return NextResponse.json(
        { error: "Missing patient, product, or payment for QuickBooks sync" },
        { status: 409 }
      );
    }

    try {
      const qbCustomerId = await quickbooks.createCustomerRecord(patient);
      const invoiceId = await quickbooks.createInvoice(order, payment, {
        patient,
        product,
        qbCustomerId,
      });
      await quickbooks.recordPayment(invoiceId, payment.amount, qbCustomerId);
      await dbServer.orderDb.update(order.id, { quickbooksStatus: "invoiced" });

      return NextResponse.json({
        success: true,
        orderId,
        qbCustomerId,
        invoiceId,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      await dbServer.orderDb.update(order.id, { quickbooksStatus: "error" });
      await dbServer.integrationLogDb.create({
        id: generateId(),
        timestamp: new Date().toISOString(),
        integrationName: "quickbooks",
        action: "QuickBooks manual sync failed",
        orderId,
        patientId: patient.id,
        status: "error",
        details: { amount: payment.amount, transactionId: payment.transactionId },
        error: errorMessage,
      }).catch(() => {});
      return NextResponse.json(
        { error: "QuickBooks sync failed", detail: errorMessage },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("QuickBooks sync route error:", error);
    return NextResponse.json({ error: "QuickBooks sync failed" }, { status: 500 });
  }
}
