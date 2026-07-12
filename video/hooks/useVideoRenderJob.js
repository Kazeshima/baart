import { useEffect, useState } from "react";
import { benchmarkStorageKey, DEFAULT_VIDEO_SETTINGS } from "../core/config.js";
import { vt } from "../core/i18n.js";
import { isActiveRenderStatus } from "../core/renderJob.js";
import { readStoredJson } from "../../src/store/ratingPersistence.js";
import {
  benchmarkRenderSettings,
  cancelRenderJob,
  chooseRenderOutput,
  getRenderJob,
  startRenderJob,
  usesTauriRenderTransport,
} from "../render-client.js";

const BENCHMARK_KEY = "baart_video_render_benchmarks";

export function useVideoRenderJob({ project, settings, language, savedSettings, updateSetting }) {
  const [renderJob, setRenderJob] = useState(null);
  const [benchmarkResult, setBenchmarkResult] = useState(() => readStoredJson(BENCHMARK_KEY)[benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, ...(savedSettings || {}) })] || null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [outputLocation, setOutputLocation] = useState("");
  const activeRender = isActiveRenderStatus(renderJob?.status);

  useEffect(() => {
    setBenchmarkResult(readStoredJson(BENCHMARK_KEY)[benchmarkStorageKey(settings)] || null);
  }, [settings.width, settings.height, settings.fps, settings.format, settings.theme, settings.uiLanguage, settings.dataLanguage]);

  useEffect(() => {
    if (!renderJob?.id || !isActiveRenderStatus(renderJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const result = await getRenderJob(renderJob.id);
        if (result) setRenderJob(result);
      } catch (error) {
        setRenderJob(current => ({ ...current, status: "error", error: error instanceof Error ? error.message : vt(language, "renderUnavailable") }));
      }
    }, 750);
    return () => clearInterval(timer);
  }, [language, renderJob?.id, renderJob?.status]);

  useEffect(() => {
    if (usesTauriRenderTransport() && renderJob?.status === "complete") setOutputLocation("");
  }, [renderJob?.status]);

  const startRender = async () => {
    if (!project) return;
    try {
      let destination = outputLocation;
      if (usesTauriRenderTransport() && !destination) {
        destination = await chooseRenderOutput(settings.format, settings.outputName);
        if (!destination) return;
        setOutputLocation(destination);
      }
      setRenderJob(await startRenderJob(project, destination));
    } catch (error) {
      const message = error instanceof TypeError ? vt(language, "renderUnavailable") : (error instanceof Error ? error.message : String(error));
      setRenderJob({ status: "error", error: message, progress: 0 });
    }
  };

  const cancelRender = async () => {
    if (!renderJob?.id) return;
    try {
      const result = await cancelRenderJob(renderJob.id);
      if (result) setRenderJob(result);
    } catch (error) {
      setRenderJob(current => ({ ...current, status: "error", error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const chooseDestination = async () => {
    try {
      const destination = await chooseRenderOutput(settings.format, settings.outputName);
      if (destination) setOutputLocation(destination);
    } catch (error) {
      setRenderJob({ status: "error", error: error instanceof Error ? error.message : String(error), progress: 0 });
    }
  };

  const runBenchmark = async () => {
    if (!project || benchmarking || activeRender) return;
    setBenchmarking(true);
    try {
      const result = await benchmarkRenderSettings(project, job => setRenderJob(job));
      const best = result.best;
      if (best?.renderConcurrency) updateSetting("renderConcurrency", best.renderConcurrency);
      const key = benchmarkStorageKey(settings);
      const stored = readStoredJson(BENCHMARK_KEY);
      const savedResult = { ...result, createdAt: new Date().toISOString() };
      localStorage.setItem(BENCHMARK_KEY, JSON.stringify({ ...stored, [key]: savedResult }));
      setBenchmarkResult(savedResult);
      setRenderJob(current => current ? { ...current, status: "complete", progress: 1, result: savedResult } : current);
    } catch (error) {
      setRenderJob({ status: "error", error: error instanceof Error ? error.message : String(error), progress: 0 });
    } finally {
      setBenchmarking(false);
    }
  };

  return {
    activeRender,
    benchmarkResult,
    benchmarking,
    cancelRender,
    chooseDestination,
    outputLocation,
    renderJob,
    runBenchmark,
    setOutputLocation,
    startRender,
  };
}
