import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LANG_URLS } from "../src/utils/constants.js";
import { schoolLabel } from "../src/utils/i18n.js";
import { parseStudents } from "../src/utils/students.js";
import { studentDisplayName } from "../src/utils/studentDisplay.js";
import ArenaRatingVideo from "./remotion/ArenaRatingVideo.jsx";
import { DEFAULT_VIDEO_SETTINGS, benchmarkStorageKey, estimatePreviewFps, getTimeline, totalDurationInFrames, validateVideoSettings } from "./core/config.js";
import {
  mergeRatedStudents,
  orderedProjectRecords,
  parseVideoProject,
  ratingsFromProjectRecords,
  safeCreateVideoProject,
} from "./core/manifest.js";
import { DEFAULT_ORDER } from "./core/sorting.js";
import { vt } from "./core/i18n.js";
import { isActiveRenderStatus } from "./core/renderJob.js";
import {
  cancelRenderJob,
  benchmarkRenderSettings,
  chooseRenderOutput,
  getRenderJob,
  startRenderJob,
  usesTauriRenderTransport,
} from "./render-client.js";

const RATINGS_KEY = "ba_pvp_ratings";
const PROJECT_KEY = "baart_video_project_settings";
const BENCHMARK_KEY = "baart_video_render_benchmarks";

function NumberControl({ label, value, onChange, min = 0, max, step = 0.1 }) {
  return <label className="studio-control"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function SortableStudent({ record, language }) {
  const id = String(record.student.id);
  const sortable = useSortable({ id });
  return <div ref={sortable.setNodeRef} className="studio-order-item" style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} {...sortable.attributes} {...sortable.listeners}>
    <span className="studio-order-handle">⋮⋮</span><span>{studentDisplayName(record.student, language)}</span><small>#{record.student.id} · {schoolLabel(language, record.student.school)}</small>
  </div>;
}

function downloadJson(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readStoredJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return minutes > 0 ? `${minutes}:${String(remaining).padStart(2, "0")}` : `${remaining}s`;
}

function benchmarkBottleneckLabel(language, value) {
  if (value === "disk-io") return vt(language, "bottleneckDiskIo");
  if (value === "browser-or-png-encoding") return vt(language, "bottleneckBrowserPng");
  return vt(language, "bottleneckUnknown");
}

