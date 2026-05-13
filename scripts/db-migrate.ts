/**
 * Run once to initialize the Postgres schema.
 * Usage: npx tsx scripts/db-migrate.ts
 *
 * Requires: POSTGRES_URL env var (from Vercel: npx vercel env pull .env.local)
 */

import { sql } from "@vercel/postgres";
import fs from "fs";
import path from "path";

async function migrate() {
  console.log("Running database migration...");
  const schema = fs.readFileSync(path.join(__dirname, "../lib/schema.sql"), "utf-8");

  // Split on semicolons to run each statement separately
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  let ok = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await sql.query(stmt + ";");
      ok++;
    } catch (e: any) {
      // Ignore "already exists" errors from CREATE IF NOT EXISTS
      if (!e.message?.includes("already exists")) {
        console.error("Failed:", stmt.slice(0, 60), "\n  →", e.message);
        failed++;
      } else {
        ok++;
      }
    }
  }

  console.log(`Migration complete: ${ok} statements ok, ${failed} failed.`);
}

migrate().catch(console.error);
