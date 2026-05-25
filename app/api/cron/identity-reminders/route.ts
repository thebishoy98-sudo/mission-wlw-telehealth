/**
 * Cron: Identity Verification Reminders
 *
 * Runs daily (see vercel.json). Finds orders where:
 *   - payment is completed
 *   - pharmacy is still draft (blocked, identity not verified)
 *   - submitted 1 or 2 days ago
 *
 * Sends a day-1 or day-2 SMS reminder via Spruce.
 * Stops after 2 days — admin follow-up required beyond that.
 *
 * Protected via CRON_SECRET env var (Vercel sets Authorization header automatically).
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import * as spruce from "@/services/spruce";
import * as db from "@/lib/db";
import { generateId } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / DAY_MS;
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel Cron call
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { orderId: string; patientId: string; day: number; status: string }[] = [];

  try {
    if (!process.env.POSTGRES_URL) {
      // No server DB — nothing to do in dev without Postgres
      return NextResponse.json({ skipped: "No POSTGRES_URL configured", results: [] });
    }

    // Find paid orders still blocked at pharmacy (proxy for identity not verified)
    // submitted_at between 20h and 72h ago covers both day-1 and day-2 windows
    const { rows } = await sql`
      SELECT o.id, o.patient_id, o.submitted_at, p.phone, p.first_name, p.last_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.payment_status = 'completed'
        AND o.pharmacy_status = 'draft'
        AND COALESCE(o.identity_status, 'missing') = 'missing'
        AND o.submitted_at IS NOT NULL
        AND o.submitted_at < NOW() - INTERVAL '20 hours'
        AND o.submitted_at > NOW() - INTERVAL '72 hours'
      ORDER BY o.submitted_at ASC
    `;

    for (const row of rows) {
      const days = daysSince(row.submitted_at);
      // Day 1 window: 20h–47h, Day 2 window: 47h–72h
      const reminderDay = days < 2 ? 1 : 2;
      const templateKey = reminderDay === 1 ? "identity_reminder_day1" : "identity_reminder_day2";

      try {
        // Build a minimal patient object for Spruce (avoids needing full DB read)
        const patientOverride = {
          id: row.patient_id,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
        } as any;

        spruce.sendMessage(row.patient_id, templateKey, { orderId: row.id }, patientOverride);

        results.push({ orderId: row.id, patientId: row.patient_id, day: reminderDay, status: "sent" });
      } catch (err: any) {
        results.push({ orderId: row.id, patientId: row.patient_id, day: reminderDay, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      runAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Cron identity-reminders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow POST too (for manual trigger from admin)
export const POST = GET;