export default function VideoStudio() {
  const saved = useMemo(() => readStoredJson(PROJECT_KEY), []);
  const [settings, setSettings] = useState({ ...DEFAULT_VIDEO_SETTINGS, ...(saved.settings || {}) });
  const [order, setOrder] = useState({ ...DEFAULT_ORDER, ...(saved.order || {}) });
  const [ratingsSource, setRatingsSource] = useState(() => readStoredJson(RATINGS_KEY));
  const [fetchedRecords, setFetchedRecords] = useState([]);
  const [snapshotRecords, setSnapshotRecords] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [renderJob, setRenderJob] = useState(null);
  const [benchmarkResult, setBenchmarkResult] = useState(() => readStoredJson(BENCHMARK_KEY)[benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, ...(saved.settings || {}) })] || null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [outputLocation, setOutputLocation] = useState("");
  const [currentFrame, setCurrentFrame] = useState(0);
  const [previewFps, setPreviewFps] = useState(0);
  const playerRef = useRef(null);
  const importRef = useRef(null);
  const previewEventsRef = useRef(0);
  const lastFrameUiUpdateRef = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const language = settings.uiLanguage;
  const records = snapshotRecords ?? fetchedRecords;

  useEffect(() => {
    if (snapshotRecords) return undefined;
    let cancelled = false;
    fetch(LANG_URLS[settings.dataLanguage] || LANG_URLS.zh)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Student data HTTP ${response.status}`)))
      .then(raw => {
        if (!cancelled) {
          setFetchedRecords(mergeRatedStudents(parseStudents(raw), ratingsSource));
          setLoadError("");
        }
      })
      .catch(error => { if (!cancelled) setLoadError(String(error)); });
    return () => { cancelled = true; };
  }, [ratingsSource, settings.dataLanguage, snapshotRecords]);

  useEffect(() => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify({ settings, order }));
  }, [settings, order]);

  useEffect(() => {
    setBenchmarkResult(readStoredJson(BENCHMARK_KEY)[benchmarkStorageKey(settings)] || null);
  }, [settings.width, settings.height, settings.fps, settings.theme, settings.uiLanguage, settings.dataLanguage]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const listener = event => {
      const frame = event.detail.frame;
      previewEventsRef.current += 1;
      const now = performance.now();
      if (now - lastFrameUiUpdateRef.current >= 100) {
        lastFrameUiUpdateRef.current = now;
        setCurrentFrame(frame);
      }
    };
    player.addEventListener("frameupdate", listener);
    return () => player.removeEventListener("frameupdate", listener);
  }, [records.length]);

  useEffect(() => {
    let raf = 0;
    let lastTime = performance.now();
    let lastEvents = previewEventsRef.current;
    const tick = now => {
      if (now - lastTime >= 1000) {
        const events = previewEventsRef.current - lastEvents;
        setPreviewFps(estimatePreviewFps(events, now - lastTime));
        lastEvents = previewEventsRef.current;
        lastTime = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [records.length, settings.fps]);

  const projectResult = useMemo(() => safeCreateVideoProject({ records, settings, order }), [records, settings, order]);
  const project = projectResult.success ? projectResult.data : null;
  const ordered = useMemo(() => project ? orderedProjectRecords(project) : [], [project]);
  const settingsErrors = validateVideoSettings(settings);
  const schemaErrors = projectResult.success ? [] : projectResult.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
  const errors = [...new Set([...settingsErrors, ...schemaErrors])];
  const durationInFrames = project ? totalDurationInFrames(records.length, settings) : 1;
  const timeline = getTimeline(settings);
  const currentIndex = records.length ? Math.min(records.length - 1, Math.floor(currentFrame / Math.max(1, timeline.duration))) : 0;
  const currentStudent = ordered[currentIndex]?.student;
  const activeRender = isActiveRenderStatus(renderJob?.status);

  const updateSetting = useCallback((key, value) => setSettings(current => ({ ...current, [key]: value })), []);
  const updateDataLanguage = value => {
    setSnapshotRecords(null);
    updateSetting("dataLanguage", value);
  };

  useEffect(() => {
    const lastFrame = Math.max(0, durationInFrames - 1);
    if (currentFrame > lastFrame) {
      playerRef.current?.seekTo(lastFrame);
      setCurrentFrame(lastFrame);
    }
  }, [currentFrame, durationInFrames]);

  const handleImport = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.version === 1 && Array.isArray(parsed.records)) {
        const imported = parseVideoProject(parsed);
        setRatingsSource(ratingsFromProjectRecords(imported.records));
        setSnapshotRecords(imported.records);
        setSettings(imported.settings);
        setOrder(imported.order);
        setOutputLocation("");
      } else {
        setSnapshotRecords(null);
        setRatingsSource(parsed);
      }
      setCurrentFrame(0);
      setLoadError("");
    } catch (error) {
      setLoadError(`${vt(language, "importFailed")}: ${error instanceof Error ? error.message : String(error)}`);
    }
    event.target.value = "";
  };

  const handleDragEnd = event => {
    if (!event.over || event.active.id === event.over.id) return;
    const ids = ordered.map(record => String(record.student.id));
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    setOrder({ mode: "manual", direction: "asc", manualIds: arrayMove(ids, from, to).map(Number) });
  };

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
      if (best?.renderConcurrency) {
        updateSetting("renderConcurrency", best.renderConcurrency);
      }
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

  const statusLabel = renderJob ? vt(language, renderJob.status) : "";
  const renderLogs = renderJob?.logs || [];
  const renderPercent = Math.round((renderJob?.progress || 0) * 100);
  const renderFrameText = Number.isFinite(renderJob?.renderedFrames) && Number.isFinite(renderJob?.totalFrames)
    ? `${vt(language, "framesRendered")} ${Math.round(renderJob.renderedFrames)} / ${Math.round(renderJob.totalFrames)}`
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

      <aside className="studio-sidebar">
        <section className="studio-panel"><h2>{vt(language, "project")}</h2><div className="studio-actions"><button onClick={() => importRef.current?.click()}>{vt(language, "importJson")}</button><button disabled={!project} onClick={() => project && downloadJson(`${settings.outputName}.baart-video.json`, project)}>{vt(language, "saveProject")}</button></div><input ref={importRef} type="file" accept=".json" hidden onChange={handleImport} /></section>
        <section className="studio-panel"><h2>{vt(language, "output")}</h2>
          <label className="studio-control"><span>{vt(language, "preset")}</span><select value={`${settings.width}x${settings.height}`} onChange={event => { const [width, height] = event.target.value.split("x").map(Number); setSettings(current => ({ ...current, width, height })); }}><option value="1920x1080">1080p</option><option value="3840x2160">4K</option><option value="1280x720">720p</option></select></label>
          <label className="studio-control"><span>FPS</span><select value={settings.fps} onChange={event => updateSetting("fps", Number(event.target.value))}>{[24, 25, 30, 50, 60].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="studio-control"><span>{vt(language, "renderConcurrency")}</span><select value={settings.renderConcurrency} onChange={event => updateSetting("renderConcurrency", event.target.value)}><option value="adaptive">{vt(language, "adaptive")}</option><option value="auto">{vt(language, "auto")}</option>{["25%", "50%", "75%", "100%", "1", "2", "4", "6", "8", "12", "16"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <div className="studio-benchmark"><button type="button" disabled={!project || activeRender || benchmarking} onClick={runBenchmark}>{benchmarking ? vt(language, "benchmarking") : vt(language, "benchmarkConcurrency")}</button>{benchmarkResult?.best ? <span>{vt(language, "benchmarkBest")}: {benchmarkResult.best.renderConcurrency} · {benchmarkResult.best.fps} fps · {vt(language, "benchmarkIo")}: {benchmarkResult.io?.filesPerSecond} {vt(language, "framesPerSecondUnit")} · {vt(language, "benchmarkBottleneck")}: {benchmarkBottleneckLabel(language, benchmarkResult.best.bottleneck)}</span> : null}{benchmarkResult ? <button type="button" onClick={() => downloadJson(`${settings.outputName}-benchmark-report.json`, benchmarkResult)}>{vt(language, "downloadBenchmarkReport")}</button> : null}</div>
          <label className="studio-control"><span>{vt(language, "format")}</span><select value={settings.format} onChange={event => { updateSetting("format", event.target.value); setOutputLocation(""); }}><option value="mp4">MP4</option><option value="png">{vt(language, "pngSequence")}</option></select></label>
          <label className="studio-control"><span>{vt(language, "filename")}</span><input value={settings.outputName} onChange={event => { updateSetting("outputName", event.target.value); setOutputLocation(""); }} /></label>
          <div className="studio-output-location"><span>{vt(language, "outputLocation")}</span><div><code title={outputLocation}>{outputLocation || (usesTauriRenderTransport() ? vt(language, "notSelected") : vt(language, "developmentOutput"))}</code>{usesTauriRenderTransport() ? <button type="button" onClick={chooseDestination}>{vt(language, "chooseOutput")}</button> : null}</div></div>
        </section>
        <section className="studio-panel"><h2>{vt(language, "presentation")}</h2>
          <label className="studio-control"><span>{vt(language, "theme")}</span><select value={settings.theme} onChange={event => updateSetting("theme", event.target.value)}><option value="dark">{vt(language, "night")}</option><option value="light">{vt(language, "day")}</option></select></label>
          <label className="studio-control"><span>{vt(language, "uiLanguage")}</span><select value={settings.uiLanguage} onChange={event => updateSetting("uiLanguage", event.target.value)}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="studio-control"><span>{vt(language, "dataLanguage")}</span><select value={settings.dataLanguage} onChange={event => updateDataLanguage(event.target.value)}>{Object.keys(LANG_URLS).map(key => <option key={key} value={key}>{key}</option>)}</select></label>
          <label className="studio-control"><span>{vt(language, "terrain")}</span><select value={settings.season} onChange={event => updateSetting("season", event.target.value)}>{["Street", "Outdoor", "Indoor"].map(value => <option key={value} value={value}>{vt(language, value)}</option>)}</select></label>
          <label className="studio-control"><span>{vt(language, "arenaSeason")}</span><input value={settings.arenaSeason} onChange={event => updateSetting("arenaSeason", event.target.value)} /></label>
          <NumberControl label={vt(language, "portraitOpacity")} value={settings.portraitOpacity} min={0} max={1} step={0.05} onChange={value => updateSetting("portraitOpacity", value)} />
        </section>
        <section className="studio-panel"><h2>{vt(language, "timing")}</h2>
          <NumberControl label={vt(language, "studentDuration")} value={settings.studentDuration} min={1} step={0.5} onChange={value => updateSetting("studentDuration", value)} />
          <NumberControl label={vt(language, "fadeIn")} value={settings.fadeIn} onChange={value => updateSetting("fadeIn", value)} />
          <NumberControl label={vt(language, "fadeOut")} value={settings.fadeOut} onChange={value => updateSetting("fadeOut", value)} />
          <NumberControl label={vt(language, "infoStagger")} value={settings.infoStagger} step={0.02} onChange={value => updateSetting("infoStagger", value)} />
          <NumberControl label={vt(language, "radarScanDuration")} value={settings.radarScanDuration} min={0.5} step={0.1} onChange={value => updateSetting("radarScanDuration", value)} />
          <NumberControl label={vt(language, "radarPointDuration")} value={settings.radarPointDuration} min={0.1} step={0.05} onChange={value => updateSetting("radarPointDuration", value)} />
          <NumberControl label={vt(language, "radarPolygonDuration")} value={settings.radarPolygonDuration} min={0.1} step={0.05} onChange={value => updateSetting("radarPolygonDuration", value)} />
          <NumberControl label={vt(language, "overallReveal")} value={settings.overallReveal} step={0.05} onChange={value => updateSetting("overallReveal", value)} />
        </section>
        <section className="studio-panel"><h2>{vt(language, "effects")}</h2>
          <NumberControl label={vt(language, "scanIntensity")} value={settings.scanBeamIntensity} min={0} max={1} step={0.05} onChange={value => updateSetting("scanBeamIntensity", value)} />
          <NumberControl label={vt(language, "rippleCount")} value={settings.rippleCount} min={0} max={6} step={1} onChange={value => updateSetting("rippleCount", value)} />
          <NumberControl label={vt(language, "rippleDuration")} value={settings.rippleDuration} step={0.05} onChange={value => updateSetting("rippleDuration", value)} />
          <NumberControl label={vt(language, "rippleScale")} value={settings.rippleScale} step={0.1} onChange={value => updateSetting("rippleScale", value)} />
          <NumberControl label={vt(language, "rippleOpacity")} value={settings.rippleOpacity} min={0} max={1} step={0.05} onChange={value => updateSetting("rippleOpacity", value)} />
          <NumberControl label={vt(language, "commentDelay")} value={settings.commentScrollDelay} step={0.1} onChange={value => updateSetting("commentScrollDelay", value)} />
          <NumberControl label={vt(language, "commentSpeed")} value={settings.commentScrollSpeed} step={2} onChange={value => updateSetting("commentScrollSpeed", value)} />
        </section>
        <section className="studio-panel"><h2>{vt(language, "order")}</h2>
          <label className="studio-control"><span>{vt(language, "sort")}</span><select value={order.mode} onChange={event => {
            const mode = event.target.value;
            setOrder(current => ({ ...current, mode, direction: mode === "score" ? "desc" : current.direction }));
          }}><option value="chronological">{vt(language, "chronological")}</option><option value="score">{vt(language, "overallScore")}</option><option value="id">{vt(language, "studentId")}</option><option value="school">{vt(language, "school")}</option><option value="manual">{vt(language, "manual")}</option></select></label>
          <label className="studio-control"><span>{vt(language, "direction")}</span><select value={order.direction} onChange={event => setOrder(current => ({ ...current, direction: event.target.value }))}><option value="asc">{vt(language, "ascending")}</option><option value="desc">{vt(language, "descending")}</option></select></label>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}><SortableContext items={ordered.map(record => String(record.student.id))} strategy={verticalListSortingStrategy}><div className="studio-order-list">{ordered.map(record => <SortableStudent key={record.student.id} record={record} language={language} />)}</div></SortableContext></DndContext>
        </section>
        <button className="studio-render-button" disabled={!project || !records.length || errors.length > 0 || activeRender} onClick={startRender}>{settings.format === "mp4" ? vt(language, "renderMp4") : vt(language, "renderPng")}</button>
      </aside>
    </main>
  </div>;
}
