import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderFrames, renderMedia, selectComposition } from "@remotion/renderer";
import { parseVideoProject } from "./core/manifest.js";
import { clampProgress, validateVideoSettings } from "./core/config.js";

const videoDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(videoDir, "..");
const outputRoot = path.join(rootDir, "video-output");
let bundlePromise = null;

function safeName(value) {
  return String(value || "baart-arena-ratings").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "baart-arena-ratings";
}

async function uniqueOutput(base, extension = "") {
  await fs.mkdir(outputRoot, { recursive: true });
  const first = path.join(outputRoot, `${base}${extension}`);
  try {
    await fs.access(first);
    return path.join(outputRoot, `${base}-${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`);
  } catch {
    return first;
  }
}

async function getBundle(onProgress) {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(videoDir, "remotion", "index.jsx"),
      onProgress: progress => onProgress?.(clampProgress(progress > 1 ? progress / 100 : progress) * 0.08),
    }).catch(error => {
      bundlePromise = null;
      throw error;
    });
  }
  return bundlePromise;
}

function browserDownloadCallback(callbacks) {
  return () => ({
    version: null,
    onProgress: progress => callbacks.onBrowserDownload?.(progress),
  });
}

async function renderProject({ project, serveUrl, composition, inputProps, output, callbacks, cancellation }) {
  const frameCount = composition.durationInFrames;
  const scale = project.settings.width / 1920;
  const onBrowserDownload = browserDownloadCallback(callbacks);
  if (project.settings.format === "png") {
    await renderFrames({
      serveUrl, composition, inputProps, outputDir: output,
      imageFormat: "png", imageSequencePattern: "frame-[frame].[ext]",
      scale, concurrency: 1, chromeMode: "chrome-for-testing",
      cancelSignal: cancellation.cancelSignal, onBrowserDownload,
      onStart: () => undefined,
      onFrameUpdate: rendered => callbacks.onProgress?.(clampProgress(0.08 + (rendered / frameCount) * 0.92)),
    });
    return output;
  }
  await renderMedia({
    serveUrl, composition, inputProps, outputLocation: output,
    codec: "h264", imageFormat: "png", pixelFormat: "yuv420p",
    scale, concurrency: 1, chromeMode: "chrome-for-testing",
    cancelSignal: cancellation.cancelSignal, onBrowserDownload,
    overwrite: true, licenseKey: null, isProduction: true,
    onProgress: progress => {
      callbacks.onStatus?.(progress.renderedFrames >= frameCount ? "encoding" : "rendering");
      callbacks.onProgress?.(clampProgress(0.08 + progress.progress * 0.92));
    },
  });
  return output;
}

export async function renderVideoProject(rawProject, callbacks = {}) {
  const project = parseVideoProject(rawProject);
  const errors = validateVideoSettings(project.settings);
  if (errors.length) throw new Error(errors.join(" "));
  if (!project.records.length) throw new Error("No rated students are available to render.");

  let cancelled = false;
  const cancellation = makeCancelSignal();
  callbacks.onCancelReady?.(() => {
    cancelled = true;
    cancellation.cancel();
  });
  callbacks.onStatus?.("preparing");
  const serveUrl = await getBundle(callbacks.onProgress);
  if (cancelled) throw new Error("Render cancelled.");
  const inputProps = { project };
  const composition = await selectComposition({ serveUrl, id: "ArenaRatingVideo", inputProps, chromeMode: "chrome-for-testing" });
  if (cancelled) throw new Error("Render cancelled.");

  callbacks.onStatus?.("rendering");
  const base = safeName(project.settings.outputName);
  const output = project.settings.format === "png"
    ? await uniqueOutput(`${base}-frames`)
    : await uniqueOutput(base, ".mp4");
  const result = await renderProject({ project, serveUrl, composition, inputProps, output, callbacks, cancellation });
  callbacks.onProgress?.(1);
  return result;
}

export { outputRoot };
