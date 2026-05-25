import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import { generateId } from "@/lib/utils";
import type { Product } from "@/types";
import { seedProducts } from "@/data/seed-data";

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const dynamic = "force-dynamic";

const hasProductionDatabase = () =>
  !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const products = await dbServer.productDb.getAll().catch(() => []);
  const localProducts = db.productDb.getAll();
  return NextResponse.json({ products: products.length ? products : (localProducts.length ? localProducts : seedProducts) });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json();
  if (!body.name || !body.description || !body.startingPrice) {
    return NextResponse.json({ error: "name, description, and startingPrice are required" }, { status: 400 });
  }

  const product: Product = {
    id: generateId(),
    name: body.name,
    slug: slugify(body.name),
    description: body.description,
    longDescription: body.longDescription ?? body.description,
    startingPrice: Number(body.startingPrice),
    image: body.image || "/product-placeholder.svg",
    doses: body.doses?.length ? body.doses : [
      {
        id: generateId(),
        label: "Standard",
        strength: "1x",
        quantity: 4,
        price: Number(body.startingPrice),
      },
    ],
    eligibilityNote: body.eligibilityNote ?? "",
    isActive: true,
    faqs: body.faqs ?? [],
    createdAt: new Date().toISOString(),
  };

  try {
    await dbServer.productDb.upsert(product);
  } catch (error) {
    return NextResponse.json(
      { error: "Product could not be saved to the production database." },
      { status: 500 }
    );
  }

  if (!hasProductionDatabase()) {
    db.productDb.create(product);
  }

  return NextResponse.json({ product }, { status: 201 });
}
