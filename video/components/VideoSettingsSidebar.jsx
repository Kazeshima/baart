import React from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LANG_URLS } from "../../src/utils/constants.js";
import { usesTauriRenderTransport } from "../render-client.js";
import { vt } from "../core/i18n.js";
import { benchmarkBottleneckTranslationKey, downloadJson } from "../core/studio.js";
import ScoringSettingsPanel from "./ScoringSettingsPanel.jsx";
import { NumberControl, SortableStudent } from "./StudioControls.jsx";

export default function VideoSettingsSidebar({
  activeRender,
  benchmarkResult,
  benchmarking,
  chooseDestination,
  errors,
  handleImport,
  importRef,
  language,
  order,
  ordered,
  outputLocation,
  project,
  recordsCount,
  runBenchmark,
  setOrder,
  setOutputLocation,
  setSettings,
  settings,
  startRender,
  updateDataLanguage,
  updateSetting,
  updateSharedPresetWeight,
  updateSharedWeightShare,
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = event => {
    if (!event.over || event.active.id === event.over.id) return;
    const ids = ordered.map(record => String(record.student.id));
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    setOrder({ mode: "manual", direction: "asc", manualIds: arrayMove(ids, from, to).map(Number) });
  };
  const benchmarkBottleneckLabel = value => vt(language, benchmarkBottleneckTranslationKey(value));

  return <aside className="studio-sidebar">
    <section className="studio-panel"><h2>{vt(language, "project")}</h2><div className="studio-actions"><button onClick={() => importRef.current?.click()}>{vt(language, "importJson")}</button><button disabled={!project} onClick={() => project && downloadJson(`${settings.outputName}.baart-video.json`, project)}>{vt(language, "saveProject")}</button></div><input ref={importRef} type="file" accept=".json" hidden onChange={handleImport} /></section>
    <section className="studio-panel"><h2>{vt(language, "output")}</h2>
      <label className="studio-control"><span>{vt(language, "preset")}</span><select value={`${settings.width}x${settings.height}`} onChange={event => { const [width, height] = event.target.value.split("x").map(Number); setSettings(current => ({ ...current, width, height })); }}><option value="1920x1080">1080p</option><option value="3840x2160">4K</option><option value="1280x720">720p</option></select></label>
      <label className="studio-control"><span>FPS</span><select value={settings.fps} onChange={event => updateSetting("fps", Number(event.target.value))}>{[24, 25, 30, 50, 60].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="studio-control"><span>{vt(language, "renderConcurrency")}</span><select value={settings.renderConcurrency} onChange={event => updateSetting("renderConcurrency", event.target.value)}><option value="adaptive">{vt(language, "adaptive")}</option><option value="auto">{vt(language, "auto")}</option>{["100%", "1", "2", "4", "6", "8", "12", "16"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="studio-control"><span>{vt(language, "renderQuality")}</span><select value={settings.renderQualityMode} onChange={event => updateSetting("renderQualityMode", event.target.value)}><option value="quality">{vt(language, "quality")}</option><option value="balanced">{vt(language, "balanced")}</option><option value="fast">{vt(language, "fast")}</option></select></label>
      <div className="studio-benchmark"><button type="button" disabled={!project || activeRender || benchmarking} onClick={runBenchmark}>{benchmarking ? vt(language, "benchmarking") : vt(language, "benchmarkConcurrency")}</button>{benchmarkResult?.best ? <span>{vt(language, "benchmarkBest")}: {benchmarkResult.best.renderConcurrency} · {benchmarkResult.best.fps} fps{benchmarkResult.best.medianFps ? ` (${vt(language, "median")} ${benchmarkResult.best.medianFps} fps)` : ""} · {vt(language, "benchmarkIo")}: {benchmarkResult.io?.filesPerSecond} {vt(language, "framesPerSecondUnit")} · {vt(language, "benchmarkBottleneck")}: {benchmarkBottleneckLabel(benchmarkResult.best.bottleneck)}</span> : null}{benchmarkResult ? <button type="button" onClick={() => downloadJson(`${settings.outputName}-benchmark-report.json`, benchmarkResult)}>{vt(language, "downloadBenchmarkReport")}</button> : null}</div>
      <label className="studio-control"><span>{vt(language, "format")}</span><select value={settings.format} onChange={event => { updateSetting("format", event.target.value); setOutputLocation(""); }}><option value="mp4">MP4</option><option value="png">{vt(language, "pngSequence")}</option><option value="jpeg">{vt(language, "jpegSequence")}</option></select></label>
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
    <ScoringSettingsPanel settings={settings} language={language} updateSetting={updateSetting} updateSharedPresetWeight={updateSharedPresetWeight} updateSharedWeightShare={updateSharedWeightShare} />
    <section className="studio-panel"><h2>{vt(language, "timing")}</h2>
      <NumberControl label={vt(language, "studentDuration")} value={settings.studentDuration} min={1} step={0.5} onChange={value => updateSetting("studentDuration", value)} />
      <NumberControl label={vt(language, "fadeIn")} value={settings.fadeIn} onChange={value => updateSetting("fadeIn", value)} />
      <NumberControl label={vt(language, "fadeOut")} value={settings.fadeOut} onChange={value => updateSetting("fadeOut", value)} />
      <NumberControl label={vt(language, "infoStagger")} value={settings.infoStagger} step={0.02} onChange={value => updateSetting("infoStagger", value)} />
      <NumberControl label={vt(language, "infoEnterDuration")} value={settings.infoEnterDuration} step={0.05} onChange={value => updateSetting("infoEnterDuration", value)} />
      <NumberControl label={vt(language, "infoEnterDistance")} value={settings.infoEnterDistance} step={2} onChange={value => updateSetting("infoEnterDistance", value)} />
      <NumberControl label={vt(language, "radarScanDuration")} value={settings.radarScanDuration} min={0.5} step={0.1} onChange={value => updateSetting("radarScanDuration", value)} />
      <NumberControl label={vt(language, "radarPointDuration")} value={settings.radarPointDuration} min={0.1} step={0.05} onChange={value => updateSetting("radarPointDuration", value)} />
      <NumberControl label={vt(language, "radarPolygonDuration")} value={settings.radarPolygonDuration} min={0.1} step={0.05} onChange={value => updateSetting("radarPolygonDuration", value)} />
      <NumberControl label={vt(language, "overallDelay")} value={settings.overallDelay} step={0.05} onChange={value => updateSetting("overallDelay", value)} />
      <NumberControl label={vt(language, "overallReveal")} value={settings.overallReveal} step={0.05} onChange={value => updateSetting("overallReveal", value)} />
    </section>
    <section className="studio-panel"><h2>{vt(language, "effects")}</h2>
      <NumberControl label={vt(language, "scanIntensity")} value={settings.scanBeamIntensity} min={0} max={1} step={0.05} onChange={value => updateSetting("scanBeamIntensity", value)} />
      <NumberControl label={vt(language, "scanTrailDegrees")} value={settings.radarScanTrailDegrees} min={0} max={180} step={2} onChange={value => updateSetting("radarScanTrailDegrees", value)} />
      <NumberControl label={vt(language, "scanTrailSegments")} value={settings.radarScanTrailSegments} min={0} max={24} step={1} onChange={value => updateSetting("radarScanTrailSegments", value)} />
      <NumberControl label={vt(language, "overallGlow")} value={settings.overallGlowStrength} min={0} step={5} onChange={value => updateSetting("overallGlowStrength", value)} />
      <NumberControl label={vt(language, "rippleCount")} value={settings.rippleCount} min={0} max={6} step={1} onChange={value => updateSetting("rippleCount", value)} />
      <NumberControl label={vt(language, "rippleDuration")} value={settings.rippleDuration} step={0.05} onChange={value => updateSetting("rippleDuration", value)} />
      <NumberControl label={vt(language, "rippleScale")} value={settings.rippleScale} step={0.1} onChange={value => updateSetting("rippleScale", value)} />
      <NumberControl label={vt(language, "rippleOpacity")} value={settings.rippleOpacity} min={0} max={1} step={0.05} onChange={value => updateSetting("rippleOpacity", value)} />
      <label className="studio-control"><span>{vt(language, "commentMode")}</span><select value={settings.commentScrollMode} onChange={event => updateSetting("commentScrollMode", event.target.value)}><option value="fitHold">{vt(language, "commentFitHold")}</option><option value="fixedSpeed">{vt(language, "commentFixedSpeed")}</option></select></label>
      <NumberControl label={vt(language, "commentDelay")} value={settings.commentScrollDelay} step={0.1} onChange={value => updateSetting("commentScrollDelay", value)} />
      <NumberControl label={vt(language, "commentSpeed")} value={settings.commentScrollSpeed} step={2} onChange={value => updateSetting("commentScrollSpeed", value)} />
    </section>
    <section className="studio-panel"><h2>{vt(language, "order")}</h2>
      <label className="studio-control"><span>{vt(language, "sort")}</span><select value={order.mode} onChange={event => { const mode = event.target.value; setOrder(current => ({ ...current, mode, direction: mode === "score" ? "desc" : current.direction })); }}><option value="chronological">{vt(language, "chronological")}</option><option value="score">{vt(language, "overallScore")}</option><option value="id">{vt(language, "studentId")}</option><option value="school">{vt(language, "school")}</option><option value="manual">{vt(language, "manual")}</option></select></label>
      <label className="studio-control"><span>{vt(language, "direction")}</span><select value={order.direction} onChange={event => setOrder(current => ({ ...current, direction: event.target.value }))}><option value="asc">{vt(language, "ascending")}</option><option value="desc">{vt(language, "descending")}</option></select></label>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}><SortableContext items={ordered.map(record => String(record.student.id))} strategy={verticalListSortingStrategy}><div className="studio-order-list">{ordered.map(record => <SortableStudent key={record.student.id} record={record} language={language} />)}</div></SortableContext></DndContext>
    </section>
    <button className="studio-render-button" disabled={!project || !recordsCount || errors.length > 0 || activeRender} onClick={startRender}>{settings.format === "mp4" ? vt(language, "renderMp4") : settings.format === "jpeg" ? vt(language, "renderJpeg") : vt(language, "renderPng")}</button>
  </aside>;
}
