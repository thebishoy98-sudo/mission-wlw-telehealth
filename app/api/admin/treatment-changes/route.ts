import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getStaffSessionFromRequest } from "@/lib/staff-session";
import { sql, productDb } from "@/lib/db.server";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { rows } = await sql`
    SELECT s.id, s.product_id, s.dose_id, s.status,
      p.first_name, p.last_name, pr.name AS product_name, pr.doses
    FROM subscriptions s JOIN patients p ON p.id = s.patient_id
    JOIN products pr ON pr.id = s.product_id
    WHERE pr.slug = 'retatrutide' AND s.status IN ('active', 'paused')
    ORDER BY p.last_name, p.first_name
  `;
  const product = await productDb.getBySlug("tirzepatide");
  return NextResponse.json({ subscriptions: rows, product });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  if (body.providerApproved !== true || typeof body.providerName !== "string" || !body.providerName.trim()) {
    return NextResponse.json({ error: "Record the approving provider and confirm their prescribed dose." }, { status: 400 });
  }
  const product = await productDb.getBySlug("tirzepatide");
  const dose = product?.doses.find(d => d.id === body.doseId);
  if (!product?.isActive || !dose || !Number.isFinite(Number(dose.price)) || Number(dose.price) <= 0) {
    return NextResponse.json({ error: "Select an available Tirzepatide prescription." }, { status: 400 });
  }
  const actor = getStaffSessionFromRequest(req)?.email ?? "admin";
  // One atomic statement updates the subscription, unpaid refills and audit.
  // Keep billing paused until staff deliberately reactivate from Subscriptions.
  const { rows } = await sql`
    WITH changed AS (
      UPDATE subscriptions s SET product_id = ${product.id}, dose_id = ${dose.id},
        status = 'paused', skip_next_dispatch = false, next_charge_override = NULL,
        next_charge_note = NULL, updated_at = NOW()
      FROM products old
      WHERE s.id = ${String(body.subscriptionId ?? '')} AND old.id = s.product_id
        AND old.slug = 'retatrutide' AND s.status IN ('active', 'paused')
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.subscription_id = s.id AND o.status = 'processing')
      RETURNING s.id, s.patient_id
    ), refills AS (
      UPDATE orders o SET product_id = ${product.id}, dose_id = ${dose.id}, updated_at = NOW()
      FROM changed c WHERE o.subscription_id = c.id AND o.is_refill = true
        AND o.payment_status IN ('pending', 'failed')
        AND o.status NOT IN ('cancelled', 'refunded', 'processing')
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'completed')
      RETURNING o.id
    ), audit AS (
      INSERT INTO integration_logs (id, integration_name, action, patient_id, status, details)
      SELECT ${generateId()}, 'system', 'Retatrutide subscription changed', patient_id, 'success',
        ${JSON.stringify({ actor, providerName: body.providerName.trim(), subscriptionId: body.subscriptionId,
          previousProduct: "retatrutide", productId: product.id, doseId: dose.id, weeklyDoseMg: dose.weeklyDoseMg,
          price: Number(dose.price), status: "paused" })}::jsonb FROM changed
      RETURNING id
    ) SELECT id FROM changed
  `;
  if (!rows.length) return NextResponse.json({ error: "Subscription changed or payment is in progress. Refresh and review before retrying." }, { status: 409 });
  return NextResponse.json({ success: true });
}
