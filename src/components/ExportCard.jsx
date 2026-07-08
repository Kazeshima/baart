import {
  DIMENSIONS,
  TIER_COLORS,
  TIER_SCORES,
  OVERALL_COLORS,
  TYPE_COLORS,
  ADAPT_ICON_URL,
  ATTACK_ICON,
  DEFENSE_ICON,
  COVER_ICON,
  SEASONS,
  DEFAULT_RATINGS,
} from "../utils/constants.js";
import {
  DIMENSION_LABELS,
  OVERALL_LABELS,
  ROLE_LABELS_BY_LOCALE,
  TYPE_LABELS_BY_LOCALE,
  WEAPON_LABELS_BY_LOCALE,
  localeFor,
  schoolLabel,
  t,
  terrainLabel,
} from "../utils/i18n.js";
import { RADAR_ANGLES } from "../utils/radar.js";
import { WEIGHT_EDITOR_MODES, formatWeightShare, recalculateRatings } from "../utils/scoring.js";
import { useRatingStore } from "../store/ratingStore.js";
import { studentDisplayName } from "../utils/studentDisplay.js";
import { schoolIconPath } from "../utils/schoolIcons.js";

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
        const response = await fetch("https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Long+Cang");
        if (!response.ok) throw new Error(`font css HTTP ${response.status}`);
        let css = await response.text();
        const urls = Array.from(new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(match => match[1])));
        for (const url of urls) {
          const fontResponse = await fetch(url);
          if (!fontResponse.ok) throw new Error(`font file HTTP ${fontResponse.status}`);
          const dataUrl = await blobToDataUrl(await fontResponse.blob());
          css = css.split(url).join(dataUrl);
        }
        return css;
      } catch {
        return '@import url("https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Long+Cang");';
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

function labelPack(uiLanguage) {
  const locale = localeFor(uiLanguage);
  return {
    locale,
    dim: DIMENSION_LABELS[locale] || DIMENSION_LABELS.zh,
    type: TYPE_LABELS_BY_LOCALE[locale] || TYPE_LABELS_BY_LOCALE.zh,
    weapon: WEAPON_LABELS_BY_LOCALE[locale] || WEAPON_LABELS_BY_LOCALE.zh,
    role: ROLE_LABELS_BY_LOCALE[locale] || ROLE_LABELS_BY_LOCALE.zh,
  };
}

function wrapText(value, maxChars, maxLines) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const lines = [];
  let current = "";
  for (const token of text.split(" ")) {
    const next = current ? `${current} ${token}` : token;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = token;
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length && text.length > lines.join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.{3}$/, "")}...`;
  }
  return lines;
}

function trimText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function noteBlock(text, x, y, width, height, uiLanguage, p, options = {}) {
  const lines = wrapText(text, options.maxChars || 36, options.maxLines || 2);
  if (!lines.length) return "";
  const fontSize = options.fontSize || 18;
  const lineGap = options.lineGap || fontSize + 4;
  const labelY = options.labelY || y + 22;
  const textY = options.textY || y + 44;
  const label = t(uiLanguage, "notes");
  return `
  <g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="${p.card}" stroke="${p.stroke}"/>
    ${options.hideLabel ? "" : `<text x="${x + 14}" y="${labelY}" class="label">${esc(label)}</text>`}
    <text x="${x + 14}" y="${textY}" fill="${p.text}" font-size="${fontSize}" font-weight="800">
      ${lines.map((line, i) => `<tspan x="${x + 14}" dy="${i === 0 ? 0 : lineGap}">${esc(line)}</tspan>`).join("")}
    </text>
  </g>`;
}

function compactSummary(student, labels, uiLanguage) {
  const squadLabel = student.squadType === "Support" ? labels.role.SupportSquad : labels.role.Main;
  const role = `${squadLabel || student.squadType} / ${labels.role[student.tacticRole] || student.tacticRole}`;
  const weaponLabel = labels.weapon[student.weaponType] || "";
  const weapon = `${student.weaponType}${weaponLabel ? ` ${weaponLabel}` : ""} / ${t(uiLanguage, "range")} ${student.range}`;
  return { role, weapon };
}

function weightSummarySvg(ratings, uiLanguage, p, x, y, fontSize = 14) {
  const labels = DIMENSION_LABELS[localeFor(uiLanguage)] || DIMENSION_LABELS.zh;
  const items = DIMENSIONS.map(({ key }) => ({
    label: labels[key][0],
    value: formatWeightShare(ratings.dimensionWeightShares?.[key]),
  }));
  const groups = [items.slice(0, 2), items.slice(2)];
  const line = (group, lineY) => `<text x="${x}" y="${lineY}" font-size="${fontSize}" font-weight="800" fill="${p.sub}">${group.map((item, index) => `${index ? `<tspan fill="${p.muted}"> · </tspan>` : ""}<tspan>${esc(item.label)} </tspan><tspan fill="#f0b429" font-weight="900">${item.value}</tspan>`).join("")}</text>`;
  return `
  <g>
    <text x="${x}" y="${y}" class="label">${esc(t(uiLanguage, "weightsUsed"))}</text>
    ${line(groups[0], y + 20)}
    ${line(groups[1], y + 40)}
  </g>`;
}

function schoolMetaSvg(student, uiLanguage, x, y, p, options = {}) {
  const school = student.school ? schoolLabel(uiLanguage, student.school) : "";
  if (!school) return "";
  const icon = schoolIconPath(student.school);
  const fontSize = options.fontSize || 18;
  const iconSize = options.iconSize || 22;
  const textX = icon ? x + iconSize + 8 : x;
  return `
  <g>
    ${icon ? `<image href="${icon}" x="${x}" y="${y - iconSize + 4}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>` : ""}
    <text x="${textX}" y="${y}" fill="${options.fill || "#f0b429"}" font-size="${fontSize}" font-weight="900">${esc(trimText(school, options.maxChars || 20))}</text>
  </g>`;
}

function palette(theme = "dark") {
  if (theme === "light") {
    return {
      bg: "#edf3f8",
      panel: "#f8fbff",
      card: "#e7eef6",
      stroke: "#b2c1d1",
      text: "#1b2b3d",
      sub: "#53677e",
      muted: "#71839a",
      radarBg: "#f6f9fd",
      shadow: "#94a9bd",
      iconFilter: "url(#lightIconContrast)",
      iconChipOpacity: "1",
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
  };
}

export function useExport() {
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
      if (format === "png") {
        const { width, height } = CARD[mode];
        const bytes = await svgToPngBytes(await inlineSvgImages(rawSvg), width, height);
        const path = await downloadFile(`${baseName}.png`, bytes, "image/png");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      } else {
        const svg = await inlineSvgImages(rawSvg);
        const path = await downloadFile(`${baseName}.svg`, svg, "image/svg+xml;charset=utf-8");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      }
    } catch (err) {
      alert(`${t(uiLanguage, "exportFailed")}: ${err}`);
    }
  };

  return { exportCard };
}

function studentMetaRows(student, ratings, season, uiLanguage) {
  const labels = labelPack(uiLanguage);
  const squadLabel = student.squadType === "Support" ? labels.role.SupportSquad : labels.role.Main;
  const attackLabel = labels.type[student.bulletType] || student.bulletType;
  const defenseLabel = labels.type[student.armorType] || student.armorType;
  const weaponLabel = labels.weapon[student.weaponType] || "";
  const coverLabel = student.cover ? t(uiLanguage, "coverYes") : t(uiLanguage, "coverNo");
  const activeTerrain = SEASONS.find(s => s.key === season) || SEASONS[0];
  const levelMap = {
    Street: student.streetAdapt,
    Outdoor: student.outdoorAdapt,
    Indoor: student.indoorAdapt,
  };
  const activeLevel = levelMap[activeTerrain.key] ?? 0;
  const ueLevel = {
    Street: student.ueStreetAdapt,
    Outdoor: student.ueOutdoorAdapt,
    Indoor: student.ueIndoorAdapt,
  }[activeTerrain.key];
  const activeTerrainLabel = terrainLabel(uiLanguage, activeTerrain.key);
  const terrainText = ueLevel !== undefined && ueLevel !== activeLevel
    ? `${activeTerrainLabel} / UE50`
    : `${activeTerrainLabel}`;

  return [
    [t(uiLanguage, "role"), `${squadLabel} / ${labels.role[student.tacticRole] || student.tacticRole}`],
    [t(uiLanguage, "type"), `${attackLabel} / ${defenseLabel}`],
    [t(uiLanguage, "weapon"), `${student.weaponType} ${weaponLabel} / ${t(uiLanguage, "range")} ${student.range}`],
    [t(uiLanguage, "cover"), `${coverLabel} / ${t(uiLanguage, "position")} ${student.position}`],
    [t(uiLanguage, "terrain"), terrainText],
  ];
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
    .label { font-size: 17px; fill: ${p.muted}; font-weight: 800; letter-spacing: 0; }
    .value { font-size: 24px; fill: ${p.text}; font-weight: 700; }
    .small { font-size: 17px; fill: ${p.sub}; }
    .watermark { font-size: 14px; fill: ${p.muted}; font-weight: 700; }
  ]]></style>`;
}

