import { localeFor, t } from "../utils/i18n.js";
import { createRadarRenderModel } from "../utils/radarRenderModel.js";
import { fitStaticExportText } from "../utils/exportText.js";
import { createStudentRatingPresentation } from "../utils/presentationModel.js";
import { outputTheme, scaleFullOutputLayout } from "../utils/outputVisualTokens.js";
import { CARD_DIMENSIONS as CARD } from "./exportPipeline.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    hardMinFont: options.hardMinFont || 8,
    unitFactor: options.unitFactor || (locale === "en" ? 0.88 : 0.98),
    lineHeight: options.lineHeight || 1.16,
  });
  const label = options.label || t(uiLanguage, "comments");
  const clipId = `commentClip-${Math.round(x)}-${Math.round(y)}`;
  return `
  <g>
    <clipPath id="${clipId}"><rect x="${x + paddingX}" y="${y + paddingTop - fit.fontSize}" width="${textWidth}" height="${textHeight + fit.fontSize}"/></clipPath>
    ${accentPanelRect(x, y, width, height, p, { fill: p.card, opacity: options.opacity || p.cardOpacity || "0.76", accent: "pink" })}
    ${options.hideLabel ? "" : `<text x="${x + 16}" y="${labelY}" fill="${p.gold}" font-size="${options.labelSize || 17}" font-weight="900" letter-spacing=".06em">${esc(label)}</text>`}
    <text clip-path="url(#${clipId})" x="${x + paddingX}" y="${textY}" fill="${p.text}" font-size="${fit.fontSize}" font-weight="700">
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
    <text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="800" fill="${p.sub}">${title}${items.map((item, index) => `${index ? `<tspan fill="${p.muted}"> · </tspan>` : ""}<tspan>${esc(item.label)} </tspan><tspan fill="${p.gold}" font-weight="900">${item.weightLabel}</tspan>`).join("")}</text>
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
    <text x="${textX}" y="${y}" fill="${options.fill || p.gold}" font-size="${fontSize}" font-weight="900">${esc(trimText(school, options.maxChars || 20))}</text>
  </g>`;
}

function panelRect(x, y, width, height, p, options = {}) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${options.rx || 8}" fill="${options.fill || p.card}" fill-opacity="${options.opacity || p.cardOpacity || "0.76"}" stroke="${options.stroke || p.stroke}" ${options.strokeWidth ? `stroke-width="${options.strokeWidth}"` : ""}/>`;
}

function accentPanelRect(x, y, width, height, p, options = {}) {
  const rx = options.rx || 8;
  const gradient = options.accent === "pink" ? "edgePink" : "edgeCyan";
  return `${panelRect(x, y, width, height, p, options)}
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="none" stroke="url(#${gradient})" stroke-width="${options.accentWidth || 2.4}"/>`;
}

