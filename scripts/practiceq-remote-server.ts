import { loadEnvConfig } from "@next/env";
import http from "http";
import { URL } from "url";

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

const port = Number(process.env.PORT ?? 3033);
const publicBaseUrl = process.env.PRACTICEQ_REMOTE_PUBLIC_URL ?? `http://localhost:${port}`;
const pollMs = Number(process.env.PRACTICEQ_REMOTE_POLL_MS ?? 5000);
let polling = false;

type RemoteServerModules = {
  dbServer: typeof import("@/lib/db.server");
  completePracticeQSession: typeof import("@/lib/practiceq-session-completion").completePracticeQSession;
  closePracticeQRemoteSession: typeof import("@/services/practiceq-worker").closePracticeQRemoteSession;
  completePracticeQIntakeInAdmin: typeof import("@/services/practiceq-worker").completePracticeQIntakeInAdmin;
  getPracticeQRemoteSession: typeof import("@/services/practiceq-worker").getPracticeQRemoteSession;
  startPracticeQRemoteSession: typeof import("@/services/practiceq-worker").startPracticeQRemoteSession;
};

let remoteServerModulesPromise: Promise<RemoteServerModules> | null = null;

function loadRemoteServerModules(): Promise<RemoteServerModules> {
  if (!remoteServerModulesPromise) {
    remoteServerModulesPromise = Promise.all([
      import("@/lib/db.server"),
      import("@/lib/practiceq-session-completion"),
      import("@/services/practiceq-worker"),
    ]).then(([dbServer, sessionCompletion, practiceQWorker]) => ({
      dbServer,
      completePracticeQSession: sessionCompletion.completePracticeQSession,
      closePracticeQRemoteSession: practiceQWorker.closePracticeQRemoteSession,
      completePracticeQIntakeInAdmin: practiceQWorker.completePracticeQIntakeInAdmin,
      getPracticeQRemoteSession: practiceQWorker.getPracticeQRemoteSession,
      startPracticeQRemoteSession: practiceQWorker.startPracticeQRemoteSession,
    }));
  }
  return remoteServerModulesPromise;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", publicBaseUrl);
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true });

    const match = url.pathname.match(/^\/session\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return sendText(res, 404, "Not found");

    const jobId = decodeURIComponent(match[1]);
    const action = match[2] ?? "";
    const token = url.searchParams.get("token") ?? "";
    const modules = await loadRemoteServerModules();
    const session = modules.getPracticeQRemoteSession(jobId, token);
    if (!session) return sendText(res, 403, "PracticeQ session expired or unavailable.");

    if (!action) return sendHtml(res, sessionHtml(jobId, token));
    if (action === "screenshot") {
      const png = await session.page.screenshot({ type: "png", fullPage: false });
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      return res.end(png);
    }
    if (action === "click" && req.method === "POST") {
      const body = await readJson(req);
      await session.page.mouse.click(Number(body.x), Number(body.y));
      return sendJson(res, 200, { ok: true });
    }
    if (action === "type" && req.method === "POST") {
      const body = await readJson(req);
      await session.page.keyboard.type(String(body.text ?? ""));
      return sendJson(res, 200, { ok: true });
    }
    if (action === "key" && req.method === "POST") {
      const body = await readJson(req);
      await session.page.keyboard.press(String(body.key ?? "Tab"));
      return sendJson(res, 200, { ok: true });
    }
    if (action === "done" && req.method === "POST") {
      await modules.completePracticeQSession(jobId);
      await modules.closePracticeQRemoteSession(jobId);
      return sendJson(res, 200, { ok: true });
    }

    return sendText(res, 404, "Not found");
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
  }
});

server.listen(port, () => {
  console.log(`PracticeQ remote browser service listening on ${port}`);
  pollQueuedJobs().catch((error) => console.error("Initial poll failed:", error.message));
  setInterval(() => pollQueuedJobs().catch((error) => console.error("Poll failed:", error.message)), pollMs);
});

async function pollQueuedJobs() {
  if (polling) return;
  polling = true;
  try {
    const modules = await loadRemoteServerModules();
    const jobs = await modules.dbServer.practiceqAutomationJobDb.getQueued(1);
    for (const job of jobs) {
      await modules.dbServer.practiceqAutomationJobDb.update(job.id, {
        status: "running",
        attempts: job.attempts + 1,
        lockedAt: new Date().toISOString(),
      });
      const result = await modules.startPracticeQRemoteSession({ ...job, attempts: job.attempts + 1 }, publicBaseUrl);
      await modules.dbServer.practiceqAutomationJobDb.update(job.id, {
        status: result.status,
        handoffUrl: result.handoffUrl,
        intakeId: result.intakeId,
        lastError: result.error,
      });
      if (result.status === "failed") {
        await modules.dbServer.orderDb.update(job.orderId, { practiceQStatus: "error" }).catch(() => {});
      } else if (result.status === "completed") {
        await modules.completePracticeQSession(job.id).catch((error) => {
          console.error("PracticeQ completion follow-up failed:", error instanceof Error ? error.message : error);
        });
      }
    }
    if (jobs.length === 0) {
      await retryFailedAdminCompletionJobs(modules);
    }
  } finally {
    polling = false;
  }
}

