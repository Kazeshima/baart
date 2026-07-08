import { DEFAULT_DIMENSION_WEIGHT_SHARES } from "../../src/utils/constants.js";
import { DEFAULT_DIMENSION_WEIGHTS, WEIGHT_EDITOR_MODES, normalizeDimensionWeights, normalizeFineWeightState, normalizeWeightEditorMode, normalizeWeightMode } from "../../src/utils/scoring.js";

export const VIDEO_PROJECT_VERSION = 1;
export const COMMENT_SCROLL_TOP_GAP = 28;

export const DEFAULT_VIDEO_SETTINGS = Object.freeze({
  width: 1920,
  height: 1080,
  fps: 30,
  renderConcurrency: "adaptive",
  renderQualityMode: "balanced",
  format: "mp4",
  outputName: "baart-arena-ratings",
  studentDuration: 12,
  fadeIn: 0.7,
  fadeOut: 0.7,
  infoStagger: 0.14,
  infoEnterDuration: 0.53,
  infoEnterDistance: 28,
  radarScanDuration: 1.5,
  radarPointDuration: 0.45,
  radarPolygonDuration: 0.55,
  radarScanTrailDegrees: 48,
  radarScanTrailSegments: 10,
  overallReveal: 0.7,
  overallDelay: 0.2,
  overallGlowStrength: 50,
  rippleCount: 3,
  rippleDuration: 0.9,
  rippleScale: 2.4,
  rippleOpacity: 0.55,
  scanBeamIntensity: 0.7,
  commentScrollDelay: 0.8,
  commentScrollMode: "fitHold",
  commentScrollSpeed: 38,
  portraitOpacity: 0.55,
  theme: "dark",
  uiLanguage: "zh",
  dataLanguage: "zh",
  season: "Street",
  arenaSeason: "S9",
  weightMode: "shared",
  weightEditorMode: "fine",
  sharedDimensionWeightShares: { ...DEFAULT_DIMENSION_WEIGHT_SHARES },
  sharedDimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS },
});