function overallPanelSvg(presentation, x, y, width, height, p, options = {}) {
  const color = presentation.overall.color || p.muted;
  const label = presentation.overall.label;
  const score = presentation.overall.score !== null && presentation.overall.score !== undefined ? Number(presentation.overall.score).toFixed(1) : "--";
  const titleWidth = options.titleWidth || Math.round(width * 0.24);
  const maxRatingSize = options.ratingSize || (presentation.locale === "en" ? 54 : 72);
  const scoreSize = options.scoreSize || (presentation.locale === "en" ? 50 : 58);
  const titleSize = options.titleSize || 23;
  const ratingClass = presentation.locale === "en" ? "rating-latin" : "rating";
  const baseline = y + height * 0.66;
  const labelUnits = Array.from(label).reduce((sum, character) => sum + (/[　-ヿ㐀-鿿＀-￯]/.test(character) ? 1 : 0.7), 0);
  const scoreWidth = score.length * scoreSize * 0.62;
  const ratingWidth = Math.max(48, width - titleWidth - scoreWidth - (options.contentGap || 24) - 34);
  const ratingSize = Math.max(options.minRatingSize || 20, Math.min(maxRatingSize, ratingWidth / Math.max(1, labelUnits)));
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
  return outputTheme(theme);
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
    <linearGradient id="edgeCyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0" stop-color="${p.pink}"/>
      <stop offset="0.18" stop-color="${p.cyan}"/>
      <stop offset="0.7" stop-color="${p.cyan}" stop-opacity="0.82"/>
      <stop offset="1" stop-color="${p.stroke}" stop-opacity="0.32"/>
    </linearGradient>
    <linearGradient id="edgePink" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0" stop-color="${p.pink}"/>
      <stop offset="0.48" stop-color="${p.pink}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${p.cyan}" stop-opacity="0.42"/>
    </linearGradient>
    <linearGradient id="terrainSpectrum" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0" stop-color="${p.cyan}"/>
      <stop offset="0.34" stop-color="${p.pink}"/>
      <stop offset="0.68" stop-color="${p.gold}"/>
      <stop offset="1" stop-color="${p.cyan}"/>
    </linearGradient>
    <pattern id="academyGrid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="${p.grid}" stroke-width="1"/></pattern>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="${p.shadow}" flood-opacity="0.22"/>
    </filter>
    <filter id="lightIconContrast" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#0f172a" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.42"/>
    </filter>
    <filter id="darkIconContrast" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#ffffff" flood-opacity="0.72"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.3" flood-color="#7dd3fc" flood-opacity="0.32"/>
    </filter>
    <filter id="edgeGlow" x="-30%" y="-40%" width="160%" height="180%">
      <feGaussianBlur stdDeviation="2.4"/>
    </filter>
  </defs>`;
}

function backgroundDecor(width, height, p) {
  const cx = width * 0.56;
  const cy = height * 0.394;
  const radius = height * 0.282;
  return `
  <rect width="${width}" height="${height}" fill="url(#academyGrid)" opacity="0.24"/>
  <g fill="none" stroke="${p.cyan}" opacity="0.13">
    <circle cx="${cx}" cy="${cy}" r="${radius}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${radius + height * 0.031}" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="${radius + height * 0.085}" stroke="${p.pink}" stroke-width="1" opacity="0.72"/>
    <line x1="${cx - radius - 30}" y1="${cy}" x2="${cx + radius + 30}" y2="${cy}"/>
    <line x1="${cx}" y1="${cy - radius - 30}" x2="${cx}" y2="${cy + radius + 30}"/>
  </g>
  <path d="M ${width - 180} 48 H ${width - 40} V 92" fill="none" stroke="${p.cyan}" stroke-width="2" opacity="0.42"/>
  <path d="M 26 ${height - 90} V ${height - 26} H 170" fill="none" stroke="${p.pink}" stroke-width="2" opacity="0.34"/>
  <text x="${width - 40}" y="26" text-anchor="end" fill="${p.cyan}" opacity="0.42" font-family="Share Tech Mono, monospace" font-size="12" letter-spacing="2">SCHALE / ARENA ANALYSIS</text>`;
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
    .section-label { fill: ${p.gold}; font-size: 20px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
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
${backgroundDecor(width, height, p)}
<rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="8" fill="${p.panel}" stroke="${p.stroke}"/>
<g class="ui">
  ${panelRect(42, 42, 514, 154, p, { fill: p.card, opacity: "0.76" })}
  <image href="${icon}" x="60" y="58" width="132" height="132" preserveAspectRatio="xMidYMid slice"/>
  <rect x="60" y="58" width="132" height="132" rx="8" fill="none" stroke="${p.stroke}" stroke-width="2"/>
  <text x="210" y="76" fill="${p.gold}" font-size="18" font-weight="900" letter-spacing=".06em">${esc(options.arenaSeason || "")} · ARENA</text>
  <text x="210" y="112" fill="${p.text}" font-size="${titleSize}" font-weight="900" xml:space="preserve">${esc(displayName)}</text>
  <text x="212" y="142" class="sub mono">${esc(presentation.identity.developerName)} · #${presentation.identity.id}</text>
  ${schoolMetaSvg(presentation, 210, 174, p, { fontSize: 18, iconSize: 36, maxChars: presentation.locale === "en" ? 18 : 13 })}

  ${overallPanelSvg(presentation, 594, 42, 330, 112, p, { titleWidth: 88, ratingSize: presentation.locale === "en" ? 38 : 54, scoreSize: presentation.locale === "en" ? 38 : 44, titleSize: 16, minRatingSize: 20, contentGap: 14 })}
  ${buildRadarSVG(presentation, { x: 594, y: 164, size: radarSize, panelWidth: 330, panelHeight: 330, chartSize: 290, theme: options.theme, labelFontScale: 1.08 })}

  <text x="48" y="226" class="value" font-size="24">${esc(trimText(presentation.role.summary, presentation.locale === "en" ? 34 : 27))}</text>
  <text x="48" y="256" class="value" font-size="21">${esc(trimText(presentation.weapon.summary, presentation.locale === "en" ? 45 : 34))}</text>
  ${typeChips(presentation, 48, 270, p, { width: 142, height: 40, fontSize: 17, iconSize: 24, gap: 10 })}
  ${coverMark(presentation, 352, 270, p, { width: 158, height: 40, fontSize: 17, iconSize: 24 })}
  ${terrainStrip(presentation, 48, 320, p, { compactWidth: 104, upgradeWidth: 174, height: 42, iconSize: 30, rankWidth: 46, rankHeight: 25, gap: 8 })}
  ${noteBlock(presentation.notes, 48, 372, 508, 126, options.uiLanguage, p, { maxFont: 16, minFont: 10, hardMinFont: 7, paddingTop: 38, paddingBottom: 10, labelY: 397, textY: 413, labelSize: 15, opacity: "0.74" })}
  ${weightSummarySvg(presentation, p, width - 44, height - 34, 12, { anchor: "end" })}
  <text x="48" y="${height - 34}" class="watermark">BAART</text>
</g>
</svg>`;
}

