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

export async function chooseRenderOutput(format, outputName) {
  if (!usesTauriRenderTransport()) return null;
  return invoke("select_video_output", { format, outputName });
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

export async function benchmarkRenderSettings(project) {
  if (usesTauriRenderTransport()) {
    return invoke("benchmark_video_render", { project });
  }
  const response = await fetch("/api/render/benchmark", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, frames: 60 }),
  });
  return readJsonResponse(response);
}

export async function getRenderJob(id) {
  if (usesTauriRenderTransport()) return invoke("get_video_render_job");
  return readJsonResponse(await fetch(`/api/render/${encodeURIComponent(id)}`));
}

export async function cancelRenderJob(id) {
  if (usesTauriRenderTransport()) return invoke("cancel_video_render");
  return readJsonResponse(await fetch(`/api/render/${encodeURIComponent(id)}/cancel`, { method: "POST" }));
}
