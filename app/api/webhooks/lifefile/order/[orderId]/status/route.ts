import { NextRequest } from "next/server";
import { handleLifeFileWebhook } from "@/lib/lifefile-webhook-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  return handleLifeFileWebhook(req, params.orderId);
}

export const PUT = POST;
