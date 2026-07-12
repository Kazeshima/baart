import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { LANG_URLS } from "../src/utils/constants.js";
import {
  adjustFineWeightShare,
  normalizeDimensionWeights,
} from "../src/utils/scoring.js";
import {
  RATING_ORDER_STORAGE_KEYS,
  WEIGHT_STORAGE_KEYS,
  persistRatingOrder,
  persistSharedWeightSettings,
  readRatingOrder,
  readRatingsPayload,
  readSharedWeightSettings,
  readStoredJson,
} from "../src/store/ratingPersistence.js";
import { parseStudents } from "../src/utils/students.js";
import { studentDisplayName } from "../src/utils/studentDisplay.js";
import ArenaRatingVideo from "./remotion/ArenaRatingVideo.jsx";
import { DEFAULT_VIDEO_SETTINGS, getTimeline, totalDurationInFrames, validateVideoSettings } from "./core/config.js";
import {
  mergeRatedStudents,
  orderedProjectRecords,
  parseVideoProject,
  ratingsFromProjectRecords,
  safeCreateVideoProject,
} from "./core/manifest.js";
import { normalizeRatingOrder } from "./core/sorting.js";
import { vt } from "./core/i18n.js";
import { usePreviewTelemetry } from "./hooks/usePreviewTelemetry.js";
import { useVideoRenderJob } from "./hooks/useVideoRenderJob.js";
import VideoSettingsSidebar from "./components/VideoSettingsSidebar.jsx";
import { formatDuration } from "./core/studio.js";

const PROJECT_KEY = "baart_video_project_settings";

function initialVideoSettings(saved) {
  const savedSettings = saved.settings || {};
  const sharedWeightSettings = readSharedWeightSettings(savedSettings);
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    ...savedSettings,
    ...sharedWeightSettings,
  };
}

