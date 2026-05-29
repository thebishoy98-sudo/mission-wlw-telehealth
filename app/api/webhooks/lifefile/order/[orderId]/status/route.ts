import { NextRequest } from "next/server";
import { handleLifeFileWebhook } from "@/lib/lifefile-webhook-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  return handleLifeFileWebhook(req, orderId);
}

export const PUT = POST;
