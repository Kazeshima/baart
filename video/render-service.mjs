import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { makeCancelSignal, renderFrames, renderMedia, selectComposition } from "@remotion/renderer";
import { parseVideoProject } from "./core/manifest.js";
import { clampProgress, resolveRenderConcurrency, validateVideoSettings } from "./core/config.js";
import { createRenderAssetServer, prepareRenderAssetMap } from "./core/renderAssets.js";

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
    const { bundle } = await import("@remotion/bundler");
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

function renderOptions(project) {
  const concurrency = resolveRenderConcurrency(project.settings.renderConcurrency);
  return {
    scale: project.settings.width / 1920,
    logLevel: "error",
    ...(concurrency === undefined ? {} : { concurrency }),
  };
}

function progressMeta(renderedFrames, totalFrames, startedAt = Date.now()) {
  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
  const fpsEstimate = renderedFrames > 0 ? renderedFrames / elapsedSeconds : 0;
  return {
    renderedFrames,
    totalFrames,
    fpsEstimate,
    etaSeconds: fpsEstimate > 0 ? Math.max(0, (totalFrames - renderedFrames) / fpsEstimate) : null,
  };
}

function frameRangeCount(frameRange, fallback) {
  if (!Array.isArray(frameRange)) return fallback;
  const [start, end] = frameRange.map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return fallback;
  return Math.floor(end - start + 1);
}

async function renderProject({ project, serveUrl, composition, inputProps, output, callbacks, cancellation, binariesDirectory }) {
  const frameRange = project.settings.renderFrameRange;
  const frameCount = frameRangeCount(frameRange, composition.durationInFrames);
  const startedAt = Date.now();
  const options = renderOptions(project);
  const onBrowserDownload = browserDownloadCallback(callbacks);
  const onBrowserLog = log => {
    if (log?.text) callbacks.onLog?.(log.text);
  };
  if (project.settings.format === "png") {
    await renderFrames({
      serveUrl, composition, inputProps, outputDir: output,
      imageFormat: "png", imageSequencePattern: "frame-[frame].[ext]",
      ...options, chromeMode: "chrome-for-testing",
      binariesDirectory,
      ...(frameRange ? { frameRange } : {}),
      cancelSignal: cancellation.cancelSignal, onBrowserDownload,
      onBrowserLog,
      onStart: () => undefined,
      onFrameUpdate: rendered => callbacks.onProgress?.(
        clampProgress(0.08 + (rendered / frameCount) * 0.92),
        progressMeta(rendered, frameCount, startedAt),
      ),
    });
    return output;
  }
  await renderMedia({
    serveUrl, composition, inputProps, outputLocation: output,
    codec: "h264", imageFormat: "png", pixelFormat: "yuv420p",
    ...options, chromeMode: "chrome-for-testing",
    binariesDirectory,
    ...(frameRange ? { frameRange } : {}),
    cancelSignal: cancellation.cancelSignal, onBrowserDownload,
    onBrowserLog,
    overwrite: true, licenseKey: null, isProduction: true,
    onProgress: progress => {
      callbacks.onStatus?.(progress.renderedFrames >= frameCount ? "encoding" : "rendering");
      callbacks.onProgress?.(
        clampProgress(0.08 + progress.progress * 0.92),
        progressMeta(progress.renderedFrames, frameCount, startedAt),
      );
    },
  });
  return output;
}

export async function renderVideoProject(rawProject, callbacks = {}, options = {}) {
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
  const serveUrl = options.serveUrl || await getBundle(callbacks.onProgress);
  if (cancelled) throw new Error("Render cancelled.");
  const assetCacheDir = options.assetCacheDir || path.join(process.cwd(), ".cache", "render-assets");
  const assetServer = await createRenderAssetServer(assetCacheDir);
  try {
    const assetResult = await prepareRenderAssetMap(project, { cacheDir: assetCacheDir, baseUrl: assetServer.baseUrl });
    for (const failure of assetResult.failures) callbacks.onLog?.(`Asset cache warning: ${failure}`);
    callbacks.onLog?.(`Render asset cache: ${assetResult.cacheDir}`);
    const renderProjectData = {
      ...project,
      settings: {
        ...project.settings,
        assetMap: assetResult.assetMap,
        ...(options.profile ? { renderProfile: options.profile } : {}),
        ...(options.frameRange ? { renderFrameRange: options.frameRange } : {}),
      },
    };
    const inputProps = { project: renderProjectData };
    const composition = await selectComposition({
      serveUrl,
      id: "ArenaRatingVideo",
      inputProps,
      chromeMode: "chrome-for-testing",
      binariesDirectory: options.binariesDirectory,
    });
    if (cancelled) throw new Error("Render cancelled.");

    callbacks.onStatus?.("rendering");
    const base = safeName(project.settings.outputName);
    const output = options.outputLocation || (project.settings.format === "png"
      ? await uniqueOutput(`${base}-frames`)
      : await uniqueOutput(base, ".mp4"));
    if (project.settings.format === "png") await fs.mkdir(output, { recursive: true });
    else await fs.mkdir(path.dirname(output), { recursive: true });
    const result = await renderProject({
      project: renderProjectData,
      serveUrl,
      composition,
      inputProps,
      output,
      callbacks,
      cancellation,
      binariesDirectory: options.binariesDirectory,
    });
    callbacks.onProgress?.(1);
    return result;
  } finally {
    await assetServer.close();
  }
}

export { outputRoot };