function buildCompactSVG(student, ratings, options) {
  const { width, height, avatar, radar } = CARD.compact;
  const p = palette(options.theme);
  const labels = labelPack(options.uiLanguage);
  const ratingClass = labels.locale === "en" ? "rating-latin" : "rating";
  const overall = ratings.overall;
  const overallText = overall !== null ? OVERALL_LABELS[labels.locale][overall] : "?";
  const overallColor = overall !== null ? OVERALL_COLORS[overall] : "#4a6080";
  const scoreText = ratings.overallScore !== null && ratings.overallScore !== undefined ? Number(ratings.overallScore).toFixed(1) : "--";
  const summary = compactSummary(student, labels, options.uiLanguage);
  const icon = `https://schaledb.com/images/student/icon/${student.id}.webp`;
  const displayName = studentDisplayName(student, options.uiLanguage);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${defs(p)}
${commonStyles(p, options.fontCss)}
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="8" fill="${p.panel}" stroke="${p.stroke}"/>
<g class="ui">
  <image href="${icon}" x="48" y="54" width="${avatar}" height="${avatar}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="48" y="54" width="${avatar}" height="${avatar}" rx="8" fill="none" stroke="#2a3f5a" stroke-width="2"/>
  <text x="224" y="80" class="title" xml:space="preserve">${esc(options.arenaSeason || "")} · ${esc(displayName)}</text>
  <text x="226" y="110" class="sub mono">${esc(student.devName)} · #${student.id}</text>
  ${schoolMetaSvg(student, options.uiLanguage, 224, 140, p, { fontSize: 25, iconSize: 31, maxChars: labels.locale === "en" ? 16 : 12 })}
  <text x="224" y="174" class="${ratingClass}" fill="${overallColor}" font-size="${labels.locale === "en" ? 46 : 56}">${esc(overallText)}</text>
  <text x="224" y="204" class="${ratingClass}" fill="${overallColor}" font-size="${labels.locale === "en" ? 18 : 25}">${esc(t(options.uiLanguage, "overallScore"))}: ${scoreText}/5.0</text>
  ${typeChips(student, labels, 224, 214, p)}
  ${coverMark(student, 48, 214, options.uiLanguage, p)}
  ${terrainStrip(student, options.season, 48, 262, p)}
  <text x="48" y="344" class="value">${esc(trimText(summary.role, 30))}</text>
  <text x="48" y="376" class="value">${esc(trimText(summary.weapon, 38))}</text>
  ${noteBlock(ratings.notes, 48, 398, 510, 86, options.uiLanguage, p, { maxChars: 42, maxLines: 3, fontSize: 18, lineGap: 21, hideLabel: true, textY: 424 })}
  ${buildRadarSVG(ratings, { x: 594, y: 92, size: radar, uiLanguage: options.uiLanguage, theme: options.theme })}
  ${weightSummarySvg(ratings, options.uiLanguage, p, 604, 442, 13)}
  <text x="${width - 44}" y="${height - 34}" text-anchor="end" class="watermark">BAART</text>
</g>
</svg>`;
}

function buildFullSVG(student, ratings, options) {
  const { width, height, portrait, radar } = CARD.full;
  const p = palette(options.theme);
  const labels = labelPack(options.uiLanguage);
  const ratingClass = labels.locale === "en" ? "rating-latin" : "rating";
  const overall = ratings.overall;
  const overallText = overall !== null ? OVERALL_LABELS[labels.locale][overall] : "?";
  const overallColor = overall !== null ? OVERALL_COLORS[overall] : "#4a6080";
  const scoreText = ratings.overallScore !== null && ratings.overallScore !== undefined ? Number(ratings.overallScore).toFixed(1) : "--";
  const rows = studentMetaRows(student, ratings, options.season, options.uiLanguage);
  const portraitUrl = `https://schaledb.com/images/student/portrait/${student.id}.webp`;
  const displayName = studentDisplayName(student, options.uiLanguage);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${defs(p)}
${commonStyles(p, options.fontCss)}
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<g class="ui">
  <rect x="26" y="26" width="${portrait}" height="${height - 52}" rx="8" fill="${p.panel}" stroke="${p.stroke}"/>
  <image href="${portraitUrl}" x="-36" y="28" width="430" height="${height - 56}" preserveAspectRatio="xMidYMid meet" opacity="0.55"/>
  <rect x="26" y="26" width="${portrait}" height="${height - 52}" rx="8" fill="none" stroke="${p.stroke}"/>
  <rect x="28" y="${height - 160}" width="${portrait - 4}" height="132" fill="#06080fcc"/>
  <text x="50" y="${height - 108}" class="title" xml:space="preserve">${esc(displayName)}</text>
  <text x="52" y="${height - 74}" class="sub mono">${esc(student.devName)} · #${student.id}</text>
  <text x="376" y="78" class="title">${esc(options.arenaSeason || "")} Arena PvP Card</text>
  <text x="376" y="112" class="sub mono">${esc(student.devName)} · #${student.id}</text>
  ${schoolMetaSvg(student, options.uiLanguage, 376, 136, p, { fontSize: 25, iconSize: 31, maxChars: labels.locale === "en" ? 18 : 14 })}
  <rect x="842" y="42" width="398" height="168" rx="8" fill="${p.radarBg}" stroke="${overallColor}" stroke-width="2"/>
  <text x="866" y="76" class="label">${esc(t(options.uiLanguage, "overall"))}</text>
  <text x="866" y="158" class="${ratingClass}" fill="${overallColor}" font-size="${labels.locale === "en" ? 58 : 76}">${esc(overallText)}</text>
  <text x="872" y="190" class="${ratingClass}" fill="${overallColor}" font-size="${labels.locale === "en" ? 22 : 30}">${esc(t(options.uiLanguage, "overallScore"))}: ${scoreText}/5.0</text>
  ${typeChips(student, labels, 376, 146, p)}
  ${coverMark(student, 376, 196, options.uiLanguage, p)}
  ${terrainStrip(student, options.season, 376, 240, p)}
  ${rows.map(([k, v], i) => `
    <text x="376" y="${342 + i * 34}" class="label">${esc(k)}</text>
    <text x="502" y="${342 + i * 34}" class="value" font-size="23">${esc(trimText(v, labels.locale === "en" ? 24 : 28))}</text>`).join("")}
  ${weightSummarySvg(ratings, options.uiLanguage, p, 376, 506, 14)}
  ${noteBlock(ratings.notes, 376, 560, 410, 100, options.uiLanguage, p, { maxChars: 34, maxLines: 3, fontSize: 20, lineGap: 23 })}
  ${buildRadarSVG(ratings, { x: 806, y: 238, size: radar, uiLanguage: options.uiLanguage, theme: options.theme })}
  <text x="${width - 40}" y="${height - 34}" text-anchor="end" class="watermark">BAART</text>
</g>
</svg>`;
}

function coverMark(student, x, y, uiLanguage, p = palette()) {
  const active = Boolean(student.cover);
  return `
  <g opacity="${active ? "1" : "0.45"}">
    <rect x="${x}" y="${y}" width="160" height="34" rx="6" fill="${p.card}" stroke="${p.stroke}"/>
    <image href="${COVER_ICON}" x="${x + 10}" y="${y + 8}" width="18" height="18" opacity="${p.iconChipOpacity}" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + 38}" y="${y + 23}" fill="${active ? p.text : p.sub}" font-size="16" font-weight="800">${esc(active ? t(uiLanguage, "coverYes") : t(uiLanguage, "coverNo"))}</text>
  </g>`;
}

function typeChips(student, labels, x, y, p = palette()) {
  const attackColor = TYPE_COLORS[student.bulletType] || "#8da4be";
  const defenseColor = TYPE_COLORS[student.armorType] || "#8da4be";
  const attackLabel = labels.type[student.bulletType] || student.bulletType;
  const defenseLabel = labels.type[student.armorType] || student.armorType;
  return `
  <g>
    <rect x="${x}" y="${y}" width="138" height="34" rx="6" fill="${attackColor}22" stroke="${attackColor}"/>
    <image href="${ATTACK_ICON}" x="${x + 10}" y="${y + 8}" width="18" height="18" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + 36}" y="${y + 23}" fill="${attackColor}" font-size="17" font-weight="800">${esc(attackLabel)}</text>
    <rect x="${x + 150}" y="${y}" width="138" height="34" rx="6" fill="${defenseColor}22" stroke="${defenseColor}"/>
    <image href="${DEFENSE_ICON}" x="${x + 160}" y="${y + 8}" width="18" height="18" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <text x="${x + 186}" y="${y + 23}" fill="${defenseColor}" font-size="17" font-weight="800">${esc(defenseLabel)}</text>
  </g>`;
}

function terrainStrip(student, activeSeason, x, y, p = palette()) {
  const terrainMap = {
    Street: student.streetAdapt,
    Outdoor: student.outdoorAdapt,
    Indoor: student.indoorAdapt,
  };
  const ueMap = {
    Street: student.ueStreetAdapt,
    Outdoor: student.ueOutdoorAdapt,
    Indoor: student.ueIndoorAdapt,
  };
  let cursor = x;
  const cells = SEASONS.map((s) => {
    const tx = cursor;
    const level = terrainMap[s.key] ?? 0;
    const ue = ueMap[s.key];
    const active = s.key === activeSeason;
    const hasUpgrade = ue !== undefined && ue !== level;
    const width = hasUpgrade ? 126 : 88;
    cursor += width + 10;
    return `
    <rect x="${tx}" y="${y}" width="${width}" height="44" rx="6" fill="${active ? (p.bg === "#06080f" ? "#1a1404" : "#fff7dc") : p.card}" stroke="${active ? "#f0b429" : p.stroke}"/>
    <image href="${s.icon}" x="${tx + 9}" y="${y + 8}" width="28" height="28" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    <image href="${ADAPT_ICON_URL(level)}" x="${tx + 43}" y="${y + 12}" height="20" width="40" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>
    ${hasUpgrade ? `<text x="${tx + 82}" y="${y + 27}" text-anchor="middle" fill="${active ? "#f0b429" : p.sub}" font-size="14" font-weight="900">→</text><image href="${ADAPT_ICON_URL(ue)}" x="${tx + 88}" y="${y + 12}" height="20" width="40" ${p.iconFilter ? `filter="${p.iconFilter}"` : ""}/>` : ""}`;
  }).join("");
  return `<g>${cells}</g>`;
}

function buildRadarSVG(ratings, options) {
  const { x, y, size, uiLanguage } = options;
  const p = palette(options.theme);
  const labels = DIMENSION_LABELS[localeFor(uiLanguage)] || DIMENSION_LABELS.zh;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.255;
  const angles = RADAR_ANGLES;
  const polar = (angle, radius) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const scores = DIMENSIONS.map(d => ratings[d.key] !== null ? TIER_SCORES[ratings[d.key]] : 0);
  const fillColor = ratings.overall !== null && ratings.overall !== undefined
    ? OVERALL_COLORS[ratings.overall]
    : "#4a6080";
  const dataPoints = DIMENSIONS.map((d, i) => polar(angles[i], r * (scores[i] / 5)));
  const polyStr = dataPoints.map(([px, py]) => `${px},${py}`).join(" ");
  const rings = [1, 2, 3, 4, 5].map(lvl => {
    const pts = angles.map(a => polar(a, r * lvl / 5)).map(([px, py]) => `${px},${py}`).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const axes = angles.map(a => {
    const [px, py] = polar(a, r);
    return `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${p.stroke}" stroke-width="1"/>`;
  }).join("");
  const text = DIMENSIONS.map((d, i) => {
    const [px, py] = polar(angles[i], r + size * 0.118);
    const tier = ratings[d.key];
    const color = tier ? TIER_COLORS[tier] : p.sub;
    const label = labels[d.key][0];
    if (/进攻对策性|特防对策性/.test(label)) {
      return `<text x="${px}" y="${py - size * 0.022}" text-anchor="middle" fill="${color}" font-size="${size * 0.036}" font-weight="900">
        <tspan x="${px}">${esc(label.slice(0, 2))}</tspan>
        <tspan x="${px}" dy="${size * 0.041}">${esc(label.slice(2))}${tier ? ` ${tier}` : ""}</tspan>
      </text>`;
    }
    return `<text x="${px}" y="${py}" text-anchor="middle" fill="${color}" font-size="${size * 0.039}" font-weight="900">${esc(label)}${tier ? ` ${tier}` : ""}</text>`;
  }).join("");

  return `
  <g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${p.radarBg}" stroke="${p.stroke}"/>
    ${rings}${axes}
    <polygon points="${polyStr}" fill="${fillColor}35" stroke="${fillColor}" stroke-width="3" stroke-linejoin="round"/>
    ${dataPoints.map(([px, py], i) => scores[i] > 0 ? `<circle cx="${px}" cy="${py}" r="5" fill="${TIER_COLORS[ratings[DIMENSIONS[i].key]]}" stroke="#06080f" stroke-width="2"/>` : "").join("")}
    ${text}
  </g>`;
}
