/**
 * Peptide Shop Checkout — direct-to-consumer, no provider review.
 *
 * Unlike /api/payments/charge, this endpoint intentionally skips the medical
 * questionnaire, consent signature, identity verification, and pharmacy
 * dispatch gates. It only accepts products explicitly tagged with a shop
 * `category` (data/products.ts) — prescription GLP-1 products are never
 * reachable here. Orders land as `approved` / `pharmacyStatus: draft` with a
 * provider note so an admin can manually fulfill and ship them.
 */
import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { seedProducts } from "@/data/seed-data";
import { normalizeCustomerProducts } from "@/data/products";
import * as qbPayments from "@/services/quickbooks-payments";
import { shouldBypassQuickBooksPayment } from "@/lib/payment-bypass";
import { generateId } from "@/lib/utils";
import type { Order, Patient, Payment } from "@/types";

interface CheckoutItem {
  productId: string;
  doseId: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: CheckoutItem[] = Array.isArray(body.items) ? body.items : [];
    const contact = body.contact ?? {};
    const shippingAddress = body.shippingAddress ?? {};
    const card = body.card ?? {};

    if (!items.length) {
      return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    }
    if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
      return NextResponse.json({ error: "Contact details are required." }, { status: 400 });
    }
    if (!shippingAddress.street1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
      return NextResponse.json({ error: "A complete shipping address is required." }, { status: 400 });
    }

    const dbProducts = await dbServer.productDb.getAll().catch(() => []);
    const catalog = normalizeCustomerProducts(dbProducts.length ? dbProducts : seedProducts);
    const peptideCatalog = catalog.filter((p) => !!p.category);

    const lines = items.map((item) => {
      const product = peptideCatalog.find((p) => p.id === item.productId);
      const dose = product?.doses.find((d) => d.id === item.doseId);
      const quantity = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)));
      return { product, dose, quantity };
    });

    if (lines.some((line) => !line.product || !line.dose)) {
      return NextResponse.json(
        { error: "One or more items are no longer available in the peptide shop." },
        { status: 400 }
      );
    }

    const total = lines.reduce((sum, line) => sum + line.dose!.price * line.quantity, 0);
    if (!(total > 0)) {
      return NextResponse.json({ error: "Order total must be greater than zero." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const address = {
      street1: String(shippingAddress.street1),
      street2: shippingAddress.street2 ?? "",
      city: String(shippingAddress.city),
      state: String(shippingAddress.state),
      zipCode: String(shippingAddress.zipCode),
      country: shippingAddress.country ?? "USA",
    };

    let patient = await dbServer.patientDb.getByEmail(contact.email).catch(() => null);
    const patientData: Patient = {
      id: patient?.id ?? `patient_${generateId()}`,
      firstName: String(contact.firstName),
      lastName: String(contact.lastName),
      dateOfBirth: patient?.dateOfBirth ?? "",
      gender: patient?.gender ?? "other",
      phone: String(contact.phone),
      email: String(contact.email),
      address,
      shippingAddress: address,
      createdAt: patient?.createdAt ?? now,
      updatedAt: now,
    };
    patient = patient
      ? await dbServer.patientDb.update(patient.id, patientData)
      : await dbServer.patientDb.create(patientData);
    if (!patient) {
      return NextResponse.json(
        { error: "Could not save your contact details. Please try again." },
        { status: 503 }
      );
    }

    const bypassPayment = shouldBypassQuickBooksPayment();
    let chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
    if (bypassPayment) {
      chargeResult = {
        chargeId: `peptide_bypass_${generateId()}`,
        status: "CAPTURED",
        cardLast4: String(card.number ?? "").replace(/\D/g, "").slice(-4) || "0000",
        cardBrand: "test",
      };
    } else {
      try {
        chargeResult = await qbPayments.chargeCard(`peptide_cart_${generateId()}`, patient.id, total, {
          cardNumber: card.number,
          expMonth: card.expMonth,
          expYear: card.expYear,
          cvc: card.cvc,
          cardName: card.name,
          billingAddress: address,
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message ?? "Payment failed." }, { status: 402 });
      }
    }

    const orderIds: string[] = [];
    for (const line of lines) {
      const orderId = `order_${generateId()}`;
      const order: Order = {
        id: orderId,
        patientId: patient.id,
        productId: line.product!.id,
        doseId: line.dose!.id,
        status: "approved",
        paymentStatus: "completed",
        pharmacyStatus: "draft",
        practiceQStatus: "skipped",
        quickbooksStatus: "skipped",
        providerNotes: `Direct peptide-shop checkout (qty ${line.quantity}) — no clinical questionnaire, consent, or provider review was collected. Fulfill and ship directly.`,
        createdAt: now,
        updatedAt: now,
      };
      await dbServer.orderDb.create(order);

      const payment: Payment = {
        id: `payment_${generateId()}`,
        orderId,
        patientId: patient.id,
        amount: line.dose!.price * line.quantity,
        currency: "USD",
        status: "completed",
        paymentMethod: "credit_card",
        cardLast4: chargeResult.cardLast4,
        cardBrand: chargeResult.cardBrand,
        transactionId: chargeResult.chargeId,
        createdAt: now,
        processedAt: now,
      };
      await dbServer.paymentDb.create(payment);
      orderIds.push(orderId);
    }

    return NextResponse.json({ success: true, orderIds, chargeId: chargeResult.chargeId });
  } catch (err) {
    console.error("Peptide checkout error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
