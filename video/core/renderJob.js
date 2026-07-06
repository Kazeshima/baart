import { clampProgress } from "./config.js";

export const ACTIVE_RENDER_STATES = Object.freeze(["queued", "preparing", "rendering", "encoding"]);

export function isActiveRenderStatus(status) {
  return ACTIVE_RENDER_STATES.includes(status);
}

export function applyJobProgress(job, progress) {
  if (job.cancelRequested) return job.progress;
  job.progress = Math.max(job.progress, clampProgress(progress));
  return job.progress;
}

export function cancelJob(job) {
  if (!isActiveRenderStatus(job.status)) return false;
  job.cancelRequested = true;
  job.cancel?.();
  job.status = "cancelled";
  return true;
}
