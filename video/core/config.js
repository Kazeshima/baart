export const VIDEO_PROJECT_VERSION = 1;

export const DEFAULT_VIDEO_SETTINGS = Object.freeze({
  width: 1920,
  height: 1080,
  fps: 30,
  format: "mp4",
  outputName: "baart-arena-ratings",
  studentDuration: 12,
  fadeIn: 0.7,
  fadeOut: 0.7,
  infoStagger: 0.14,
  radarScanDuration: 3.2,
  overallReveal: 0.7,
  rippleCount: 3,
  rippleDuration: 0.9,
  rippleScale: 2.4,
  rippleOpacity: 0.55,
  scanBeamIntensity: 0.7,
  commentScrollDelay: 0.8,
  commentScrollSpeed: 38,
  portraitOpacity: 0.55,
  theme: "dark",
  uiLanguage: "zh",
  dataLanguage: "zh",
  season: "Street",
  arenaSeason: "S9",
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
  const overallStart = radarEnd + frames(0.2, fps);
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
  if (!['mp4', 'png'].includes(value.format)) errors.push("Output format must be MP4 or PNG frames.");
  if (value.studentDuration <= 0) errors.push("Student duration must be positive.");
  if (!Number.isFinite(value.radarScanDuration) || value.radarScanDuration <= 0) errors.push("Radar scan duration must be positive.");
  const nonNegativeFields = [
    "fadeIn", "fadeOut", "infoStagger",
    "overallReveal", "rippleDuration", "rippleScale",
    "commentScrollDelay", "commentScrollSpeed",
  ];
  if (nonNegativeFields.some(key => !Number.isFinite(value[key]) || value[key] < 0)) {
    errors.push("Timing and effect values must be finite and non-negative.");
  }
  if (value.rippleCount < 0 || value.rippleCount > 6) errors.push("Ripple count must be between 0 and 6.");
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

export function totalDurationInFrames(studentCount, settings) {
  return Math.max(1, studentCount * getTimeline(settings).duration);
}

export function dimensionRevealProgress(scanProgress, index, count = 5) {
  const threshold = index / count;
  const revealWindow = 0.07;
  return clamp01((scanProgress - threshold) / revealWindow);
}

export function dimensionScanFrame(timeline, index, count = 5) {
  return timeline.radarStart + Math.round(timeline.radarDuration * (index / count));
}

export function estimateCommentScroll(notes, language = "zh", options = {}) {
  const text = String(notes || "").trim();
  if (!text) return { lines: 0, distance: 0 };
  const charsPerLine = options.charsPerLine || (language === "en" ? 42 : 28);
  const lineHeight = options.lineHeight || 34;
  const viewportHeight = options.viewportHeight || 116;
  const explicitLines = text.split(/\r?\n/);
  const lines = explicitLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return { lines, distance: Math.max(0, lines * lineHeight - viewportHeight) };
}
