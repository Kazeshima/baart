import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
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
  const concurrency = resolveRenderConcurrency(project.settings.renderConcurrency, { logicalCores: os.availableParallelism?.() || os.cpus().length });
  return {
    scale: project.settings.width / 1920,
    logLevel: "error",
    ...(concurrency === undefined ? {} : { concurrency }),
  };
}

export async function benchmarkOutputIo(outputDir, options = {}) {
  const frames = Math.max(1, Number(options.frames || 80));
  const bytesPerFrame = Math.max(1024, Number(options.bytesPerFrame || 512_000));
  const buffer = Buffer.alloc(bytesPerFrame, 0x76);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const started = Date.now();
  for (let index = 0; index < frames; index += 1) {
    await fs.writeFile(path.join(outputDir, `io-${String(index).padStart(4, "0")}.bin`), buffer);
  }
  const elapsedMs = Math.max(1, Date.now() - started);
  const totalBytes = frames * bytesPerFrame;
  await fs.rm(outputDir, { recursive: true, force: true });
  return {
    frames,
    totalBytes,
    elapsedMs,
    filesPerSecond: Number((frames / (elapsedMs / 1000)).toFixed(2)),
    mbPerSecond: Number(((totalBytes / 1048576) / (elapsedMs / 1000)).toFixed(2)),
  };
}

export function classifyRenderBottleneck(renderFps, ioFilesPerSecond) {
  if (!Number.isFinite(renderFps) || renderFps <= 0) return "unknown";
  if (!Number.isFinite(ioFilesPerSecond) || ioFilesPerSecond <= 0) return "unknown";
  return ioFilesPerSecond <= renderFps * 2 ? "disk-io" : "browser-or-png-encoding";
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

export const BENCHMARK_CONCURRENCY_CANDIDATES = Object.freeze(["adaptive", "auto", "50%", "75%", "100%", "4", "6", "8", "12", "16"]);

export function selectBenchmarkConcurrencyCandidates(candidates = BENCHMARK_CONCURRENCY_CANDIDATES, logicalCores = os.availableParallelism?.() || os.cpus().length) {
  return candidates
    .filter((value, index, values) => values.indexOf(value) === index)
    .filter(value => resolveRenderConcurrency(value, { logicalCores }) !== null);
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
    const imageFormat = project.settings.renderImageFormat === "jpeg" ? "jpeg" : "png";
    await renderFrames({
      serveUrl, composition, inputProps, outputDir: output,
      imageFormat, imageSequencePattern: "frame-[frame].[ext]",
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
        ...(options.imageFormat ? { renderImageFormat: options.imageFormat } : {}),
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

export async function benchmarkRenderConcurrency(rawProject, options = {}) {
  const baseProject = parseVideoProject(rawProject);
  const frameCount = Math.max(12, Number(options.frames || 90));
  const logicalCores = os.availableParallelism?.() || os.cpus().length;
  const candidates = selectBenchmarkConcurrencyCandidates(options.candidates || BENCHMARK_CONCURRENCY_CANDIDATES, logicalCores);
  const outputRoot = options.outputRoot || path.join(process.cwd(), ".cache", "render-benchmark");
  const assetCacheDir = options.assetCacheDir || path.join(process.cwd(), ".cache", "render-assets");
  await fs.mkdir(outputRoot, { recursive: true });
  const io = await benchmarkOutputIo(path.join(outputRoot, "io"), { frames: frameCount, bytesPerFrame: options.bytesPerFrame });
  const cases = [];
  for (const candidate of candidates) {
    const outputLocation = path.join(outputRoot, `frames-${safeName(candidate)}`);
    await fs.rm(outputLocation, { recursive: true, force: true });
    const project = {
      ...baseProject,
      settings: {
        ...baseProject.settings,
        format: "png",
        renderConcurrency: candidate,
        outputName: `benchmark-${safeName(candidate)}`,
      },
    };
    const started = Date.now();
    await renderVideoProject(project, {}, {
      ...options,
      outputLocation,
      frameRange: [0, frameCount - 1],
      assetCacheDir,
      profile: options.profile,
    });
    const elapsedMs = Math.max(1, Date.now() - started);
    const entries = await fs.readdir(outputLocation);
    const renderedFrames = entries.filter(name => name.endsWith(".png")).length;
    const totalBytes = (await Promise.all(entries.map(async name => (await fs.stat(path.join(outputLocation, name))).size))).reduce((sum, size) => sum + size, 0);
    await fs.rm(outputLocation, { recursive: true, force: true });
    const fps = renderedFrames / (elapsedMs / 1000);
    cases.push({
      renderConcurrency: candidate,
      resolvedConcurrency: resolveRenderConcurrency(candidate, { logicalCores }) ?? "auto",
      elapsedMs,
      renderedFrames,
      totalBytes,
      fps: Number(fps.toFixed(2)),
      mbPerSecond: Number(((totalBytes / 1048576) / (elapsedMs / 1000)).toFixed(2)),
      bottleneck: classifyRenderBottleneck(fps, io.filesPerSecond),
    });
  }
  cases.sort((a, b) => b.fps - a.fps);
  return {
    logicalCores,
    frameCount,
    io,
    cases,
    best: cases[0] || null,
  };
}

export { outputRoot };
