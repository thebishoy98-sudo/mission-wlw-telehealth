import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import type { Product } from "@/types";

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hasProductionDatabase = () =>
  !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json();
  const update = {
    ...body,
    slug: body.name ? slugify(body.name) : undefined,
    startingPrice: body.startingPrice === undefined ? undefined : Number(body.startingPrice),
  };

  let server: Product | null = null;
  try {
    server = await dbServer.productDb.update(params.id, update);
  } catch (error) {
    return NextResponse.json(
      { error: "Product could not be updated in the production database." },
      { status: 500 }
    );
  }
  const local = hasProductionDatabase() ? null : db.productDb.update(params.id, update);
  if (!local && !server) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json({ product: server ?? local });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let archived = false;
  try {
    archived = await dbServer.productDb.archive(params.id);
  } catch (error) {
    return NextResponse.json(
      { error: "Product could not be archived in the production database." },
      { status: 500 }
    );
  }
  if (hasProductionDatabase() && !archived) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (!hasProductionDatabase()) {
    db.productDb.delete(params.id);
  }
  return NextResponse.json({ success: true });
}