function buildFullSVG(student, ratings, options) {
  const { width, height, radar } = CARD.full;
  const p = palette(options.theme);
  const layout = scaleFullOutputLayout(width);
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
${backgroundDecor(width, height, p)}
<g class="ui">
  <image href="${portraitUrl}" x="${layout.portrait.x}" y="${layout.portrait.top}" width="${layout.portrait.width}" height="${height - layout.portrait.top - layout.portrait.bottom}" preserveAspectRatio="xMidYMid meet" opacity="1"/>

  <text x="48" y="52" fill="${p.gold}" font-size="21" font-weight="900" letter-spacing=".07em">${esc(options.arenaSeason || "")} · ARENA GUIDE</text>
  <text x="48" y="110" fill="${p.text}" font-size="${Math.min(titleSize, 54)}" font-weight="900" xml:space="preserve">${esc(displayName)}</text>
  <text x="50" y="148" class="sub mono">${esc(presentation.identity.developerName)} · #${presentation.identity.id}</text>
  ${schoolMetaSvg(presentation, 48, 184, p, { fontSize: 32, iconSize: 56, maxChars: presentation.locale === "en" ? 18 : 12 })}

  <text x="50" y="228" class="value" font-size="30">${esc(trimText(presentation.role.summary, presentation.locale === "en" ? 34 : 28))}</text>
  ${typeChips(presentation, 50, 246, p, { width: 142, height: 44, fontSize: 19, iconSize: 27, gap: 10 })}
  ${coverMark(presentation, 354, 246, p, { width: 158, height: 44, fontSize: 19, iconSize: 27 })}
  <text x="50" y="326" class="value" font-size="25">${esc(trimText(presentation.weapon.summary, presentation.locale === "en" ? 44 : 34))}</text>
  ${terrainStrip(presentation, 50, 340, p, { compactWidth: 112, upgradeWidth: 164, height: 48, iconSize: 34, rankWidth: 52, rankHeight: 28, gap: 9 })}
  ${noteBlock(presentation.notes, layout.comments.x, layout.comments.top, layout.comments.width, layout.comments.height, options.uiLanguage, p, { maxFont: 23, minFont: 11, hardMinFont: 8, paddingTop: 48, paddingBottom: 14, labelY: layout.comments.top + 32, textY: layout.comments.top + 56, labelSize: 20, opacity: "0.82" })}

  ${overallPanelSvg(presentation, layout.right.x, layout.right.overallTop, layout.right.width, layout.right.overallHeight, p, { titleWidth: 125, ratingSize: presentation.locale === "en" ? 54 : 75, scoreSize: presentation.locale === "en" ? 53 : 57, titleSize: 23, minRatingSize: 32, contentGap: 20 })}
  ${buildRadarSVG(presentation, { x: layout.right.x, y: layout.right.radarTop, size: radar, panelWidth: layout.right.width, panelHeight: layout.right.radarHeight, chartSize: 427, theme: options.theme, labelFontScale: 1.18 })}
  ${weightSummarySvg(presentation, p, width - 40, height - 40, 15, { anchor: "end" })}
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
  const labelUnits = Array.from(label).reduce((sum, character) => sum + (/[　-ヿ㐀-鿿＀-￯]/.test(character) ? 1 : 0.58), 0);
  const fittedFont = Math.max(12, Math.min(fontSize, (width - iconSize - 38) / Math.max(1, labelUnits)));
  return `
  <g opacity="${active ? "1" : "0.82"}">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${color}24" stroke="${color}" stroke-width="1.4"/>
    <image href="${icon}" x="${x + 12}" y="${y + (height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" opacity="${p.iconChipOpacity}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + iconSize + 24}" y="${y + height / 2 + fittedFont * 0.35}" fill="${active ? p.text : p.sub}" font-size="${fittedFont}" font-weight="900">${esc(label)}</text>
  </g>`;
}

