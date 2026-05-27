import { processQueuedPracticeQAutomationJobs } from "@/services/practiceq-worker";

async function main() {
  const results = await processQueuedPracticeQAutomationJobs(Number(process.env.PRACTICEQ_WORKER_LIMIT ?? 5));
  const summary = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ processed: results.length, summary }, null, 2));
}

main().catch((error) => {
  console.error("PracticeQ worker failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

