import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { LANG_URLS } from "../src/utils/constants.js";
import { parseStudents } from "../src/utils/students.js";
import { recalculateRatings, WEIGHT_EDITOR_MODES } from "../src/utils/scoring.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const comparisonMode = process.argv.includes("--compare");
const outputDir = comparisonMode
  ? path.join(root, ".tmp", "static-comparison")
  : path.join(root, "docs", "assets", "examples");
const hoshinoId = 10005;
const yukariSwimsuitId = 10121;
const fallbackRatingData = {
  [hoshinoId]: {
    blindshot: "S",
    counter: "S",
    defense: "S",
    counterDef: "S",
    cost: "S",
    overall: 4,
    overallScore: 5,
    overallAuto: true,
    costWeight: "half",
    notes: "Reliable frontline control creates a useful counterattack window, although terrain and enemy damage type still matter.",
  },
};
const README_COMMENTS = Object.freeze({
  en: "Hoshino anchors the front line and creates a reliable counterattack window, but terrain and enemy damage type still matter.",
  zh: "星野能够稳住前排并创造反击窗口，但地形和对手的伤害类型仍会影响实战表现。",
});
const COMPARISON_COMMENTS = Object.freeze({
  en: "Kadenokouji Yukari (Swimsuit) is a matchup-sensitive Arena option whose value changes with terrain, cover, opening skill order, enemy damage type, and whether the team survives the first burst cycle. This deliberately long comment verifies that the static card wraps every line inside its panel without scrolling, fading, clipping, or colliding with the Comments heading.",
  zh: "勘解由小路  紫草（泳装）在竞技场里更像是针对环境的精密工具，而不是可以无脑放进任何队伍的角色。地形适性、掩体站位、开局技能牌序、对手伤害类型以及队伍能否撑过第一轮爆发都会改变她的实际价值。这段刻意加长的中英混排评价用于验证静态卡片能够完整换行，并且不会滚动、渐隐、裁切或与“评价”标题重叠。Arena PvP layout stress test.",
});
const comparisonRating = Object.freeze({
  blindshot: "S",
  counter: "A",
  defense: "B",
  counterDef: "C",
  cost: "D",
  overall: 3,
  overallScore: 3.4,
  overallAuto: false,
  dimensionWeights: {
    blindshot: "full",
    counter: "full",
    defense: "full",
    counterDef: "full",
    cost: "half",
  },
  costWeight: "half",
});
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

async function fetchJson(url) {
  const response = await fetchWithRetries(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.json();
}

async function loadRatingData() {
  try {
    return JSON.parse(await fs.readFile(path.join(root, "test_data", "ba_pvp_ratings_jiugu.json"), "utf8"));
  } catch {
    return fallbackRatingData;
  }
}

async function fetchWithRetries(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

async function loadStudent(language, studentId) {
  const data = await fetchJson(LANG_URLS[language]);
  const students = parseStudents(data);
  const student = students.find(item => Number(item.id) === studentId);
  if (!student) throw new Error(`Student ${studentId} not found in ${language} data.`);
  return student;
}

function normalizeRatings(raw) {
  return recalculateRatings(raw, {
    weightMode: "individual",
    weightEditorMode: raw.dimensionWeightShares ? WEIGHT_EDITOR_MODES.fine : WEIGHT_EDITOR_MODES.preset,
  });
}

async function dataUrlFromHref(href) {
  if (href.startsWith("/assets/")) {
    const file = path.join(root, "public", href.replace(/^\/+/, ""));
    const bytes = await fs.readFile(file);
    const extension = path.extname(file).toLowerCase();
    const contentType = extension === ".png" ? "image/png" : "application/octet-stream";
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  }
  const response = await fetchWithRetries(href);
  if (!response.ok) throw new Error(`Failed to fetch ${href}: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function inlineSvgImages(svg) {
  const hrefs = Array.from(new Set([...svg.matchAll(/href="((?:https:\/\/|\/assets\/)[^"]+)"/g)].map(match => match[1])));
  let result = svg;
  for (const href of hrefs) {
    result = result.split(href).join(await dataUrlFromHref(href));
  }
  return result;
}

async function exportFontCss() {
  try {
    let css = await fs.readFile(path.join(root, "public", "assets", "fonts", "fonts.css"), "utf8");
    const references = Array.from(new Set([...css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(match => match[1])));
    for (const reference of references) {
      const localHref = `/assets/fonts/${path.basename(reference)}`;
      css = css.split(reference).join(await dataUrlFromHref(localHref));
    }
    return css;
  } catch {
    return "";
  }
}

if (comparisonMode) await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const vite = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { disabled: true },
});

try {
  const { buildExportSVG } = await vite.ssrLoadModule("/src/components/ExportCard.jsx");
  const fontCss = await exportFontCss();
  const ratingData = await loadRatingData();
  const serveUrl = await bundle({
    entryPoint: path.join(root, "scripts", "card-example-entry.jsx"),
    enableCaching: false,
  });
  const cases = comparisonMode
    ? ["zh", "en"].flatMap(language => ["light", "dark"].flatMap(theme => ["compact", "full"].flatMap(mode => [2, 4].map(overallLevel => ({
        language,
        dataLanguage: language,
        theme,
        mode,
        overallLevel,
        studentId: yukariSwimsuitId,
        output: `${language}-${theme}-${mode}-overall-${overallLevel}.png`,
      })))))
    : [
        { language: "en", dataLanguage: "en", theme: "light", mode: "compact", studentId: hoshinoId, output: "hoshino-card-en.png" },
        { language: "zh", dataLanguage: "zh", theme: "dark", mode: "compact", studentId: hoshinoId, output: "hoshino-card-zh.png" },
      ];

  for (const { language, dataLanguage, theme, mode, overallLevel, studentId, output } of cases) {
    const loadedStudent = await loadStudent(dataLanguage, studentId);
    const student = comparisonMode ? { ...loadedStudent, bulletType: "Explosion" } : loadedStudent;
    const sourceRating = comparisonMode
      ? { ...comparisonRating, overall: overallLevel, overallScore: overallLevel === 4 ? 5 : 2.6, notes: COMPARISON_COMMENTS[language] }
      : { ...(ratingData[String(studentId)] || fallbackRatingData[studentId]), notes: README_COMMENTS[language] };
    const ratings = normalizeRatings(sourceRating);
    const svg = await inlineSvgImages(buildExportSVG(student, ratings, {
      season: "Street",
      arenaSeason: "S9",
      uiLanguage: language,
      theme,
      mode,
      fontCss,
    }));
    const width = mode === "full" ? 1280 : 960;
    const height = mode === "full" ? 720 : 540;
    const inputProps = { svg, width, height };
    const composition = await selectComposition({ serveUrl, id: "CardExample", inputProps, chromeMode: "chrome-for-testing" });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      output: path.join(outputDir, output),
      imageFormat: "png",
      chromeMode: "chrome-for-testing",
      logLevel: "error",
    });
  }
} finally {
  await vite.close();
}

console.log(`Generated ${comparisonMode ? "static comparison renders" : "README examples"} in ${path.relative(root, outputDir)}.`);
