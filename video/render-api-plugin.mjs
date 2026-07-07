import crypto from "node:crypto";
import path from "node:path";
import { renderVideoProject, benchmarkRenderConcurrency } from "./render-service.mjs";
import { parseVideoProject } from "./core/manifest.js";
import { applyJobProgress, browserDownloadPercent, cancelJob, isActiveRenderStatus } from "./core/renderJob.js";

const jobs = new Map();

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();
}

function appendLog(job, message) {
  const clean = stripAnsi(message);
  if (!clean || job.logs.includes(clean)) return;
  job.logs.push(clean);
  if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
}

function applyProgress(job, progress, meta = {}) {
  applyJobProgress(job, progress);
  if (Number.isFinite(meta.renderedFrames)) job.renderedFrames = meta.renderedFrames;
  if (Number.isFinite(meta.totalFrames)) job.totalFrames = meta.totalFrames;
  if (Number.isFinite(meta.fpsEstimate)) job.fpsEstimate = meta.fpsEstimate;
  if (Number.isFinite(meta.etaSeconds)) job.etaSeconds = meta.etaSeconds;
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
        const job = {
          id, status: "queued", progress: 0, output: "", error: "", browserDownload: null,
          logs: [], renderedFrames: null, totalFrames: null, fpsEstimate: null, etaSeconds: null,
          cancel: null, cancelRequested: false,
        };
        jobs.set(id, job);
        renderVideoProject(project, {
          onStatus: status => { if (!job.cancelRequested) job.status = status; },
          onProgress: (progress, meta) => applyProgress(job, progress, meta),
          onBrowserDownload: progress => {
            if (!job.cancelRequested) job.browserDownload = { percent: browserDownloadPercent(progress.percent), alreadyAvailable: progress.alreadyAvailable };
          },
          onLog: message => appendLog(job, message),
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
      if (request.method === "POST" && url.pathname === "/api/render/benchmark") {
        const active = [...jobs.values()].find(job => isActiveRenderStatus(job.status));
        if (active) return sendJson(response, 409, { error: "Another render is already active." });
        const body = await readJson(request);
        const project = parseVideoProject(body.project);
        const result = await benchmarkRenderConcurrency(project, {
          frames: Number(body.frames || 60),
          outputRoot: path.join(process.cwd(), ".cache", "video-benchmark-api"),
        });
        return sendJson(response, 200, result);
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
