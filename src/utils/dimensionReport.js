import { DIMENSIONS, OVERALL_COLORS, TIER_COLORS, TIER_SCORES } from "./constants.js";
import { DIMENSION_LABELS, OVERALL_LABELS, localeFor, schoolLabel, t } from "./i18n.js";
import { studentDisplayName } from "./studentDisplay.js";
import { schoolIconPath } from "./schoolIcons.js";

export const REPORT_DIRECTIONS = Object.freeze(["desc", "asc"]);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dimensionReportRows({ students, ratingsById, dimension, direction = "desc", language = "zh" }) {
  const dimensionKey = DIMENSIONS.some(item => item.key === dimension) ? dimension : DIMENSIONS[0].key;
  const sign = direction === "asc" ? 1 : -1;
  return (students || [])
    .flatMap(student => {
      const ratings = ratingsById?.[student.id];
      const tier = ratings?.[dimensionKey];
      if (!Object.hasOwn(TIER_SCORES, tier)) return [];
      return [{
        student,
        ratings,
        tier,
        score: TIER_SCORES[tier],
        name: studentDisplayName(student, language),
      }];
    })
    .sort((a, b) => (a.score - b.score) * sign || Number(a.student.id) - Number(b.student.id))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildDimensionReportSvg({ rows, dimension, direction = "desc", language = "zh", arenaSeason = "S?", theme = "dark" }) {
  const locale = localeFor(language);
  const labels = DIMENSION_LABELS[locale] || DIMENSION_LABELS.zh;
  const dimensionLabel = labels[dimension]?.[0] || dimension;
  const width = 960;
  const rowHeight = 66;
  const visibleRows = Math.max(1, rows.length);
  const height = Math.min(1920, 160 + visibleRows * rowHeight);
  const palette = theme === "light"
    ? { bg: "#edf3f8", panel: "#f8fbff", text: "#1b2b3d", sub: "#53677e", border: "#b9c8d8", iconFilter: "url(#lightIconContrast)" }
    : { bg: "#06080f", panel: "#0d1120", text: "#e8f0fe", sub: "#8da4be", border: "#1e2d42", iconFilter: "" };
  const title = `${arenaSeason} · ${dimensionLabel} · ${direction === "asc" ? t(language, "bottomToTop") : t(language, "topToBottom")}`;
  const renderedRows = rows.slice(0, Math.floor((height - 150) / rowHeight)).map((row, index) => {
    const y = 122 + index * rowHeight;
    const overall = row.ratings.overall;
    const overallColor = overall !== null && overall !== undefined ? OVERALL_COLORS[overall] : palette.sub;
    const overallText = overall !== null && overall !== undefined ? OVERALL_LABELS[locale][overall] : "--";
    const scoreText = row.ratings.overallScore !== null && row.ratings.overallScore !== undefined
      ? Number(row.ratings.overallScore).toFixed(1)
      : "--";
    const icon = `https://schaledb.com/images/student/icon/${row.student.id}.webp`;
    const schoolIcon = schoolIconPath(row.student.school);
    const school = schoolLabel(language, row.student.school);
    return `
      <g transform="translate(32 ${y})">
        <rect x="0" y="0" width="896" height="54" rx="8" fill="${palette.panel}" stroke="${palette.border}"/>
        <text x="18" y="34" fill="${palette.sub}" font-size="20" font-weight="900" font-family="Rajdhani, Arial">#${row.rank}</text>
        <image href="${icon}" x="66" y="7" width="40" height="40" preserveAspectRatio="xMidYMid slice"/>
        <rect x="66" y="7" width="40" height="40" rx="5" fill="none" stroke="${palette.border}"/>
        <text x="122" y="25" fill="${palette.text}" font-size="21" font-weight="800" font-family="Rajdhani, Microsoft YaHei, sans-serif" xml:space="preserve">${esc(row.name)}</text>
        <text x="122" y="43" fill="${palette.sub}" font-size="13" font-weight="700" font-family="Rajdhani, Arial">#${row.student.id}</text>
        ${schoolIcon ? `<image href="${schoolIcon}" x="184" y="24" width="22" height="22" preserveAspectRatio="xMidYMid meet" ${palette.iconFilter ? `filter="${palette.iconFilter}"` : ""}/>` : ""}
        <text x="${schoolIcon ? 212 : 184}" y="43" fill="${palette.sub}" font-size="13" font-weight="800" font-family="Rajdhani, Microsoft YaHei, sans-serif">${esc(school)}</text>
        <rect x="630" y="10" width="54" height="34" rx="5" fill="${TIER_COLORS[row.tier]}22" stroke="${TIER_COLORS[row.tier]}"/>
        <text x="657" y="34" text-anchor="middle" fill="${TIER_COLORS[row.tier]}" font-size="26" font-weight="900" font-family="Rajdhani, Arial">${row.tier}</text>
        <text x="720" y="24" fill="${palette.sub}" font-size="13" font-weight="800" font-family="Rajdhani, Arial">${esc(t(language, "overallScore"))}</text>
        <text x="720" y="43" fill="${overallColor}" font-size="18" font-weight="900" font-family="Rajdhani, Arial">${esc(overallText)} ${scoreText}</text>
      </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="lightIconContrast" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#0f172a" flood-opacity="0.85"/>
        <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.42"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="${palette.bg}"/>
    <text x="32" y="54" fill="${palette.text}" font-size="30" font-weight="900" font-family="Rajdhani, Microsoft YaHei, sans-serif">${esc(t(language, "dimensionRankReport"))}</text>
    <text x="32" y="88" fill="${palette.sub}" font-size="18" font-weight="800" font-family="Rajdhani, Microsoft YaHei, sans-serif">${esc(title)}</text>
    <text x="928" y="88" text-anchor="end" fill="${palette.sub}" font-size="14" font-weight="700" font-family="Rajdhani, Arial">${rows.length} ${esc(t(language, "students"))}</text>
    ${renderedRows}
  </svg>`;
}
