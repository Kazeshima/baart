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

function bottleneckLabel(value, language = "en") {
  const zh = language === "zh";
  if (value === "disk-io") return zh ? "磁盘写入" : "Disk IO";
  if (value === "browser-or-png-encoding") return zh ? "浏览器场景渲染或图片编码" : "Browser scene rendering or image encoding";
  return zh ? "未知" : "Unknown";
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

export const BENCHMARK_CONCURRENCY_CANDIDATES = Object.freeze(["adaptive", "auto", "100%", "1", "2", "4", "6", "8", "12", "16"]);

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
  if (project.settings.format === "png" || project.settings.format === "jpeg") {
    const imageFormat = project.settings.renderImageFormat || project.settings.format;
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
    const assetResult = await prepareRenderAssetMap(project, { cacheDir: assetCacheDir, baseUrl: assetServer.baseUrl, publicDir: path.join(rootDir, "public") });
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
    const output = options.outputLocation || (project.settings.format === "png" || project.settings.format === "jpeg"
      ? await uniqueOutput(`${base}-frames`)
      : await uniqueOutput(base, ".mp4"));
    if (project.settings.format === "png" || project.settings.format === "jpeg") await fs.mkdir(output, { recursive: true });
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
  const callbacks = options.callbacks || {};
  const baseProject = parseVideoProject(rawProject);
  const language = baseProject.settings.uiLanguage === "zh" ? "zh" : "en";
  const frameCount = Math.max(12, Number(options.frames || 60));
  const trialCount = Math.max(1, Math.min(5, Number(options.trials || 3)));
  const logicalCores = os.availableParallelism?.() || os.cpus().length;
  const candidates = selectBenchmarkConcurrencyCandidates(options.candidates || BENCHMARK_CONCURRENCY_CANDIDATES, logicalCores);
  const totalSteps = Math.max(1, candidates.length * trialCount + 3);
  const outputRoot = options.outputRoot || path.join(process.cwd(), ".cache", "render-benchmark");
  const assetCacheDir = options.assetCacheDir || path.join(process.cwd(), ".cache", "render-assets");
  await fs.mkdir(outputRoot, { recursive: true });
  callbacks.onStatus?.("rendering");
  callbacks.onLog?.(`Benchmark IO write test: ${frameCount} sample files.`);
  const io = await benchmarkOutputIo(path.join(outputRoot, "io"), { frames: frameCount, bytesPerFrame: options.bytesPerFrame });
  callbacks.onLog?.(`Benchmark IO result: ${io.filesPerSecond} frames/s, ${io.mbPerSecond} MB/s.`);
  let completedSteps = 1;
  callbacks.onProgress?.(completedSteps / totalSteps, { renderedFrames: completedSteps, totalFrames: totalSteps });
  const cases = [];
  for (const [index, candidate] of candidates.entries()) {
    callbacks.onLog?.(`Benchmark ${index + 1}/${candidates.length}: concurrency ${candidate}.`);
    const trials = [];
    for (let trial = 0; trial < trialCount; trial += 1) {
      const outputLocation = path.join(outputRoot, `frames-${safeName(candidate)}-${trial + 1}`);
      await fs.rm(outputLocation, { recursive: true, force: true });
      const project = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          format: baseProject.settings.format === "jpeg" ? "jpeg" : "png",
          renderConcurrency: candidate,
          outputName: `benchmark-${safeName(candidate)}-${trial + 1}`,
        },
      };
      const started = Date.now();
      await renderVideoProject(project, {
        onProgress: (progress, meta = {}) => {
          callbacks.onProgress?.((completedSteps + progress) / totalSteps, {
            ...meta,
            renderedFrames: completedSteps + progress,
            totalFrames: totalSteps,
          });
        },
        onLog: message => callbacks.onLog?.(message),
        onBrowserDownload: progress => callbacks.onBrowserDownload?.(progress),
      }, {
        ...options,
        outputLocation,
        frameRange: [0, frameCount - 1],
        assetCacheDir,
        profile: options.profile,
      });
      const elapsedMs = Math.max(1, Date.now() - started);
      const entries = await fs.readdir(outputLocation);
      const extension = project.settings.format === "jpeg" ? ".jpeg" : ".png";
      const renderedFrames = entries.filter(name => name.endsWith(extension)).length;
      const totalBytes = (await Promise.all(entries.map(async name => (await fs.stat(path.join(outputLocation, name))).size))).reduce((sum, size) => sum + size, 0);
      await fs.rm(outputLocation, { recursive: true, force: true });
      const fps = renderedFrames / (elapsedMs / 1000);
      trials.push({
        trial: trial + 1,
        elapsedMs,
        renderedFrames,
        totalBytes,
        fps: Number(fps.toFixed(2)),
        mbPerSecond: Number(((totalBytes / 1048576) / (elapsedMs / 1000)).toFixed(2)),
      });
      completedSteps += 1;
      callbacks.onProgress?.(completedSteps / totalSteps, { renderedFrames: completedSteps, totalFrames: totalSteps });
    }
    const sortedFps = trials.map(trial => trial.fps).sort((a, b) => a - b);
    const medianFps = sortedFps[Math.floor(sortedFps.length / 2)] ?? 0;
    const averageFps = trials.reduce((sum, trial) => sum + trial.fps, 0) / Math.max(1, trials.length);
    const minFps = sortedFps[0] ?? 0;
    const maxFps = sortedFps[sortedFps.length - 1] ?? 0;
    const elapsedMs = trials.reduce((sum, trial) => sum + trial.elapsedMs, 0);
    const renderedFrames = trials.reduce((sum, trial) => sum + trial.renderedFrames, 0);
    const totalBytes = trials.reduce((sum, trial) => sum + trial.totalBytes, 0);
    const result = {
      renderConcurrency: candidate,
      resolvedConcurrency: resolveRenderConcurrency(candidate, { logicalCores }) ?? "auto",
      elapsedMs,
      renderedFrames,
      totalBytes,
      fps: Number(averageFps.toFixed(2)),
      medianFps: Number(medianFps.toFixed(2)),
      minFps,
      maxFps,
      variation: medianFps > 0 ? Number(((maxFps - minFps) / medianFps).toFixed(3)) : null,
      trials,
      mbPerSecond: Number(((totalBytes / 1048576) / (elapsedMs / 1000)).toFixed(2)),
      bottleneck: classifyRenderBottleneck(medianFps, io.filesPerSecond),
    };
    result.bottleneckLabel = bottleneckLabel(result.bottleneck, language);
    cases.push(result);
    callbacks.onLog?.(`Benchmark ${candidate}: median ${result.medianFps} fps, avg ${result.fps} fps, ${result.mbPerSecond} MB/s, ${result.bottleneckLabel}.`);
  }
  cases.sort((a, b) => b.medianFps - a.medianFps);
  const top = cases[0];
  const stableBest = top ? cases
    .filter(item => item.medianFps >= top.medianFps * 0.95)
    .sort((a, b) => {
      const aValue = typeof a.resolvedConcurrency === "number" ? a.resolvedConcurrency : Number.MAX_SAFE_INTEGER;
      const bValue = typeof b.resolvedConcurrency === "number" ? b.resolvedConcurrency : Number.MAX_SAFE_INTEGER;
      return aValue - bValue || b.medianFps - a.medianFps;
    })[0] : null;
  const imageFormatComparison = [];
  const bestConcurrency = stableBest?.renderConcurrency || top?.renderConcurrency || "adaptive";
  for (const imageFormat of ["png", "jpeg"]) {
    const outputLocation = path.join(outputRoot, `format-${imageFormat}`);
    await fs.rm(outputLocation, { recursive: true, force: true });
    const project = {
      ...baseProject,
      settings: {
        ...baseProject.settings,
        format: imageFormat,
        renderConcurrency: bestConcurrency,
        outputName: `benchmark-format-${imageFormat}`,
      },
    };
    const started = Date.now();
    await renderVideoProject(project, {
      onProgress: (progress, meta = {}) => callbacks.onProgress?.((completedSteps + progress) / totalSteps, { ...meta, renderedFrames: completedSteps + progress, totalFrames: totalSteps }),
      onLog: message => callbacks.onLog?.(message),
      onBrowserDownload: progress => callbacks.onBrowserDownload?.(progress),
    }, {
      ...options,
      outputLocation,
      frameRange: [0, frameCount - 1],
      assetCacheDir,
      profile: options.profile,
    });
    const elapsedMs = Math.max(1, Date.now() - started);
    const entries = await fs.readdir(outputLocation);
    const extension = imageFormat === "jpeg" ? ".jpeg" : ".png";
    const renderedFrames = entries.filter(name => name.endsWith(extension)).length;
    const totalBytes = (await Promise.all(entries.map(async name => (await fs.stat(path.join(outputLocation, name))).size))).reduce((sum, size) => sum + size, 0);
    await fs.rm(outputLocation, { recursive: true, force: true });
    imageFormatComparison.push({
      format: imageFormat,
      elapsedMs,
      renderedFrames,
      totalBytes,
      fps: Number((renderedFrames / (elapsedMs / 1000)).toFixed(2)),
      mbPerSecond: Number(((totalBytes / 1048576) / (elapsedMs / 1000)).toFixed(2)),
    });
    completedSteps += 1;
    callbacks.onProgress?.(completedSteps / totalSteps, { renderedFrames: completedSteps, totalFrames: totalSteps });
  }
  const report = {
    logicalCores,
    frameCount,
    trialCount,
    io,
    cases,
    imageFormatComparison,
    best: stableBest || cases[0] || null,
    bottleneckLegend: {
      "disk-io": bottleneckLabel("disk-io", language),
      "browser-or-png-encoding": bottleneckLabel("browser-or-png-encoding", language),
      unknown: bottleneckLabel("unknown", language),
    },
    recommendation: (stableBest || cases[0])?.bottleneck === "browser-or-png-encoding"
      ? "Disk write throughput is much higher than render throughput. The likely limit is browser scene rendering, image encoding, or both. PNG remains lossless; JPEG sequence can be faster but is lossy."
      : (stableBest || cases[0])?.bottleneck === "disk-io"
        ? "Disk write throughput is close to render throughput. A faster local SSD or a different output directory may improve PNG sequence renders."
        : "Benchmark did not classify a dominant bottleneck.",
  };
  await fs.writeFile(path.join(outputRoot, "benchmark-report.json"), JSON.stringify(report, null, 2)).catch(() => {});
  callbacks.onProgress?.(1, { renderedFrames: totalSteps, totalFrames: totalSteps });
  return report;
}

export { outputRoot };
