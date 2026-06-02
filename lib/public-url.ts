type RequestLike = {
  headers?: {
    get(name: string): string | null;
  };
};

function cleanBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : "";
}

export function getPublicBaseUrl(req?: RequestLike) {
  const configured =
    cleanBaseUrl(process.env.APP_BASE_URL) ||
    cleanBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL) ||
    cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    cleanBaseUrl(process.env.RENDER_EXTERNAL_URL);

  if (configured) return configured;

  const headers = req?.headers;
  const forwardedHost = headers?.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers?.get("host")?.split(",")[0]?.trim();
  if (!host) return "";

  const forwardedProto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
