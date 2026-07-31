import { invoke, isTauri } from "@tauri-apps/api/core";

export function usesTauriRenderTransport() {
  return isTauri();
}

export async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = body.trim().replace(/\s+/g, " ").slice(0, 100);
    throw new Error(`Render endpoint returned ${contentType || "a non-JSON response"}${preview ? `: ${preview}` : "."}`);
  }
  let value;
  try {
    value = JSON.parse(body || "{}");
  } catch {
    throw new Error("Render endpoint returned invalid JSON.");
  }
  if (!response.ok) throw new Error(value?.error || `Render request failed with HTTP ${response.status}.`);
  return value;
}

export async function chooseRenderOutput(format, outputName, renderMode = "guide") {
  if (!usesTauriRenderTransport()) return null;
  return invoke("select_video_output", { format, outputName, renderMode });
}

export async function startRenderJob(project, outputLocation = "") {
  if (usesTauriRenderTransport()) {
    return invoke("start_video_render", { project, outputLocation });
  }
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project }),
  });
  return readJsonResponse(response);
}

async function pollBenchmarkJob(job, onProgress) {
  let current = job;
  let emptyPolls = 0;
  onProgress?.(current);
  while (!current || ["queued", "preparing", "rendering", "encoding"].includes(current.status)) {
    await new Promise(resolve => setTimeout(resolve, 750));
    const next = await getRenderJob(current?.id || "benchmark");
    if (!next) {
      emptyPolls += 1;
      if (emptyPolls > 5) break;
      continue;
    }
    current = next;
    emptyPolls = 0;
    onProgress?.(current);
  }
  if (current?.status === "error") throw new Error(current.error || "Benchmark failed.");
  if (current?.status === "cancelled") throw new Error("Benchmark cancelled.");
  return current?.result || current;
}

export async function benchmarkRenderSettings(project, onProgress) {
  if (usesTauriRenderTransport()) {
    const pending = { id: "benchmark", kind: "benchmark", status: "queued", progress: 0, logs: [] };
    onProgress?.(pending);
    const poll = pollBenchmarkJob(pending, onProgress).catch(() => null);
    const result = await invoke("benchmark_video_render", { project });
    const latest = await poll;
    return latest?.result || result;
  }
  const response = await fetch("/api/render/benchmark", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, frames: 60 }),
  });
  const job = await readJsonResponse(response);
  return pollBenchmarkJob(job, onProgress);
}

export async function getRenderJob(id) {
  if (usesTauriRenderTransport()) return invoke("get_video_render_job");
  return readJsonResponse(await fetch(`/api/render/${encodeURIComponent(id)}`));
}

export async function cancelRenderJob(id) {
  if (usesTauriRenderTransport()) return invoke("cancel_video_render");
  return readJsonResponse(await fetch(`/api/render/${encodeURIComponent(id)}/cancel`, { method: "POST" }));
}
