import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LANG_URLS } from "../src/utils/constants.js";
import { parseStudents } from "../src/utils/students.js";
import ArenaRatingVideo from "./remotion/ArenaRatingVideo.jsx";
import { DEFAULT_VIDEO_SETTINGS, getTimeline, totalDurationInFrames, validateVideoSettings } from "./core/config.js";
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

const RATINGS_KEY = "ba_pvp_ratings";
const PROJECT_KEY = "baart_video_project_settings";

function NumberControl({ label, value, onChange, min = 0, max, step = 0.1 }) {
  return <label className="studio-control"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function SortableStudent({ record }) {
  const id = String(record.student.id);
  const sortable = useSortable({ id });
  return <div ref={sortable.setNodeRef} className="studio-order-item" style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} {...sortable.attributes} {...sortable.listeners}>
    <span className="studio-order-handle">⋮⋮</span><span>{record.student.name}</span><small>#{record.student.id} · {record.student.school}</small>
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

export default function VideoStudio() {
  const saved = useMemo(() => readStoredJson(PROJECT_KEY), []);
  const [settings, setSettings] = useState({ ...DEFAULT_VIDEO_SETTINGS, ...(saved.settings || {}) });
  const [order, setOrder] = useState({ ...DEFAULT_ORDER, ...(saved.order || {}) });
  const [ratingsSource, setRatingsSource] = useState(() => readStoredJson(RATINGS_KEY));
  const [fetchedRecords, setFetchedRecords] = useState([]);
  const [snapshotRecords, setSnapshotRecords] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [renderJob, setRenderJob] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef(null);
  const importRef = useRef(null);
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
    const player = playerRef.current;
    if (!player) return undefined;
    const listener = event => setCurrentFrame(event.detail.frame);
    player.addEventListener("frameupdate", listener);
    return () => player.removeEventListener("frameupdate", listener);
  }, [records.length]);

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
      const response = await fetch("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Render could not start");
      setRenderJob(result);
    } catch (error) {
      const message = error instanceof TypeError ? vt(language, "renderUnavailable") : String(error);
      setRenderJob({ status: "error", error: message, progress: 0 });
    }
  };

  useEffect(() => {
    if (!renderJob?.id || !isActiveRenderStatus(renderJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/render/${renderJob.id}`);
        if (response.ok) setRenderJob(await response.json());
      } catch {
        setRenderJob(current => ({ ...current, status: "error", error: vt(language, "renderUnavailable") }));
      }
    }, 750);
    return () => clearInterval(timer);
  }, [language, renderJob?.id, renderJob?.status]);

  const cancelRender = async () => {
    if (!renderJob?.id) return;
    const response = await fetch(`/api/render/${renderJob.id}/cancel`, { method: "POST" });
    if (response.ok) setRenderJob(await response.json());
  };

  const statusLabel = renderJob ? vt(language, renderJob.status) : "";

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
          <span>{currentStudent ? `${currentStudent.name} · #${currentStudent.id}` : vt(language, "noStudent")}</span>
          <span>{records.length} {vt(language, "students")} · {(durationInFrames / Number(settings.fps || 1)).toFixed(1)}s · {vt(language, "source")}: {vt(language, snapshotRecords ? "snapshot" : "localRatings")}</span>
        </div>
        {loadError ? <div className="studio-error">{loadError}</div> : null}
        {errors.length ? <div className="studio-error">{errors.join(" ")}</div> : null}
        {renderJob ? <div className="studio-render-status"><span>{statusLabel}{renderJob.browserDownload && !renderJob.browserDownload.alreadyAvailable ? ` · ${vt(language, "browserDownload")} ${Math.round(renderJob.browserDownload.percent)}%` : ""}{renderJob.output ? ` · ${renderJob.output}` : ""}{renderJob.error ? ` · ${renderJob.error}` : ""}</span><progress value={renderJob.progress || 0} max="1" />{activeRender ? <button onClick={cancelRender}>{vt(language, "cancel")}</button> : null}</div> : null}
      </section>

      <aside className="studio-sidebar">
        <section className="studio-panel"><h2>{vt(language, "project")}</h2><div className="studio-actions"><button onClick={() => importRef.current?.click()}>{vt(language, "importJson")}</button><button disabled={!project} onClick={() => project && downloadJson(`${settings.outputName}.baart-video.json`, project)}>{vt(language, "saveProject")}</button></div><input ref={importRef} type="file" accept=".json" hidden onChange={handleImport} /></section>
        <section className="studio-panel"><h2>{vt(language, "output")}</h2>
          <label className="studio-control"><span>{vt(language, "preset")}</span><select value={`${settings.width}x${settings.height}`} onChange={event => { const [width, height] = event.target.value.split("x").map(Number); setSettings(current => ({ ...current, width, height })); }}><option value="1920x1080">1080p</option><option value="3840x2160">4K</option><option value="1280x720">720p</option></select></label>
          <label className="studio-control"><span>FPS</span><select value={settings.fps} onChange={event => updateSetting("fps", Number(event.target.value))}>{[24, 25, 30, 50, 60].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="studio-control"><span>{vt(language, "format")}</span><select value={settings.format} onChange={event => updateSetting("format", event.target.value)}><option value="mp4">MP4</option><option value="png">PNG</option></select></label>
          <label className="studio-control"><span>{vt(language, "filename")}</span><input value={settings.outputName} onChange={event => updateSetting("outputName", event.target.value)} /></label>
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
          <NumberControl label={vt(language, "radarAxisStep")} value={settings.radarAxisStep} step={0.02} onChange={value => updateSetting("radarAxisStep", value)} />
          <NumberControl label={vt(language, "radarDataStep")} value={settings.radarDataStep} step={0.02} onChange={value => updateSetting("radarDataStep", value)} />
          <NumberControl label={vt(language, "polygonReveal")} value={settings.polygonReveal} step={0.05} onChange={value => updateSetting("polygonReveal", value)} />
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
          <label className="studio-control"><span>{vt(language, "sort")}</span><select value={order.mode} onChange={event => setOrder(current => ({ ...current, mode: event.target.value }))}><option value="chronological">{vt(language, "chronological")}</option><option value="id">{vt(language, "studentId")}</option><option value="school">{vt(language, "school")}</option><option value="manual">{vt(language, "manual")}</option></select></label>
          <label className="studio-control"><span>{vt(language, "direction")}</span><select value={order.direction} onChange={event => setOrder(current => ({ ...current, direction: event.target.value }))}><option value="asc">{vt(language, "ascending")}</option><option value="desc">{vt(language, "descending")}</option></select></label>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}><SortableContext items={ordered.map(record => String(record.student.id))} strategy={verticalListSortingStrategy}><div className="studio-order-list">{ordered.map(record => <SortableStudent key={record.student.id} record={record} />)}</div></SortableContext></DndContext>
        </section>
        <button className="studio-render-button" disabled={!project || !records.length || errors.length > 0 || activeRender} onClick={startRender}>{settings.format === "mp4" ? vt(language, "renderMp4") : vt(language, "renderPng")}</button>
      </aside>
    </main>
  </div>;
}