export function frames(seconds, fps) {
  return Math.max(0, Math.round(Number(seconds) * Number(fps)));
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function phaseProgress(frame, start, duration) {
  if (duration <= 0) return frame >= start ? 1 : 0;
  return clamp01((frame - start) / duration);
}

export function getTimeline(settings = DEFAULT_VIDEO_SETTINGS) {
  const value = { ...DEFAULT_VIDEO_SETTINGS, ...settings };
  const fps = value.fps;
  const duration = frames(value.studentDuration, fps);
  const fadeIn = frames(value.fadeIn, fps);
  const fadeOut = frames(value.fadeOut, fps);
  const infoStart = Math.round(fadeIn * 0.35);
  const infoStep = frames(value.infoStagger, fps);
  const infoEnd = infoStart + infoStep * 6 + frames(0.45, fps);
  const radarStart = Math.max(fadeIn, infoEnd);
  const radarDuration = frames(value.radarScanDuration, fps);
  const radarEnd = radarStart + radarDuration;
  const pointDuration = frames(value.radarPointDuration, fps);
  const lastPointStart = radarStart + Math.round(radarDuration * (4 / 5));
  const radarDataEnd = lastPointStart + pointDuration;
  const polygonStart = Math.max(radarEnd, radarDataEnd);
  const polygonDuration = frames(value.radarPolygonDuration, fps);
  const polygonEnd = polygonStart + polygonDuration;
  const overallStart = polygonEnd + frames(value.overallDelay, fps);
  const overallEnd = overallStart + frames(value.overallReveal, fps);
  const fadeOutStart = duration - fadeOut;

  return {
    duration,
    fadeIn,
    fadeOut,
    fadeOutStart,
    infoStart,
    infoStep,
    infoEnd,
    radarStart,
    radarDuration,
    radarEnd,
    pointDuration,
    radarDataEnd,
    polygonStart,
    polygonDuration,
    polygonEnd,
    overallStart,
    overallEnd,
    holdFrames: fadeOutStart - overallEnd,
  };
}

export function validateVideoSettings(settings) {
  const value = { ...DEFAULT_VIDEO_SETTINGS, ...settings };
  const errors = [];
  if (!Number.isFinite(value.width) || value.width < 640) errors.push("Width must be at least 640px.");
  if (!Number.isFinite(value.height) || value.height < 360) errors.push("Height must be at least 360px.");
  if (Number(value.width) * 9 !== Number(value.height) * 16) errors.push("Resolution must use a 16:9 aspect ratio.");
  if (![24, 25, 30, 50, 60].includes(Number(value.fps))) errors.push("FPS must be 24, 25, 30, 50, or 60.");
  if (resolveRenderConcurrency(value.renderConcurrency) === null) errors.push("Render concurrency must be Adaptive, Auto, 100%, 1, 2, 4, 6, 8, 12, or 16.");
  if (!["quality", "balanced", "fast"].includes(value.renderQualityMode)) errors.push("Render quality mode must be Quality, Balanced, or Fast.");
  if (normalizeWeightMode(value.weightMode) !== value.weightMode) errors.push("Weight mode must be Shared or Individual.");
  if (normalizeWeightEditorMode(value.weightEditorMode) !== value.weightEditorMode) errors.push("Weight editor mode must be Fine or Preset.");
  const fineState = normalizeFineWeightState({ dimensionWeightShares: value.sharedDimensionWeightShares });
  if (value.weightEditorMode === WEIGHT_EDITOR_MODES.fine && fineState.unassignedWeightShare > 0) errors.push("Fine weights must be fully assigned before rendering.");
  normalizeDimensionWeights({ dimensionWeights: value.sharedDimensionWeights });
  if (!['mp4', 'png', 'jpeg'].includes(value.format)) errors.push("Output format must be MP4, PNG frames, or JPEG frames.");
  if (value.studentDuration <= 0) errors.push("Student duration must be positive.");
  if (!Number.isFinite(value.radarScanDuration) || value.radarScanDuration <= 0) errors.push("Radar scan duration must be positive.");
  if (!Number.isFinite(value.radarPointDuration) || value.radarPointDuration <= 0) errors.push("Radar point duration must be positive.");
  if (!Number.isFinite(value.radarPolygonDuration) || value.radarPolygonDuration <= 0) errors.push("Radar polygon duration must be positive.");
  const nonNegativeFields = [
    "fadeIn", "fadeOut", "infoStagger", "infoEnterDuration", "infoEnterDistance",
    "overallReveal", "overallDelay", "overallGlowStrength", "rippleDuration", "rippleScale",
    "commentScrollDelay", "commentScrollSpeed",
  ];
  if (nonNegativeFields.some(key => !Number.isFinite(value[key]) || value[key] < 0)) {
    errors.push("Timing and effect values must be finite and non-negative.");
  }
  if (value.rippleCount < 0 || value.rippleCount > 6) errors.push("Ripple count must be between 0 and 6.");
  if (!["fitHold", "fixedSpeed"].includes(value.commentScrollMode)) errors.push("Comment scroll mode must be Fit Hold or Fixed Speed.");
  if (!Number.isInteger(value.radarScanTrailSegments) || value.radarScanTrailSegments < 0 || value.radarScanTrailSegments > 24) errors.push("Radar trail segments must be between 0 and 24.");
  if (!Number.isFinite(value.radarScanTrailDegrees) || value.radarScanTrailDegrees < 0 || value.radarScanTrailDegrees > 180) errors.push("Radar trail length must be between 0 and 180 degrees.");
  if (value.rippleOpacity < 0 || value.rippleOpacity > 1 || value.scanBeamIntensity < 0 || value.scanBeamIntensity > 1 || value.portraitOpacity < 0 || value.portraitOpacity > 1) {
    errors.push("Opacity values must be between 0 and 1.");
  }
  if (!String(value.outputName || "").trim()) errors.push("Output filename is required.");
  if (!String(value.arenaSeason || "").trim()) errors.push("Arena season title is required.");
  const timeline = getTimeline(value);
  if (timeline.holdFrames < 0) errors.push("Animation phases exceed the per-student duration.");
  return errors;
}

export function clampProgress(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function detectLogicalCores(fallback = 8) {
  const cores = globalThis.navigator?.hardwareConcurrency;
  return Number.isFinite(cores) && cores > 0 ? cores : fallback;
}

export function predictRenderConcurrency(logicalCores = detectLogicalCores()) {
  const cores = Number(logicalCores);
  if (!Number.isFinite(cores) || cores <= 0) return 4;
  if (cores <= 4) return 2;
  if (cores <= 8) return 4;
  if (cores <= 14) return 6;
  if (cores <= 24) return 8;
  return 12;
}

export function benchmarkStorageKey(settings, logicalCores = detectLogicalCores()) {
  const width = Number(settings?.width || DEFAULT_VIDEO_SETTINGS.width);
  const height = Number(settings?.height || DEFAULT_VIDEO_SETTINGS.height);
  const fps = Number(settings?.fps || DEFAULT_VIDEO_SETTINGS.fps);
  const format = settings?.format || DEFAULT_VIDEO_SETTINGS.format;
  const theme = settings?.theme || DEFAULT_VIDEO_SETTINGS.theme;
  const uiLanguage = settings?.uiLanguage || DEFAULT_VIDEO_SETTINGS.uiLanguage;
  const dataLanguage = settings?.dataLanguage || DEFAULT_VIDEO_SETTINGS.dataLanguage;
  const cores = Number.isFinite(Number(logicalCores)) && Number(logicalCores) > 0 ? Number(logicalCores) : "unknown";
  return `${cores}c-${width}x${height}-${fps}fps-${format}-${theme}-${uiLanguage}-${dataLanguage}`;
}

export function resolveRenderConcurrency(value = DEFAULT_VIDEO_SETTINGS.renderConcurrency, options = {}) {
  if (value === "adaptive") return predictRenderConcurrency(options.logicalCores);
  if (value === undefined || value === null || value === "" || value === "auto") return undefined;
  if (value === "100%") return value;
  const numeric = Number(value);
  if ([1, 2, 4, 6, 8, 12, 16].includes(numeric)) return numeric;
  return null;
}

export function estimatePreviewFps(frameEvents, elapsedMs) {
  const events = Number(frameEvents);
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(events) || !Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.max(0, events / (elapsed / 1000));
}

export function totalDurationInFrames(studentCount, settings) {
  return Math.max(1, studentCount * getTimeline(settings).duration);
}

export function dimensionScanFrame(timeline, index, count = 5) {
  return timeline.radarStart + Math.round(timeline.radarDuration * (index / count));
}

export function sceneFadeOpacity(frame, timeline) {
  return Math.min(
    phaseProgress(frame, 0, timeline.fadeIn),
    1 - phaseProgress(frame + 1, timeline.fadeOutStart, timeline.fadeOut || 1),
  );
}

export function estimateCommentScroll(notes, language = "zh", options = {}) {
  const text = String(notes || "").trim();
  if (!text) return { lines: 0, distance: 0 };
  const charsPerLine = options.charsPerLine || (language === "en" ? 22 : 14);
  const lineHeight = options.lineHeight || 34;
  const viewportHeight = options.viewportHeight || 116;
  const topGap = Math.max(0, Number(options.topGap) || 0);
  const explicitLines = text.split(/\r?\n/);
  const wrapLine = line => {
    if (!line) return 1;
    if (language === "en") {
      const words = line.trim().split(/\s+/);
      let lines = 1;
      let current = 0;
      for (const word of words) {
        const length = Math.max(1, word.length);
        if (length > charsPerLine) {
          if (current > 0) lines += 1;
          lines += Math.ceil(length / charsPerLine) - 1;
          current = length % charsPerLine;
        } else if (current === 0 || current + 1 + length <= charsPerLine) {
          current += (current === 0 ? 0 : 1) + length;
        } else {
          lines += 1;
          current = length;
        }
      }
      return lines;
    }
    const units = Array.from(line).reduce((sum, character) => {
      return sum + (/[\u0000-\u007f]/.test(character) ? 0.55 : 1);
    }, 0);
    return Math.max(1, Math.ceil(units / charsPerLine));
  };
  const lines = explicitLines.reduce((sum, line) => sum + wrapLine(line), 0);
  return { lines, distance: commentScrollDistanceFromHeights(lines * lineHeight + topGap, viewportHeight, options.threshold ?? 0.1) };
}

export function commentScrollDistanceFromHeights(textHeight, viewportHeight, threshold = 0.1) {
  const distance = Number(textHeight) - Number(viewportHeight);
  if (!Number.isFinite(distance) || distance <= Number(threshold)) return 0;
  return Math.ceil(distance);
}

export function commentScrollFrames(timeline, settings = DEFAULT_VIDEO_SETTINGS, fps = DEFAULT_VIDEO_SETTINGS.fps) {
  const value = { ...DEFAULT_VIDEO_SETTINGS, ...settings };
  const commentEnterEnd = timeline.infoStart + timeline.infoStep * 2 + frames(value.infoEnterDuration, fps);
  const requestedDelay = frames(value.commentScrollDelay, fps);
  const latestUsefulStart = Math.max(commentEnterEnd, timeline.overallStart - frames(0.25, fps));
  const start = Math.min(
    Math.max(commentEnterEnd, commentEnterEnd + Math.round(requestedDelay * 0.35)),
    latestUsefulStart,
  );
  const end = Math.max(start + 1, timeline.fadeOutStart - frames(0.2, fps));
  return { start, end, duration: Math.max(1, end - start) };
}

export function commentScrollOffset({ frame, distance, timeline, settings = DEFAULT_VIDEO_SETTINGS, fps = DEFAULT_VIDEO_SETTINGS.fps }) {
  const safeDistance = Math.max(0, Number(distance) || 0);
  if (safeDistance <= 0) return 0;
  const { start, duration } = commentScrollFrames(timeline, settings, fps);
  if (settings.commentScrollMode === "fixedSpeed") {
    const elapsedSeconds = Math.max(0, frame - start) / fps;
    return Math.min(safeDistance, elapsedSeconds * settings.commentScrollSpeed);
  }
  return safeDistance * phaseProgress(frame, start, duration);
}
