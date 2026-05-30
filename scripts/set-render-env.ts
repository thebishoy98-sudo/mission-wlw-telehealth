/**
 * Sets required sync:false env vars on Render services using the Render API.
 *
 * Usage:
 *   RENDER_API_KEY=<your-key> npx ts-node -P tsconfig.scripts.json -r tsconfig-paths/register scripts/set-render-env.ts
 *
 * Get your Render API key from: https://dashboard.render.com/u/settings#api-keys
 */

const RENDER_API = "https://api.render.com/v1";
const RENDER_API_KEY = process.env.RENDER_API_KEY ?? "";

// The env vars to set on the practiceq-remote service
const REMOTE_WORKER_VARS: Record<string, string> = {
  PRACTICEQ_API_KEY: process.env.PRACTICEQ_API_KEY ?? "7b0974fe71a6d15c49eed31a72f741382f367da8",
  PRACTICEQ_ADMIN_EMAIL: process.env.PRACTICEQ_ADMIN_EMAIL ?? "bishoykamel9@gmail.com",
  PRACTICEQ_ADMIN_PASSWORD: process.env.PRACTICEQ_ADMIN_PASSWORD ?? "Sprint1!",
  PRACTICEQ_QUESTIONNAIRE_ID: process.env.PRACTICEQ_QUESTIONNAIRE_ID ?? "67290c53cc6252ed4d6c90ac",
};

// Also set on the main web service
const MAIN_WEB_VARS: Record<string, string> = {
  PRACTICEQ_API_KEY: process.env.PRACTICEQ_API_KEY ?? "7b0974fe71a6d15c49eed31a72f741382f367da8",
  PRACTICEQ_QUESTIONNAIRE_ID: process.env.PRACTICEQ_QUESTIONNAIRE_ID ?? "67290c53cc6252ed4d6c90ac",
  PRACTICEQ_ADMIN_EMAIL: process.env.PRACTICEQ_ADMIN_EMAIL ?? "bishoykamel9@gmail.com",
  PRACTICEQ_ADMIN_PASSWORD: process.env.PRACTICEQ_ADMIN_PASSWORD ?? "Sprint1!",
  PRACTICEQ_ADMIN_STORAGE_STATE_JSON: process.env.PRACTICEQ_ADMIN_STORAGE_STATE_JSON ?? "",
  ADMIN_SECRET: process.env.ADMIN_SECRET ?? "",
  CRON_SECRET: process.env.CRON_SECRET ?? "",
};

async function renderFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function listServices() {
  const { status, body } = await renderFetch("/services?limit=20");
  if (status !== 200) throw new Error(`List services failed (${status}): ${JSON.stringify(body)}`);
  return (body as any[]).map((s: any) => ({ id: s.service?.id, name: s.service?.name }));
}

async function setEnvVars(serviceId: string, vars: Record<string, string>) {
  const envVars = Object.entries(vars)
    .filter(([, v]) => v !== "")
    .map(([key, value]) => ({ key, value }));

  if (!envVars.length) {
    console.log("  No non-empty vars to set.");
    return;
  }

  const { status, body } = await renderFetch(`/services/${serviceId}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(envVars),
  });
  if (status !== 200 && status !== 201) {
    console.error(`  Failed to set env vars (${status}):`, JSON.stringify(body));
  } else {
    console.log(`  Set ${envVars.length} env vars (${status}).`);
  }
}

async function triggerDeploy(serviceId: string) {
  const { status, body } = await renderFetch(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  if (status === 201) {
    console.log("  Triggered redeploy.");
  } else {
    console.log(`  Redeploy response (${status}):`, JSON.stringify(body).slice(0, 200));
  }
}

async function main() {
  if (!RENDER_API_KEY) {
    console.error("Set RENDER_API_KEY env var first.");
    console.error("Get one from: https://dashboard.render.com/u/settings#api-keys");
    process.exit(1);
  }

  console.log("Listing Render services...");
  const services = await listServices();
  console.log("Services found:", services.map((s) => `${s.name} (${s.id})`).join(", "));

  const remoteWorker = services.find((s) => s.name === "mission-wlw-practiceq-remote");
  const mainWeb = services.find((s) => s.name === "mission-wlw-web");

  if (remoteWorker) {
    console.log(`\nSetting env vars on remote worker (${remoteWorker.id})...`);
    await setEnvVars(remoteWorker.id, REMOTE_WORKER_VARS);
    await triggerDeploy(remoteWorker.id);
  } else {
    console.warn("Remote worker service not found — it may not be deployed yet.");
  }

  if (mainWeb) {
    const mainVarsToSet = Object.fromEntries(
      Object.entries(MAIN_WEB_VARS).filter(([, v]) => v !== "")
    );
    if (Object.keys(mainVarsToSet).length > 0) {
      console.log(`\nSetting env vars on main web service (${mainWeb.id})...`);
      await setEnvVars(mainWeb.id, mainVarsToSet);
      await triggerDeploy(mainWeb.id);
    }
  }

  console.log("\nDone. Both services are redeploying — watch the Render dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
