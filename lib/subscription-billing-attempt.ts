import { sql } from "@/lib/db.server";
import { generateId } from "@/lib/utils";

/** Reserve an attempt before contacting the gateway. The subscription row update
 * serializes concurrent cron invocations and defers any retry by three days.
 * Old failure events count too, so existing repeatedly declined cards stop. */
export async function reserveSubscriptionAttempt(subscriptionId: string) {
  const { rows } = await sql`
    WITH claimed AS (
      UPDATE subscriptions SET next_run_at = NOW() + INTERVAL '3 days', updated_at = NOW()
      WHERE id = ${subscriptionId} AND status = 'active' AND next_run_at <= NOW()
      RETURNING id, patient_id, last_charged_at
    ), attempts AS (
      SELECT c.*, (SELECT COUNT(*)::int FROM integration_logs l
        WHERE l.details->>'subscriptionId' = c.id
          AND (c.last_charged_at IS NULL OR l.timestamp > c.last_charged_at)
          AND (l.action = 'Subscription billing attempt reserved'
            OR (l.action IN ('Subscription auto-charge failed; pay-link sent', 'Subscription charge-only failed')
              AND COALESCE(l.details->>'billingAttemptReserved', 'false') != 'true'))
      ) AS previous_attempts FROM claimed c
    ), logged AS (
      INSERT INTO integration_logs (id, integration_name, action, patient_id, status, details)
      SELECT ${generateId()}, 'quickbooks', 'Subscription billing attempt reserved', patient_id, 'success',
        jsonb_build_object('subscriptionId', id, 'attempt', previous_attempts + 1)
      FROM attempts WHERE previous_attempts < 3 RETURNING id
    ) SELECT previous_attempts FROM attempts
  `;
  if (!rows.length) return { allowed: false, exhausted: false, attempt: 0 };
  const attempt = Number(rows[0].previous_attempts) + 1;
  return { allowed: attempt <= 3, exhausted: attempt > 3, attempt };
}
