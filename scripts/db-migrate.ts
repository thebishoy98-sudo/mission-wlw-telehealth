/**
 * Run once to initialize the Postgres schema.
 * Usage: POSTGRES_URL_NON_POOLING=<direct-url> npx tsx scripts/db-migrate.ts
 *
 * Uses pg directly (not @vercel/postgres) because DDL requires a direct
 * (non-pooled) connection. The pooled URL is used by the app at runtime.
 */

import { Client } from "pg";
import fs from "fs";
import path from "path";

async function migrate() {
  const connStr =
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    "";

  if (!connStr) {
    console.error("Error: set POSTGRES_URL_NON_POOLING or POSTGRES_URL env var");
    process.exit(1);
  }

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to database.");

  const schema = fs.readFileSync(path.join(__dirname, "../lib/schema.sql"), "utf-8");

  // Remove single-line comments, then split on semicolons
  const cleaned = schema.replace(/--[^\n]*/g, "");
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  let ok = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await client.query(stmt + ";");
      ok++;
    } catch (e: any) {
      if (e.message?.includes("already exists")) {
        ok++;
      } else {
        console.error("Failed:", stmt.slice(0, 80).replace(/\n/g, " "), "\n  →", e.message);
        failed++;
      }
    }
  }

  await client.end();
  console.log(`\nMigration complete: ${ok} statements ok, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

migrate().catch((e) => { console.error(e); process.exit(1); });
