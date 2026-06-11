const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET;

if (!baseUrl) {
  console.error("PHARMACY_TRACKING_CRON missing APP_BASE_URL");
  process.exit(1);
}

if (!cronSecret) {
  console.error("PHARMACY_TRACKING_CRON missing CRON_SECRET");
  process.exit(1);
}

const url = `${baseUrl}/api/cron/pharmacy-tracking-sync`;
console.log(`PHARMACY_TRACKING_CRON requesting ${url}`);

try {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const body = await response.text();
  console.log(`PHARMACY_TRACKING_CRON status ${response.status}`);
  console.log(`PHARMACY_TRACKING_CRON body ${body.slice(0, 2000)}`);

  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error(`PHARMACY_TRACKING_CRON error ${(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
}
