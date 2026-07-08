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
const outputDir = path.join(root, "docs", "assets", "examples");
const hoshinoId = 10005;
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
    notes: "",
  },
};
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

async function loadStudent(language) {
  const data = await fetchJson(LANG_URLS[language]);
  const students = parseStudents(data);
  const student = students.find(item => Number(item.id) === hoshinoId);
  if (!student) throw new Error(`Student ${hoshinoId} not found in ${language} data.`);
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
    const response = await fetchWithRetries("https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Long+Cang");
    if (!response.ok) return "";
    let css = await response.text();
    const urls = Array.from(new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(match => match[1])));
    for (const url of urls) {
      css = css.split(url).join(await dataUrlFromHref(url));
    }
    return css;
  } catch {
    return "";
  }
}

await fs.mkdir(outputDir, { recursive: true });

const vite = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { buildExportSVG } = await vite.ssrLoadModule("/src/components/ExportCard.jsx");
  const fontCss = await exportFontCss();
  const ratingData = await loadRatingData();
  const serveUrl = await bundle({
    entryPoint: path.join(root, "scripts", "card-example-entry.jsx"),
    enableCaching: false,
  });
  const baseRatings = normalizeRatings(ratingData[String(hoshinoId)]);
  for (const { language, dataLanguage, output } of [
    { language: "en", dataLanguage: "en", output: "hoshino-card-en.png" },
    { language: "zh", dataLanguage: "zh", output: "hoshino-card-zh.png" },
  ]) {
    const student = await loadStudent(dataLanguage);
    const svg = await inlineSvgImages(buildExportSVG(student, baseRatings, {
      season: "Street",
      arenaSeason: "S9",
      uiLanguage: language,
      theme: language === "en" ? "light" : "dark",
      mode: "compact",
      fontCss,
    }));
    const inputProps = { svg };
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

console.log(`Generated README examples in ${path.relative(root, outputDir)}.`);