async function retryFailedAdminCompletionJobs(modules: RemoteServerModules) {
  const jobs = await modules.dbServer.practiceqAutomationJobDb.getAdminCompletionRetryCandidates(1);
  for (const job of jobs) {
    if (!job.intakeId) continue;
    await modules.dbServer.practiceqAutomationJobDb.update(job.id, {
      status: "running",
      attempts: job.attempts + 1,
      lockedAt: new Date().toISOString(),
      lastError: undefined,
    });
    const completed = await modules.completePracticeQIntakeInAdmin(job.intakeId).catch(() => false);
    if (!completed) {
      await modules.dbServer.practiceqAutomationJobDb.update(job.id, {
        status: "failed",
        lastError: `PracticeQ admin Set as Completed failed for ${job.intakeId}.`,
      });
      await modules.dbServer.orderDb.update(job.orderId, { practiceQStatus: "error" }).catch(() => {});
      continue;
    }
    await modules.dbServer.practiceqAutomationJobDb.update(job.id, {
      status: "completed",
      intakeId: job.intakeId,
      lastError: undefined,
    });
    await modules.completePracticeQSession(job.id).catch((error) => {
      console.error("PracticeQ completion retry follow-up failed:", error instanceof Error ? error.message : error);
    });
  }
}

function sessionHtml(jobId: string, token: string) {
  const safeJobId = encodeURIComponent(jobId);
  const safeToken = encodeURIComponent(token);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mission WLW PracticeQ Consent</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a}
    header{height:64px;display:flex;align-items:center;gap:12px;padding:0 22px;background:#fff;border-bottom:1px solid #e5e7eb}
    .logo{width:34px;height:34px;border-radius:9px;background:#0d9488;color:white;display:grid;place-items:center;font-weight:700}
    main{max-width:1180px;margin:20px auto;padding:0 14px}
    .bar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px}
    button{border:1px solid #0d9488;background:#0d9488;color:white;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}
    button.secondary{background:white;color:#0d9488}
    .viewport{background:#fff;border:1px solid #d1d5db;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    img{display:block;width:100%;height:auto;user-select:none}
    input{border:1px solid #d1d5db;border-radius:10px;padding:11px;width:min(520px,100%)}
  </style>
</head>
<body>
  <header><div class="logo">M</div><strong>Mission WLW</strong><span>PracticeQ consent</span></header>
  <main>
    <div class="bar">
      <div>
        <strong>Review and sign in PracticeQ</strong>
        <div style="font-size:13px;color:#64748b">Your answers were filled from Mission. Complete the PracticeQ consent/signature here.</div>
      </div>
      <button class="secondary" onclick="finish()">I submitted PracticeQ</button>
    </div>
    <div class="bar">
      <input id="typed" placeholder="Type here, then click Send Text if PracticeQ field is focused" />
      <button onclick="sendType()">Send Text</button>
      <button class="secondary" onclick="sendKey('Tab')">Tab</button>
      <button class="secondary" onclick="sendKey('Enter')">Enter</button>
    </div>
    <div class="viewport"><img id="screen" src="/session/${safeJobId}/screenshot?token=${safeToken}" /></div>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const jobId = ${JSON.stringify(jobId)};
    const img = document.getElementById('screen');
    setInterval(() => { img.src = '/session/${safeJobId}/screenshot?token=${safeToken}&t=' + Date.now(); }, 1200);
    img.addEventListener('click', async (event) => {
      const r = img.getBoundingClientRect();
      const x = Math.round((event.clientX - r.left) * (img.naturalWidth / r.width));
      const y = Math.round((event.clientY - r.top) * (img.naturalHeight / r.height));
      await fetch('/session/${safeJobId}/click?token=${safeToken}', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x,y})});
    });
    async function sendType(){
      const el = document.getElementById('typed');
      await fetch('/session/${safeJobId}/type?token=${safeToken}', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:el.value})});
      el.value='';
    }
    async function sendKey(key){
      await fetch('/session/${safeJobId}/key?token=${safeToken}', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});
    }
    async function finish(){
      await fetch('/session/${safeJobId}/done?token=${safeToken}', {method:'POST'});
      document.body.innerHTML = '<main><h1>PracticeQ submitted</h1><p>You can close this window.</p></main>';
    }
  </script>
</body>
</html>`;
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function sendHtml(res: http.ServerResponse, body: string) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  });
  res.end(body);
}

