import { useState } from "react";
import { DEFAULT_RATINGS } from "../utils/constants.js";
import { localeFor, t } from "../utils/i18n.js";
import { RADAR_ANGLES } from "../utils/radar.js";
import { WEIGHT_EDITOR_MODES, recalculateRatings } from "../utils/scoring.js";
import { useRatingStore } from "../store/ratingStore.js";
import { fitStaticExportText } from "../utils/exportText.js";
import { createStudentRatingPresentation } from "../utils/presentationModel.js";

const CARD = {
  compact: { width: 960, height: 540, avatar: 148, radar: 330 },
  full: { width: 1280, height: 720, portrait: 310, radar: 420 },
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filenamePart(value) {
  return String(value || "student").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function normalizeExportRatings(raw) {
  const ratings = { ...DEFAULT_RATINGS(), ...raw };
  if (typeof ratings.overall === "string") {
    ratings.overall = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 }[ratings.overall] ?? null;
  }
  return recalculateRatings(ratings, {
    weightMode: "individual",
    weightEditorMode: ratings.weightEditorMode || WEIGHT_EDITOR_MODES.preset,
  });
}

function hasIncompleteExportWeights(ratings) {
  return ratings?.weightEditorMode === WEIGHT_EDITOR_MODES.fine && Number(ratings.unassignedWeightShare || 0) > 0;
}

async function svgToPngBytes(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("SVG could not be rendered as PNG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function inlineSvgImages(svg) {
  const urls = Array.from(new Set([...svg.matchAll(/href="((?:https:\/\/|\/assets\/)[^"]+)"/g)].map(match => match[1])));
  let inlined = svg;
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to fetch image ${url}: HTTP ${response.status}`);
    const dataUrl = await blobToDataUrl(await response.blob());
    inlined = inlined.split(url).join(dataUrl);
  }
  return inlined;
}

let exportFontCssPromise = null;

async function exportFontCss() {
  if (!exportFontCssPromise) {
    exportFontCssPromise = (async () => {
      try {
        const cssUrl = "/assets/fonts/fonts.css";
        const response = await fetch(cssUrl);
        if (!response.ok) throw new Error(`font css HTTP ${response.status}`);
        let css = await response.text();
        const references = Array.from(new Set([...css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(match => match[1])));
        for (const reference of references) {
          const fontUrl = new URL(reference, new URL(cssUrl, window.location.href)).href;
          const fontResponse = await fetch(fontUrl);
          if (!fontResponse.ok) throw new Error(`font file HTTP ${fontResponse.status}`);
          const dataUrl = await blobToDataUrl(await fontResponse.blob());
          css = css.split(reference).join(dataUrl);
        }
        return css;
      } catch {
        return "";
      }
    })();
  }
  return exportFontCssPromise;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ]);
    chunks.push(local, name, data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name);
    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  ]);
  return new Uint8Array([...chunks, ...central, end].flatMap(chunk => Array.from(chunk)));
}

function trimText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function noteBlock(text, x, y, width, height, uiLanguage, p, options = {}) {
  const locale = localeFor(uiLanguage);
  const paddingX = options.paddingX ?? 18;
  const paddingTop = options.paddingTop ?? 44;
  const paddingBottom = options.paddingBottom ?? 16;
  const labelY = options.labelY || y + 28;
  const textY = options.textY || y + paddingTop;
  const textWidth = width - paddingX * 2;
  const textHeight = height - paddingTop - paddingBottom;
  const fit = fitStaticExportText(text, {
    width: textWidth,
    height: textHeight,
    maxFont: options.maxFont || 25,
    minFont: options.minFont || 13,
    unitFactor: options.unitFactor || (locale === "en" ? 0.88 : 0.98),
    lineHeight: options.lineHeight || 1.16,
  });
  const label = options.label || t(uiLanguage, "comments");
  return `
  <g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${p.card}" fill-opacity="${options.opacity || p.cardOpacity || "0.76"}" stroke="${p.stroke}"/>
    ${options.hideLabel ? "" : `<text x="${x + 14}" y="${labelY}" class="label">${esc(label)}</text>`}
    <text x="${x + paddingX}" y="${textY}" fill="${p.text}" font-size="${fit.fontSize}" font-weight="700">
      ${fit.lines.map((line, i) => `<tspan x="${x + paddingX}" dy="${i === 0 ? 0 : fit.lineGap}">${esc(line)}</tspan>`).join("")}
    </text>
  </g>`;
}

function weightSummarySvg(presentation, p, x, y, fontSize = 14, options = {}) {
  const items = presentation.weights.dimensions;
  const anchor = options.anchor || "start";
  const title = options.hideLabel ? "" : `<tspan fill="${p.muted}" font-weight="900">${esc(presentation.weights.label)}</tspan><tspan fill="${p.muted}"> · </tspan>`;
  return `
  <g>
    <text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="800" fill="${p.sub}">${title}${items.map((item, index) => `${index ? `<tspan fill="${p.muted}"> · </tspan>` : ""}<tspan>${esc(item.label)} </tspan><tspan fill="#f0b429" font-weight="900">${item.weightLabel}</tspan>`).join("")}</text>
  </g>`;
}

function schoolMetaSvg(presentation, x, y, p, options = {}) {
  const school = presentation.identity.schoolLabel;
  const icon = presentation.identity.schoolIcon;
  const fontSize = options.fontSize || 18;
  const iconSize = options.iconSize || 22;
  const textX = icon ? x + iconSize + 8 : x;
  const iconY = y - fontSize * 0.35 - iconSize / 2;
  return `
  <g>
    ${icon ? `<image href="${icon}" x="${x}" y="${iconY}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>` : ""}
    <text x="${textX}" y="${y}" fill="${options.fill || "#f0b429"}" font-size="${fontSize}" font-weight="900">${esc(trimText(school, options.maxChars || 20))}</text>
  </g>`;
}

function panelRect(x, y, width, height, p, options = {}) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${options.rx || 8}" fill="${options.fill || p.card}" fill-opacity="${options.opacity || p.cardOpacity || "0.76"}" stroke="${options.stroke || p.stroke}" ${options.strokeWidth ? `stroke-width="${options.strokeWidth}"` : ""}/>`;
}

function overallPanelSvg(presentation, x, y, width, height, p, options = {}) {
  const color = presentation.overall.color || p.muted;
  const label = presentation.overall.label;
  const score = presentation.overall.score !== null && presentation.overall.score !== undefined ? Number(presentation.overall.score).toFixed(1) : "--";
  const titleWidth = options.titleWidth || Math.round(width * 0.24);
  const ratingSize = options.ratingSize || (presentation.locale === "en" ? 54 : 72);
  const scoreSize = options.scoreSize || (presentation.locale === "en" ? 50 : 58);
  const titleSize = options.titleSize || 23;
  const ratingClass = presentation.locale === "en" ? "rating-latin" : "rating";
  const baseline = y + height * 0.66;
  return `
  <g class="export-overall">
    ${panelRect(x, y, width, height, p, { fill: p.panel, opacity: options.opacity || "0.58", stroke: color, strokeWidth: 2 })}
    <text x="${x + 24}" y="${y + height / 2 - 4}" class="label" fill="${p.muted}" font-size="${titleSize}" font-weight="900">${esc(presentation.labels.overall)}</text>
    <text x="${x + titleWidth}" y="${baseline}" class="${ratingClass}" fill="${color}" font-size="${ratingSize}" font-weight="400">${esc(label)}</text>
    <text x="${x + width - 28}" y="${baseline}" text-anchor="end" class="${ratingClass}" fill="${color}" font-size="${scoreSize}" font-weight="400">${esc(score)}</text>
  </g>`;
}

function exportTitleFontSize(displayName, max = 68, min = 38) {
  const weightedLength = Array.from(displayName).reduce((sum, character) => sum + (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character) ? 1.9 : 1), 0);
  if (weightedLength > 21) return Math.max(min, max - 26);
  if (weightedLength > 18) return Math.max(min, max - 18);
  if (weightedLength > 15) return Math.max(min, max - 10);
  return max;
}

function palette(theme = "dark") {
  if (theme === "light") {
    return {
      bg: "#e4edf5",
      panel: "#f8fbff",
      card: "#e7eef6",
      stroke: "#b9c8d8",
      text: "#1b2b3d",
      sub: "#53677e",
      muted: "#71839a",
      radarBg: "#f6f9fd",
      shadow: "#94a9bd",
      iconFilter: "url(#lightIconContrast)",
      iconChipOpacity: "1",
      cardOpacity: "0.78",
      portraitShade: "#e4edf5",
    };
  }
  return {
    bg: "#06080f",
    panel: "#0d1120",
    card: "#111827",
    stroke: "#1e2d42",
    text: "#e8f0fe",
    sub: "#8da4be",
    muted: "#4a6080",
    radarBg: "#0b1020",
    shadow: "#000000",
    iconFilter: "",
    iconChipOpacity: "0.9",
    cardOpacity: "0.76",
    portraitShade: "#06080f",
  };
}

export function useExport() {
  const [exportPreview, setExportPreview] = useState(null);
  const {
    selectedStudent,
    students,
    allRatings,
    getEffectiveAllRatings,
    getCurrentRatings,
    season,
    arenaSeason,
    uiLanguage,
    theme,
    downloadFile,
  } = useRatingStore();

  const closeExportPreview = () => setExportPreview(null);

  const saveExportPreview = async () => {
    if (!exportPreview) return;
    try {
      if (exportPreview.format === "png") {
        const bytes = await svgToPngBytes(exportPreview.svg, exportPreview.width, exportPreview.height);
        const path = await downloadFile(exportPreview.filename, bytes, "image/png");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      } else {
        const path = await downloadFile(exportPreview.filename, exportPreview.svg, "image/svg+xml;charset=utf-8");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      }
      setExportPreview(null);
    } catch (err) {
      alert(`${t(uiLanguage, "exportFailed")}: ${err?.message || err}`);
    }
  };

  const exportCard = async (mode = "compact", format = "svg") => {
    const effectiveAllRatings = getEffectiveAllRatings();
    if (mode === "batch") {
      try {
        const rated = students.filter(s => allRatings[s.id]);
        const incomplete = rated.find(student => hasIncompleteExportWeights(effectiveAllRatings[student.id]));
        if (incomplete) {
          alert(t(uiLanguage, "incompleteWeights"));
          return;
        }
        const files = [];
        const encoder = new TextEncoder();
        const pngFailures = [];
        const fontCss = await exportFontCss();
        for (const student of rated) {
          const ratings = normalizeExportRatings(effectiveAllRatings[student.id]);
          const compactSvg = await inlineSvgImages(buildExportSVG(student, ratings, { season, arenaSeason, uiLanguage, theme, mode: "compact", fontCss }));
          const fullSvg = await inlineSvgImages(buildExportSVG(student, ratings, { season, arenaSeason, uiLanguage, theme, mode: "full", fontCss }));
          const base = `${filenamePart(student.id)}_${filenamePart(student.devName || student.name)}`;
          files.push({ name: `compact_card_svg/${base}_compact.svg`, data: encoder.encode(compactSvg) });
          files.push({ name: `full_card_svg/${base}_full.svg`, data: encoder.encode(fullSvg) });
          try {
            files.push({ name: `compact_png/${base}_compact.png`, data: await svgToPngBytes(compactSvg, CARD.compact.width, CARD.compact.height) });
          } catch (err) {
            pngFailures.push(`${base}_compact: ${err?.message || err}`);
          }
          try {
            files.push({ name: `full_png/${base}_full.png`, data: await svgToPngBytes(fullSvg, CARD.full.width, CARD.full.height) });
          } catch (err) {
            pngFailures.push(`${base}_full: ${err?.message || err}`);
          }
        }
        if (pngFailures.length) {
          throw new Error(`PNG export failed for ${pngFailures.length} card(s): ${pngFailures.slice(0, 3).join("; ")}`);
        }
        const zip = makeZip(files);
        const path = await downloadFile(`ba_pvp_cards_${filenamePart(arenaSeason)}.zip`, zip, "application/zip");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      } catch (err) {
        alert(`${t(uiLanguage, "exportFailed")}: ${err?.message || err}`);
      }
      return;
    }

    if (!selectedStudent) return;
    const ratings = getCurrentRatings();
    if (hasIncompleteExportWeights(ratings)) {
      alert(t(uiLanguage, "incompleteWeights"));
      return;
    }
    const fontCss = await exportFontCss();
    const rawSvg = buildExportSVG(selectedStudent, ratings, { season, arenaSeason, uiLanguage, theme, mode, fontCss });
    const suffix = mode === "full" ? "full" : "compact";
    const baseName = `${filenamePart(selectedStudent.id)}_${filenamePart(selectedStudent.devName || selectedStudent.name)}_${suffix}`;
    try {
      const { width, height } = CARD[mode];
      const svg = await inlineSvgImages(rawSvg);
      setExportPreview({
        svg,
        width,
        height,
        mode,
        format,
        filename: `${baseName}.${format}`,
      });
    } catch (err) {
      alert(`${t(uiLanguage, "exportFailed")}: ${err}`);
    }
  };

  return { exportCard, exportPreview, saveExportPreview, closeExportPreview };
}

export function ExportPreviewModal({ preview, onSave, onClose }) {
  const { uiLanguage } = useRatingStore();
  if (!preview) return null;
  const saveLabel = preview.format === "png" ? t(uiLanguage, "savePng") : t(uiLanguage, "saveSvg");
  return (
    <div className="export-preview-overlay" role="dialog" aria-modal="true" aria-label={t(uiLanguage, "exportPreview")}>
      <div className="export-preview-panel">
        <div className="export-preview-header">
          <div>
            <h2>{t(uiLanguage, "exportPreview")}</h2>
            <p>{preview.filename}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t(uiLanguage, "close")}</button>
        </div>
        <div className="export-preview-canvas" style={{ aspectRatio: `${preview.width} / ${preview.height}` }} dangerouslySetInnerHTML={{ __html: preview.svg }} />
        <div className="export-preview-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t(uiLanguage, "cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function buildExportSVG(student, ratings, options) {
  return options.mode === "full"
    ? buildFullSVG(student, ratings, options)
    : buildCompactSVG(student, ratings, options);
}

function defs(p) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.panel}"/>
      <stop offset="0.52" stop-color="${p.card}"/>
      <stop offset="1" stop-color="${p.bg}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#172033"/>
      <stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="portraitShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${p.bg}" stop-opacity="0.98"/>
      <stop offset="0.30" stop-color="${p.bg}" stop-opacity="0.86"/>
      <stop offset="0.53" stop-color="${p.bg}" stop-opacity="0.46"/>
      <stop offset="0.74" stop-color="${p.bg}" stop-opacity="0.82"/>
      <stop offset="1" stop-color="${p.bg}" stop-opacity="0.98"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="${p.shadow}" flood-opacity="0.22"/>
    </filter>
    <filter id="lightIconContrast" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#0f172a" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.42"/>
    </filter>
  </defs>`;
}

function commonStyles(p, fontCss = "") {
  return `
  <style><![CDATA[
    ${fontCss}
    .ui { font-family: Rajdhani, "Noto Sans SC", "Microsoft YaHei", sans-serif; }
    .mono { font-family: "Share Tech Mono", Consolas, monospace; }
    .rating { font-family: "Long Cang", "Noto Sans SC", "Microsoft YaHei", cursive; font-weight: 400; letter-spacing: 0; }
    .rating-latin { font-family: "Black Ops One", "Segoe UI Black", "Arial Rounded MT Bold", sans-serif; font-weight: 400; letter-spacing: 0; }
    .title { font-size: 34px; font-weight: 800; fill: ${p.text}; letter-spacing: 0; }
    .sub { font-size: 18px; fill: ${p.sub}; }
    .label { font-size: 17px; fill: ${p.muted}; font-weight: 900; letter-spacing: 0; }
    .section-label { fill: #f0b429; font-size: 20px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .value { font-size: 24px; fill: ${p.text}; font-weight: 700; }
    .small { font-size: 17px; fill: ${p.sub}; }
    .watermark { font-size: 14px; fill: ${p.muted}; font-weight: 700; }
  ]]></style>`;
}

function buildCompactSVG(student, ratings, options) {
  const { width, height, avatar, radar } = CARD.compact;
  const radarSize = Math.min(radar, 318);
  const p = palette(options.theme);
  const presentation = createStudentRatingPresentation({ student, ratings, language: options.uiLanguage, activeSeason: options.season });
  const icon = presentation.identity.avatarUrl;
  const displayName = presentation.identity.displayName;
  const titleSize = Math.min(32, exportTitleFontSize(displayName, 34, 18));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${defs(p)}
${commonStyles(p, options.fontCss)}
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="8" fill="${p.panel}" stroke="${p.stroke}"/>
<g class="ui">
  ${panelRect(42, 42, 514, 158, p, { fill: p.card, opacity: "0.72" })}
  <image href="${icon}" x="60" y="58" width="${avatar}" height="${avatar}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="60" y="58" width="${avatar}" height="${avatar}" rx="8" fill="none" stroke="${p.stroke}" stroke-width="2"/>
  <text x="226" y="78" fill="#f0b429" font-size="19" font-weight="900" letter-spacing=".06em">${esc(options.arenaSeason || "")} · ARENA</text>
  <text x="226" y="114" fill="${p.text}" font-size="${titleSize}" font-weight="900" xml:space="preserve">${esc(displayName)}</text>
  <text x="228" y="144" class="sub mono">${esc(presentation.identity.developerName)} · #${presentation.identity.id}</text>
  ${schoolMetaSvg(presentation, 226, 176, p, { fontSize: 22, iconSize: 42, maxChars: presentation.locale === "en" ? 15 : 11 })}

  ${overallPanelSvg(presentation, 594, 42, 330, 112, p, { titleWidth: 98, ratingSize: presentation.locale === "en" ? 42 : 58, scoreSize: presentation.locale === "en" ? 42 : 48, titleSize: 18 })}
  ${buildRadarSVG(presentation, { x: 600, y: 164, size: radarSize, theme: options.theme, labelFontScale: 1.08 })}

  <text x="48" y="244" class="value" font-size="25">${esc(trimText(presentation.role.summary, presentation.locale === "en" ? 32 : 26))}</text>
  <text x="48" y="276" class="value" font-size="22">${esc(trimText(presentation.weapon.summary, presentation.locale === "en" ? 42 : 32))}</text>
  ${typeChips(presentation, 48, 298, p, { width: 132, height: 42, fontSize: 18, iconSize: 25, labelMax: presentation.locale === "en" ? 8 : 5 })}
  ${coverMark(presentation, 336, 298, p, { width: 146, height: 42, fontSize: 18, iconSize: 25 })}
  ${terrainStrip(presentation, 48, 352, p, { compactWidth: 104, upgradeWidth: 174, height: 50, iconSize: 32, rankWidth: 48, rankHeight: 27, gap: 8 })}
  ${noteBlock(presentation.notes, 48, 416, 508, 82, options.uiLanguage, p, { maxFont: 19, minFont: 11, paddingTop: 18, paddingBottom: 10, hideLabel: true, opacity: "0.68" })}
  ${weightSummarySvg(presentation, p, width - 44, height - 34, 12, { anchor: "end" })}
  <text x="48" y="${height - 34}" class="watermark">BAART</text>
</g>
</svg>`;
}

function buildFullSVG(student, ratings, options) {
  const { width, height, radar } = CARD.full;
  const p = palette(options.theme);
  const presentation = createStudentRatingPresentation({ student, ratings, language: options.uiLanguage, activeSeason: options.season });
  const portraitUrl = presentation.identity.portraitUrl;
  const displayName = presentation.identity.displayName;
  const titleSize = presentation.locale === "en"
    ? exportTitleFontSize(displayName, 58, 30)
    : exportTitleFontSize(displayName, 66, 38);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${defs(p)}
${commonStyles(p, options.fontCss)}
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<g class="ui">
  <image href="${portraitUrl}" x="320" y="28" width="640" height="${height - 56}" preserveAspectRatio="xMidYMid meet" opacity="0.38"/>
  <rect width="${width}" height="${height}" fill="${p.portraitShade}" opacity="0.18"/>
  <rect width="${width}" height="${height}" fill="url(#portraitShade)"/>

  <text x="48" y="58" fill="#f0b429" font-size="23" font-weight="900" letter-spacing=".07em">${esc(options.arenaSeason || "")} · ARENA GUIDE</text>
  <text x="48" y="122" fill="${p.text}" font-size="${titleSize}" font-weight="900" xml:space="preserve">${esc(displayName)}</text>
  <text x="50" y="160" class="sub mono">${esc(presentation.identity.developerName)} · #${presentation.identity.id}</text>
  ${schoolMetaSvg(presentation, 48, 202, p, { fontSize: 34, iconSize: 58, maxChars: presentation.locale === "en" ? 18 : 12 })}

  ${panelRect(48, 228, 514, 148, p, { fill: p.card, opacity: "0.70" })}
  <text x="66" y="265" class="value" font-size="30">${esc(trimText(presentation.role.summary, presentation.locale === "en" ? 34 : 28))}</text>
  <text x="66" y="304" class="value" font-size="25">${esc(trimText(presentation.weapon.summary, presentation.locale === "en" ? 44 : 34))}</text>
  ${typeChips(presentation, 66, 324, p, { width: 142, height: 42, fontSize: 19, iconSize: 26, labelMax: presentation.locale === "en" ? 8 : 5 })}
  ${coverMark(presentation, 370, 324, p, { width: 154, height: 42, fontSize: 19, iconSize: 26 })}
  ${terrainStrip(presentation, 48, 394, p, { compactWidth: 124, upgradeWidth: 170, height: 58, iconSize: 38, rankWidth: 58, rankHeight: 31, gap: 10 })}
  ${noteBlock(presentation.notes, 48, 470, 522, 178, options.uiLanguage, p, { maxFont: 26, minFont: 12, paddingTop: 48, paddingBottom: 16, labelY: 502, opacity: "0.70" })}

  ${overallPanelSvg(presentation, 600, 42, 620, 138, p, { titleWidth: 150, ratingSize: presentation.locale === "en" ? 62 : 86, scoreSize: presentation.locale === "en" ? 62 : 68, titleSize: 25 })}
  ${buildRadarSVG(presentation, { x: 700, y: 206, size: radar, theme: options.theme, labelFontScale: 1.18 })}
  ${weightSummarySvg(presentation, p, width - 40, height - 34, 15, { anchor: "end" })}
  <text x="48" y="${height - 34}" class="watermark">BAART</text>
</g>
</svg>`;
}

function coverMark(presentation, x, y, p = palette(), options = {}) {
  const { active, icon, label } = presentation.facts.cover;
  const width = options.width || 150;
  const height = options.height || 42;
  const iconSize = options.iconSize || 25;
  const fontSize = options.fontSize || 20;
  const color = active ? "#38bdf8" : p.muted;
  return `
  <g opacity="${active ? "1" : "0.82"}">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${color}24" stroke="${color}" stroke-width="1.4"/>
    <image href="${icon}" x="${x + 12}" y="${y + (height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" opacity="${p.iconChipOpacity}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + iconSize + 24}" y="${y + height / 2 + fontSize * 0.35}" fill="${active ? p.text : p.sub}" font-size="${fontSize}" font-weight="900">${esc(label)}</text>
  </g>`;
}

function typeChips(presentation, x, y, p = palette(), options = {}) {
  const width = options.width || 142;
  const height = options.height || 42;
  const gap = options.gap || 12;
  const iconSize = options.iconSize || 25;
  const fontSize = options.fontSize || 19;
  const labelMax = options.labelMax || 5;
  const chip = (offset, color, icon, label) => `
    <rect x="${x + offset}" y="${y}" width="${width}" height="${height}" rx="6" fill="${color}30" stroke="${color}" stroke-width="1.4"/>
    <image href="${icon}" x="${x + offset + 12}" y="${y + (height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + offset + iconSize + 24}" y="${y + height / 2 + fontSize * 0.35}" fill="${color}" font-size="${fontSize}" font-weight="900">${esc(trimText(label, labelMax))}</text>`;
  return `
  <g>
    ${chip(0, presentation.facts.attack.color, presentation.facts.attack.icon, presentation.facts.attack.label)}
    ${chip(width + gap, presentation.facts.defense.color, presentation.facts.defense.icon, presentation.facts.defense.label)}
  </g>`;
}

function terrainStrip(presentation, x, y, p = palette(), options = {}) {
  let cursor = x;
  const height = options.height || 52;
  const iconSize = options.iconSize || 34;
  const rankWidth = options.rankWidth || 54;
  const rankHeight = options.rankHeight || 29;
  const compactWidth = options.compactWidth || 108;
  const upgradeWidth = options.upgradeWidth || 154;
  const gap = options.gap || 10;
  const cells = presentation.terrains.map((terrain) => {
    const tx = cursor;
    const active = terrain.active;
    const hasUpgrade = terrain.hasUpgrade;
    const width = hasUpgrade ? upgradeWidth : compactWidth;
    const terrainX = tx + 10;
    const rank1X = hasUpgrade ? tx + iconSize + 16 : tx + width - rankWidth - 8;
    const rank2X = tx + width - rankWidth - 8;
    const arrowX = rank1X + (rank2X - rank1X) / 2 + rankWidth / 2;
    cursor += width + gap;
    return `
    <rect x="${tx}" y="${y}" width="${width}" height="${height}" rx="6" fill="${active ? (p.bg === "#06080f" ? "#1a1404" : "#fff7dc") : p.card}" fill-opacity="${active ? "0.92" : p.cardOpacity}" stroke="${active ? "#f0b429" : p.stroke}"/>
    <image href="${terrain.icon}" x="${terrainX}" y="${y + (height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <image href="${terrain.rankIcon}" x="${rank1X}" y="${y + (height - rankHeight) / 2}" height="${rankHeight}" width="${rankWidth}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    ${hasUpgrade ? `<text x="${arrowX}" y="${y + height / 2 + 6}" text-anchor="middle" fill="${active ? "#f0b429" : p.sub}" font-size="17" font-weight="900">→</text><image href="${terrain.upgradedRankIcon}" x="${rank2X}" y="${y + (height - rankHeight) / 2}" height="${rankHeight}" width="${rankWidth}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>` : ""}`;
  }).join("");
  return `<g>${cells}</g>`;
}

function buildRadarSVG(presentation, options) {
  const { x, y, size } = options;
  const p = palette(options.theme);
  const labelFontScale = options.labelFontScale || 1;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.255;
  const angles = RADAR_ANGLES;
  const polar = (angle, radius) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const dimensions = presentation.radar.dimensions;
  const scores = dimensions.map(dimension => dimension.score);
  const fillColor = presentation.radar.fillColor;
  const dataPoints = dimensions.map((dimension, i) => polar(angles[i], r * (dimension.score / 5)));
  const polyStr = dataPoints.map(([px, py]) => `${px},${py}`).join(" ");
  const rings = [1, 2, 3, 4, 5].map(lvl => {
    const pts = angles.map(a => polar(a, r * lvl / 5)).map(([px, py]) => `${px},${py}`).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const axes = angles.map(a => {
    const [px, py] = polar(a, r);
    return `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const text = dimensions.map((dimension, i) => {
    const [px, py] = polar(angles[i], r + size * 0.118);
    const tier = dimension.tier;
    const scoreColor = dimension.tierColor;
    const label = dimension.label;
    const labelSize = size * 0.039 * labelFontScale;
    const scoreSize = size * 0.046 * labelFontScale;
    if (/进攻对策性|特防对策性/.test(label)) {
      return `<text x="${px}" y="${py - size * 0.035}" text-anchor="middle" fill="${p.sub}" font-size="${labelSize * 0.94}" font-weight="900">
        <tspan x="${px}">${esc(label.slice(0, 2))}</tspan>
        <tspan x="${px}" dy="${size * 0.043}">${esc(label.slice(2))}</tspan>
        ${tier ? `<tspan x="${px}" dy="${size * 0.050}" fill="${scoreColor}" font-size="${scoreSize}">${tier}</tspan>` : ""}
      </text>`;
    }
    return `<text x="${px}" y="${py - size * 0.022}" text-anchor="middle" fill="${p.sub}" font-size="${labelSize}" font-weight="900">
      <tspan x="${px}">${esc(label)}</tspan>
      ${tier ? `<tspan x="${px}" dy="${size * 0.052}" fill="${scoreColor}" font-size="${scoreSize}">${tier}</tspan>` : ""}
    </text>`;
  }).join("");

  return `
  <g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${p.radarBg}" stroke="${p.stroke}"/>
    ${rings}${axes}
    <polygon points="${polyStr}" fill="${fillColor}35" stroke="${fillColor}" stroke-width="3" stroke-linejoin="round"/>
    ${dataPoints.map(([px, py], i) => scores[i] > 0 ? `<circle cx="${px}" cy="${py}" r="5" fill="${dimensions[i].tierColor}" stroke="#06080f" stroke-width="2"/>` : "").join("")}
    ${text}
  </g>`;
}
