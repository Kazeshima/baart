import crypto from "node:crypto";
import { renderVideoProject } from "./render-service.mjs";
import { parseVideoProject } from "./core/manifest.js";
import { applyJobProgress, browserDownloadPercent, cancelJob, isActiveRenderStatus } from "./core/renderJob.js";

const jobs = new Map();

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function publicJob(job) {
  const { cancel, cancelRequested, ...value } = job;
  return value;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 25_000_000) throw new Error("Render project is too large.");
  }
  return JSON.parse(body || "{}");
}

function applyRenderApiMiddleware(server) {
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/render")) return next();
    try {
      if (request.method === "POST" && url.pathname === "/api/render") {
        const active = [...jobs.values()].find(job => isActiveRenderStatus(job.status));
        if (active) return sendJson(response, 409, { error: "Another render is already active." });
        const body = await readJson(request);
        const project = parseVideoProject(body.project);
        const id = crypto.randomUUID();
        const job = { id, status: "queued", progress: 0, output: "", error: "", browserDownload: null, cancel: null, cancelRequested: false };
        jobs.set(id, job);
        renderVideoProject(project, {
          onStatus: status => { if (!job.cancelRequested) job.status = status; },
          onProgress: progress => applyJobProgress(job, progress),
          onBrowserDownload: progress => {
            if (!job.cancelRequested) job.browserDownload = { percent: browserDownloadPercent(progress.percent), alreadyAvailable: progress.alreadyAvailable };
          },
          onCancelReady: cancel => {
            job.cancel = cancel;
            if (job.cancelRequested) cancel();
          },
        }).then(output => {
          if (job.cancelRequested) return;
          job.status = "complete";
          job.progress = 1;
          job.output = output;
        }).catch(error => {
          if (job.cancelRequested || String(error).toLowerCase().includes("cancel")) {
            job.status = "cancelled";
            return;
          }
          job.status = "error";
          job.error = error instanceof Error ? error.message : String(error);
        });
        return sendJson(response, 202, publicJob(job));
      }

      const match = url.pathname.match(/^\/api\/render\/([^/]+)(\/cancel)?$/);
      if (!match) return sendJson(response, 404, { error: "Unknown render endpoint." });
      const job = jobs.get(match[1]);
      if (!job) return sendJson(response, 404, { error: "Render job not found." });
      if (request.method === "POST" && match[2] === "/cancel") {
        cancelJob(job);
        return sendJson(response, 200, publicJob(job));
      }
      if (request.method === "GET") return sendJson(response, 200, publicJob(job));
      return sendJson(response, 405, { error: "Method not allowed." });
    } catch (error) {
      return sendJson(response, 400, { error: String(error) });
    }
  });
}

export function renderApiPlugin() {
  return {
    name: "baart-remotion-render-api",
    configureServer(server) {
      applyRenderApiMiddleware(server);
    },
    configurePreviewServer(server) {
      applyRenderApiMiddleware(server);
    },
  };
}