export default function VideoStudio() {
  const saved = useMemo(() => readStoredJson(PROJECT_KEY), []);
  const [settings, setSettings] = useState(() => initialVideoSettings(saved));
  const [order, setOrder] = useState(() => readRatingOrder(saved.order));
  const [ratingsSource, setRatingsSource] = useState(() => readRatingsPayload().ratings);
  const [fetchedRecords, setFetchedRecords] = useState([]);
  const [snapshotRecords, setSnapshotRecords] = useState(null);
  const [loadError, setLoadError] = useState("");
  const playerRef = useRef(null);
  const importRef = useRef(null);
  const language = settings.uiLanguage;
  const records = snapshotRecords ?? fetchedRecords;

  useEffect(() => {
    if (snapshotRecords) return undefined;
    let cancelled = false;
    fetch(LANG_URLS[settings.dataLanguage] || LANG_URLS.zh)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Student data HTTP ${response.status}`)))
      .then(raw => {
        if (!cancelled) {
          setFetchedRecords(mergeRatedStudents(parseStudents(raw), ratingsSource, settings));
          setLoadError("");
        }
      })
      .catch(error => { if (!cancelled) setLoadError(String(error)); });
    return () => { cancelled = true; };
  }, [ratingsSource, settings.dataLanguage, settings.weightMode, settings.weightEditorMode, settings.sharedDimensionWeightShares, settings.sharedDimensionWeights, snapshotRecords]);

  useEffect(() => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify({ settings, order }));
  }, [settings, order]);

  useEffect(() => {
    persistRatingOrder(order);
  }, [order]);

  useEffect(() => {
    const listener = event => {
      if (WEIGHT_STORAGE_KEYS.includes(event.key)) {
        setSettings(current => ({ ...current, ...readSharedWeightSettings(current) }));
      }
      if (RATING_ORDER_STORAGE_KEYS.includes(event.key)) {
        setOrder(readRatingOrder(order));
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [order]);

  const projectResult = useMemo(() => safeCreateVideoProject({ records, settings, order }), [records, settings, order]);
  const project = projectResult.success ? projectResult.data : null;
  const ordered = useMemo(() => project ? orderedProjectRecords(project) : [], [project]);
  const settingsErrors = validateVideoSettings(settings);
  const schemaErrors = projectResult.success ? [] : projectResult.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
  const errors = [...new Set([...settingsErrors, ...schemaErrors])];
  const durationInFrames = project ? totalDurationInFrames(records.length, settings) : 1;
  const { currentFrame, setCurrentFrame, previewFps } = usePreviewTelemetry({
    playerRef,
    recordsLength: records.length,
    targetFps: settings.fps,
    durationInFrames,
  });
  const timeline = getTimeline(settings);
  const currentIndex = records.length ? Math.min(records.length - 1, Math.floor(currentFrame / Math.max(1, timeline.duration))) : 0;
  const currentStudent = ordered[currentIndex]?.student;

  const updateSetting = useCallback((key, value) => setSettings(current => {
    const next = { ...current, [key]: value };
    if (["weightMode", "weightEditorMode", "sharedDimensionWeightShares", "sharedDimensionWeights"].includes(key)) {
      persistSharedWeightSettings(next);
    }
    return next;
  }), []);
  const updateSharedWeightShare = useCallback((key, value) => setSettings(current => {
    const next = {
      ...current,
      sharedDimensionWeightShares: adjustFineWeightShare(current.sharedDimensionWeightShares, key, value).dimensionWeightShares,
    };
    persistSharedWeightSettings(next);
    return next;
  }), []);
  const updateSharedPresetWeight = useCallback((key, value) => setSettings(current => {
    const next = {
      ...current,
      sharedDimensionWeights: normalizeDimensionWeights({ dimensionWeights: { ...current.sharedDimensionWeights, [key]: value } }),
    };
    persistSharedWeightSettings(next);
    return next;
  }), []);
  const updateDataLanguage = value => {
    setSnapshotRecords(null);
    updateSetting("dataLanguage", value);
  };
  const {
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
  } = useVideoRenderJob({ project, settings, language, savedSettings: saved.settings, updateSetting });

  const handleImport = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.version === 1 && Array.isArray(parsed.records)) {
        const imported = parseVideoProject(parsed);
        setRatingsSource(ratingsFromProjectRecords(imported.records));
        setSnapshotRecords(imported.records);
        persistSharedWeightSettings(imported.settings);
        setSettings({ ...imported.settings, ...readSharedWeightSettings(imported.settings) });
        persistRatingOrder(imported.order);
        setOrder(normalizeRatingOrder(imported.order));
        setOutputLocation("");
      } else {
        setSnapshotRecords(null);
        const payload = parsed?.ratings && typeof parsed.ratings === "object" ? parsed : { ratings: parsed };
        setRatingsSource(payload.ratings || {});
        if (payload.weightMode || payload.weightEditorMode || payload.sharedDimensionWeightShares || payload.sharedDimensionWeights) {
          setSettings(current => {
            const next = {
              ...current,
              weightMode: payload.weightMode || current.weightMode,
              weightEditorMode: payload.weightEditorMode || current.weightEditorMode,
              sharedDimensionWeightShares: payload.sharedDimensionWeightShares || current.sharedDimensionWeightShares,
              sharedDimensionWeights: payload.sharedDimensionWeights || current.sharedDimensionWeights,
            };
            persistSharedWeightSettings(next);
            return { ...next, ...readSharedWeightSettings(next) };
          });
        }
      }
      setCurrentFrame(0);
      setLoadError("");
    } catch (error) {
      setLoadError(`${vt(language, "importFailed")}: ${error instanceof Error ? error.message : String(error)}`);
    }
    event.target.value = "";
  };

  const statusLabel = renderJob ? vt(language, renderJob.status) : "";
  const renderLogs = renderJob?.logs || [];
  const renderPercent = Math.round((renderJob?.progress || 0) * 100);
  const renderFrameLabel = renderJob?.kind === "benchmark" ? vt(language, "benchmarkSteps") : vt(language, "framesRendered");
  const renderFrameText = Number.isFinite(renderJob?.renderedFrames) && Number.isFinite(renderJob?.totalFrames)
    ? `${renderFrameLabel} ${Math.round(renderJob.renderedFrames)} / ${Math.round(renderJob.totalFrames)}`
    : "";
  const renderSpeedText = Number.isFinite(renderJob?.fpsEstimate) && renderJob.fpsEstimate > 0
    ? `${vt(language, "renderSpeed")} ${renderJob.fpsEstimate.toFixed(1)} fps`
    : "";
  const renderEtaText = Number.isFinite(renderJob?.etaSeconds)
    ? `${vt(language, "eta")} ${formatDuration(renderJob.etaSeconds)}`
    : "";

  return <div className="video-studio baart-theme" data-theme={settings.theme}>
    <header className="studio-header"><div><strong>BAART</strong><span>{vt(language, "studio")}</span></div><a href="./index.html">{vt(language, "back")}</a></header>
    <main className="studio-layout">
      <section className="studio-preview">
        <div className="studio-player-shell">
          {project && records.length ? <Player ref={playerRef} component={ArenaRatingVideo} inputProps={{ project }} durationInFrames={durationInFrames} compositionWidth={1920} compositionHeight={1080} fps={settings.fps} controls style={{ width: "100%", aspectRatio: "16 / 9" }} /> : <div className="studio-empty">{vt(language, "empty")}</div>}
        </div>
        {project && records.length ? <label className="studio-timeline">
          <span>{currentFrame} / {durationInFrames - 1}</span>
          <input aria-label="Video timeline" type="range" min="0" max={durationInFrames - 1} value={Math.min(currentFrame, durationInFrames - 1)} onChange={event => {
            const frame = Number(event.target.value);
            playerRef.current?.seekTo(frame);
            setCurrentFrame(frame);
          }} />
        </label> : null}
        <div className="studio-status">
          <span>{currentStudent ? `${studentDisplayName(currentStudent, language)} · #${currentStudent.id}` : vt(language, "noStudent")}</span>
          <span>{records.length} {vt(language, "students")} · {(durationInFrames / Number(settings.fps || 1)).toFixed(1)}s · {vt(language, "previewFps")} {previewFps.toFixed(1)} / {settings.fps} · {vt(language, "source")}: {vt(language, snapshotRecords ? "snapshot" : "localRatings")}</span>
        </div>
        {loadError ? <div className="studio-error">{loadError}</div> : null}
        {errors.length ? <div className="studio-error">{errors.join(" ")}</div> : null}
        {renderJob ? <>
          <div className="studio-render-status">
            <span>{statusLabel} · {renderPercent}%{renderJob.browserDownload && !renderJob.browserDownload.alreadyAvailable ? ` · ${vt(language, "browserDownload")} ${Math.round(renderJob.browserDownload.percent)}%` : ""}{renderFrameText ? ` · ${renderFrameText}` : ""}{renderSpeedText ? ` · ${renderSpeedText}` : ""}{renderEtaText ? ` · ${renderEtaText}` : ""}{renderJob.output ? ` · ${renderJob.output}` : ""}{renderJob.error ? ` · ${renderJob.error}` : ""}</span>
            <progress value={renderJob.progress || 0} max="1" />
            {activeRender ? <button onClick={cancelRender}>{vt(language, "cancel")}</button> : null}
          </div>
          {renderLogs.length ? <details className="studio-render-logs"><summary>{vt(language, "renderLogs")} ({renderLogs.length})</summary><pre>{renderLogs.join("\n")}</pre></details> : null}
        </> : null}
      </section>

      <VideoSettingsSidebar
        activeRender={activeRender}
        benchmarkResult={benchmarkResult}
        benchmarking={benchmarking}
        chooseDestination={chooseDestination}
        errors={errors}
        handleImport={handleImport}
        importRef={importRef}
        language={language}
        order={order}
        ordered={ordered}
        outputLocation={outputLocation}
        project={project}
        recordsCount={records.length}
        runBenchmark={runBenchmark}
        setOrder={setOrder}
        setOutputLocation={setOutputLocation}
        setSettings={setSettings}
        settings={settings}
        startRender={startRender}
        updateDataLanguage={updateDataLanguage}
        updateSetting={updateSetting}
        updateSharedPresetWeight={updateSharedPresetWeight}
        updateSharedWeightShare={updateSharedWeightShare}
      />
    </main>
  </div>;
}