function typeChips(presentation, x, y, p = palette(), options = {}) {
  const width = options.width || 142;
  const height = options.height || 42;
  const gap = options.gap || 12;
  const iconSize = options.iconSize || 25;
  const fontSize = options.fontSize || 19;
  const chip = (offset, color, icon, label) => {
    const labelUnits = Array.from(label).reduce((sum, character) => sum + (/[　-ヿ㐀-鿿＀-￯]/.test(character) ? 1 : 0.58), 0);
    const available = width - iconSize - 38;
    const fittedFont = Math.max(12, Math.min(fontSize, available / Math.max(1, labelUnits)));
    return `
    <rect x="${x + offset}" y="${y}" width="${width}" height="${height}" rx="6" fill="${color}30" stroke="${color}" stroke-width="1.4"/>
    <image href="${icon}" x="${x + offset + 12}" y="${y + (height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + offset + iconSize + 24}" y="${y + height / 2 + fittedFont * 0.35}" fill="${color}" font-size="${fittedFont}" font-weight="900">${esc(label)}</text>`;
  };
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
    <rect x="${tx}" y="${y}" width="${width}" height="${height}" rx="${active ? 6 : 0}" fill="${p.card}" fill-opacity="0.42" ${active ? `stroke="url(#terrainSpectrum)" stroke-width="2.4"` : ""}/>
    ${active ? "" : `<line x1="${tx}" y1="${y + height}" x2="${tx + width}" y2="${y + height}" stroke="${p.stroke}" stroke-width="1.5"/>`}
    ${active ? `<rect x="${tx - 1}" y="${y - 1}" width="${width + 2}" height="${height + 2}" rx="7" fill="none" stroke="url(#terrainSpectrum)" stroke-width="3" opacity="0.34" filter="url(#edgeGlow)"/>` : ""}
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
  const panelWidth = options.panelWidth || size;
  const panelHeight = options.panelHeight || size;
  const chartSize = options.chartSize || size;
  const chartX = x + (panelWidth - chartSize) / 2;
  const chartY = y + (panelHeight - chartSize) / 2;
  const cx = chartX + chartSize / 2;
  const cy = chartY + chartSize / 2;
  const r = chartSize * 0.255;
  const dimensions = presentation.radar.dimensions;
  const scores = dimensions.map(dimension => dimension.score);
  const fillColor = presentation.radar.fillColor;
  const radarModel = createRadarRenderModel(dimensions, {
    centerX: cx,
    centerY: cy,
    radius: r,
    labelRadius: r + chartSize * 0.118,
  });
  const dataPoints = radarModel.data.map(dimension => dimension.point);
  const polyStr = dataPoints.map(([px, py]) => `${px},${py}`).join(" ");
  const rings = [1, 2, 3, 4, 5].map(lvl => {
    const pts = radarModel.rings[lvl - 1].map(([px, py]) => `${px},${py}`).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const axes = radarModel.axes.map(([px, py]) => {
    return `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const text = radarModel.data.map((dimension) => {
    const [px, py] = dimension.labelPoint;
    const tier = dimension.tier;
    const scoreColor = dimension.tierColor;
    const label = dimension.label;
    const labelSize = chartSize * 0.039 * labelFontScale;
    const scoreSize = chartSize * 0.046 * labelFontScale;
    if (/进攻对策性|特防对策性/.test(label)) {
      return `<text x="${px}" y="${py - chartSize * 0.035}" text-anchor="middle" fill="${p.sub}" font-size="${labelSize * 0.94}" font-weight="900">
        <tspan x="${px}">${esc(label.slice(0, 2))}</tspan>
        <tspan x="${px}" dy="${chartSize * 0.043}">${esc(label.slice(2))}</tspan>
        ${tier ? `<tspan x="${px}" dy="${chartSize * 0.050}" fill="${scoreColor}" font-size="${scoreSize}">${tier}</tspan>` : ""}
      </text>`;
    }
    return `<text x="${px}" y="${py - chartSize * 0.022}" text-anchor="middle" fill="${p.sub}" font-size="${labelSize}" font-weight="900">
      <tspan x="${px}">${esc(label)}</tspan>
      ${tier ? `<tspan x="${px}" dy="${chartSize * 0.052}" fill="${scoreColor}" font-size="${scoreSize}">${tier}</tspan>` : ""}
    </text>`;
  }).join("");

  return `
  <g>
    ${accentPanelRect(x, y, panelWidth, panelHeight, p, { fill: p.radarBg, opacity: p.panelOpacity, accent: "cyan" })}
    ${rings}${axes}
    <polygon points="${polyStr}" fill="${fillColor}35" stroke="${fillColor}" stroke-width="3" stroke-linejoin="round"/>
    ${dataPoints.map(([px, py], i) => scores[i] > 0 ? `<circle cx="${px}" cy="${py}" r="5" fill="${dimensions[i].tierColor}" stroke="#06080f" stroke-width="2"/>` : "").join("")}
    ${text}
  </g>`;
}
