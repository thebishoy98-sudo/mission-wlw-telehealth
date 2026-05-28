import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { seedProducts } from "@/data/seed-data";
import { normalizeProducts } from "@/data/products";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await dbServer.productDb.getAll().catch(() => []);
  const localProducts = db.productDb.getActive();
  return NextResponse.json({
    products: normalizeProducts(products.length ? products : (localProducts.length ? localProducts : seedProducts)),
  });
}
