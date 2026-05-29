import { NextResponse } from "next/server";
import { Client } from "pg";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/server-auth";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (process.env.ENABLE_DB_MIGRATION_API !== "true") {
    return NextResponse.json({ error: "Migration API is disabled" }, { status: 403 });
  }

  const connStr = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!connStr) {
    return NextResponse.json({ error: "Database URL is not configured" }, { status: 500 });
  }

  const schemaPath = path.join(process.cwd(), "lib", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const statements = schema
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 5);

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let ok = 0;
    const failures: Array<{ statement: string; error: string }> = [];
    for (const stmt of statements) {
      try {
        await client.query(`${stmt};`);
        ok += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already exists")) {
          ok += 1;
        } else {
          failures.push({ statement: stmt.slice(0, 100), error: message });
        }
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      ok,
      failed: failures.length,
      failures,
    }, { status: failures.length ? 500 : 200 });
  } finally {
    await client.end();
  }
}
