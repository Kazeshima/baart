import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { LANG_URLS } from "../src/utils/constants.js";
import { parseStudents } from "../src/utils/students.js";
import { createVideoProject, mergeRatedStudents } from "./core/manifest.js";
import { createProfileCases, safeProfileName } from "./core/profile.js";
import { benchmarkOutputIo, classifyRenderBottleneck, renderVideoProject } from "./render-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultRatingsPath = path.join(root, "test_data", "ba_pvp_ratings_test.json");
const profileRoot = path.join(root, ".cache", "video-profile");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function boolArg(name) {
  return process.argv.includes(`--${name}`);
}

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}

async function loadStudents(language) {
  const response = await fetch(LANG_URLS[language] || LANG_URLS.zh);
  if (!response.ok) throw new Error(`Failed to load SchaleDB ${language} students: HTTP ${response.status}`);
  return parseStudents(await response.json());
}

function isRenderedImage(name) {
  return /\.(png|jpe?g)$/i.test(name);
}

async function countImageFrames(output) {
  const entries = await fs.readdir(output);
  return entries.filter(isRenderedImage).length;
}

const ratingsPath = path.resolve(argValue("ratings", defaultRatingsPath));
const dataLanguage = argValue("data-language", "zh");
const uiLanguage = argValue("ui-language", dataLanguage === "en" ? "en" : "zh");
const theme = argValue("theme", "dark");
const frameCount = Math.max(1, Number(argValue("frames", "240")));
const caseFilter = argValue("case", "");
const quick = boolArg("quick");
const includeIoBenchmark = !boolArg("no-io-benchmark");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(profileRoot, runId);
await fs.mkdir(runDir, { recursive: true });

const ratings = await readJson(ratingsPath);
const students = await loadStudents(dataLanguage);
const records = mergeRatedStudents(students, ratings);
if (!records.length) throw new Error(`No rated students from ${ratingsPath} matched SchaleDB ${dataLanguage} metadata.`);

const selectedCases = new Set(caseFilter.split(",").map(value => value.trim()).filter(Boolean));
const allCases = createProfileCases();
const quickCaseNames = new Set(["full-adaptive", "full-adaptive-jpeg", "no-portrait-adaptive", "simple-radar-adaptive"]);
const cases = (quick && selectedCases.size === 0 ? allCases.filter(item => quickCaseNames.has(item.name)) : allCases)
  .filter(item => selectedCases.size === 0 || selectedCases.has(item.name));
if (!cases.length) throw new Error(`No profile cases matched "${caseFilter}".`);
const baseSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  format: "png",
  outputName: "baart-profile",
  dataLanguage,
  uiLanguage,
  theme,
  studentDuration: 12,
};
const report = {
  createdAt: new Date().toISOString(),
  ratingsPath,
  dataLanguage,
  uiLanguage,
  theme,
  matchedRecords: records.length,
  frameRange: [0, frameCount - 1],
  io: null,
  cases: [],
};

if (includeIoBenchmark) {
  report.io = await benchmarkOutputIo(path.join(runDir, "io-benchmark"), { frames: frameCount });
  console.log(`IO: ${report.io.filesPerSecond} files/sec, ${report.io.mbPerSecond} MB/sec`);
}

for (const profileCase of cases) {
  const caseDir = path.join(runDir, safeProfileName(profileCase.name));
  await fs.rm(caseDir, { recursive: true, force: true });
  const project = createVideoProject({
    records,
    settings: { ...baseSettings, ...(profileCase.settings || {}), renderConcurrency: profileCase.renderConcurrency },
  });

  let lastMeta = {};
  const started = performance.now();
  await renderVideoProject(project, {
    onProgress: (_progress, meta = {}) => {
      lastMeta = meta;
    },
    onLog: message => {
      if (/Asset cache warning/i.test(message)) console.warn(message);
    },
  }, {
    outputLocation: caseDir,
    frameRange: [0, frameCount - 1],
    profile: profileCase.profile,
    settings: profileCase.settings || {},
    imageFormat: profileCase.imageFormat,
    assetCacheDir: path.join(profileRoot, "render-assets"),
  });
  const elapsedMs = performance.now() - started;
  const renderedFrames = await countImageFrames(caseDir);
  const entries = await fs.readdir(caseDir);
  const totalBytes = (await Promise.all(entries.filter(isRenderedImage).map(async name => (await fs.stat(path.join(caseDir, name))).size))).reduce((sum, size) => sum + size, 0);
  const fps = renderedFrames / Math.max(0.001, elapsedMs / 1000);
  const result = {
    name: profileCase.name,
    renderConcurrency: profileCase.renderConcurrency,
    profile: profileCase.profile,
    imageFormat: profileCase.imageFormat || "png",
    output: caseDir,
    elapsedMs: Math.round(elapsedMs),
    renderedFrames,
    totalBytes,
    fps: Number(fps.toFixed(2)),
    mbPerSecond: Number(((totalBytes / 1048576) / Math.max(0.001, elapsedMs / 1000)).toFixed(2)),
    bottleneck: report.io ? classifyRenderBottleneck(fps, report.io.filesPerSecond) : "unknown",
    lastMeta,
  };
  report.cases.push(result);
  console.log(`${result.name}: ${result.renderedFrames} frames in ${(elapsedMs / 1000).toFixed(1)}s (${result.fps} fps)`);
}

const reportPath = path.join(runDir, "profile-report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Profile report: ${reportPath}`);
