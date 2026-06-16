/**
 * One-off reconciliation for the status-regression bug (commit 506faef).
 *
 * A late/out-of-order LifeFile `order.shipped` webhook arriving after the FedEx
 * tracking sync had already marked an order `delivered` overwrote the status
 * back to `shipped`. The delivered_at timestamp was left intact, so affected
 * rows are stuck displaying `shipped` while having a delivered_at value — and
 * the FedEx sync cron will never pick them up again (its query requires
 * delivered_at IS NULL).
 *
 * This script finds pharmacy_orders that are `shipped` but have a delivered_at
 * timestamp, and restores them (and their parent order) to `delivered`.
 *
 * Usage (inside prod env via a Render one-off job):
 *   node scripts/reconcile-delivered-not-shipped.js            # dry run (default)
 *   node scripts/reconcile-delivered-not-shipped.js --apply    # write changes
 *
 * Idempotent: re-running after --apply finds nothing to fix.
 */

const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("POSTGRES_URL is not set — aborting.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // Affected rows: pharmacy order delivered (delivered_at set) but status
    // regressed back to 'shipped'.
    const { rows: affected } = await client.query(`
      SELECT po.id AS pharmacy_order_id,
             po.order_id,
             po.status AS pharmacy_status,
             po.delivered_at,
             o.status AS order_status,
             o.pharmacy_status AS order_pharmacy_status
      FROM pharmacy_orders po
      JOIN orders o ON o.id = po.order_id
      WHERE po.status = 'shipped'
        AND po.delivered_at IS NOT NULL
      ORDER BY po.delivered_at ASC
    `);

    console.log(`Found ${affected.length} order(s) stuck at 'shipped' despite a delivered_at timestamp.`);
    for (const row of affected) {
      console.log(
        `  - order ${row.order_id} (pharmacy ${row.pharmacy_order_id}) ` +
          `delivered_at=${row.delivered_at} order.status=${row.order_status} ` +
          `order.pharmacy_status=${row.order_pharmacy_status}`
      );
    }

    if (affected.length === 0) {
      console.log("Nothing to reconcile. ✅");
      return;
    }

    if (!APPLY) {
      console.log("\nDry run — no changes written. Re-run with --apply to fix.");
      return;
    }

    const orderIds = affected.map((r) => r.order_id);
    const pharmacyOrderIds = affected.map((r) => r.pharmacy_order_id);

    await client.query("BEGIN");

    const pharmacyResult = await client.query(
      `UPDATE pharmacy_orders SET status = 'delivered'
       WHERE id = ANY($1::text[]) AND status = 'shipped' AND delivered_at IS NOT NULL`,
      [pharmacyOrderIds]
    );

    // Only advance the order if it is currently behind 'delivered' (shipped).
    // Never touch orders that are cancelled/refunded or already delivered.
    const orderResult = await client.query(
      `UPDATE orders SET status = 'delivered', pharmacy_status = 'delivered', updated_at = NOW()
       WHERE id = ANY($1::text[]) AND status = 'shipped'`,
      [orderIds]
    );

    await client.query("COMMIT");

    console.log(`\nApplied:`);
    console.log(`  pharmacy_orders updated → delivered: ${pharmacyResult.rowCount}`);
    console.log(`  orders updated → delivered:          ${orderResult.rowCount}`);
    console.log("Done. ✅");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Reconciliation failed:", err);
  process.exit(1);
});
