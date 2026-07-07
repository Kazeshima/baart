import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { LANG_URLS } from "../src/utils/constants.js";
import { parseStudents } from "../src/utils/students.js";
import { createVideoProject, mergeRatedStudents } from "./core/manifest.js";
import { createProfileCases, safeProfileName } from "./core/profile.js";
import { renderVideoProject } from "./render-service.mjs";

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
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function loadStudents(language) {
  const response = await fetch(LANG_URLS[language] || LANG_URLS.zh);
  if (!response.ok) throw new Error(`Failed to load SchaleDB ${language} students: HTTP ${response.status}`);
  return parseStudents(await response.json());
}

async function countPngFrames(output) {
  const entries = await fs.readdir(output);
  return entries.filter(name => name.endsWith(".png")).length;
}

const ratingsPath = path.resolve(argValue("ratings", defaultRatingsPath));
const dataLanguage = argValue("data-language", "zh");
const frameCount = Math.max(1, Number(argValue("frames", "240")));
const caseFilter = argValue("case", "");
const quick = boolArg("quick");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(profileRoot, runId);
await fs.mkdir(runDir, { recursive: true });

const ratings = await readJson(ratingsPath);
const students = await loadStudents(dataLanguage);
const records = mergeRatedStudents(students, ratings);
if (!records.length) throw new Error(`No rated students from ${ratingsPath} matched SchaleDB ${dataLanguage} metadata.`);

const selectedCases = new Set(caseFilter.split(",").map(value => value.trim()).filter(Boolean));
const cases = (quick ? createProfileCases().filter(item => ["full-auto", "no-portrait-auto", "simple-radar-auto"].includes(item.name)) : createProfileCases())
  .filter(item => selectedCases.size === 0 || selectedCases.has(item.name));
if (!cases.length) throw new Error(`No profile cases matched "${caseFilter}".`);
const baseSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  format: "png",
  outputName: "baart-profile",
  dataLanguage,
  uiLanguage: dataLanguage === "en" ? "en" : "zh",
  studentDuration: 12,
};
const report = {
  createdAt: new Date().toISOString(),
  ratingsPath,
  dataLanguage,
  matchedRecords: records.length,
  frameRange: [0, frameCount - 1],
  cases: [],
};

for (const profileCase of cases) {
  const caseDir = path.join(runDir, safeProfileName(profileCase.name));
  await fs.rm(caseDir, { recursive: true, force: true });
  const project = createVideoProject({
    records,
    settings: { ...baseSettings, renderConcurrency: profileCase.renderConcurrency },
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
    assetCacheDir: path.join(profileRoot, "render-assets"),
  });
  const elapsedMs = performance.now() - started;
  const renderedFrames = await countPngFrames(caseDir);
  const fps = renderedFrames / Math.max(0.001, elapsedMs / 1000);
  const result = {
    name: profileCase.name,
    renderConcurrency: profileCase.renderConcurrency,
    profile: profileCase.profile,
    output: caseDir,
    elapsedMs: Math.round(elapsedMs),
    renderedFrames,
    fps: Number(fps.toFixed(2)),
    lastMeta,
  };
  report.cases.push(result);
  console.log(`${result.name}: ${result.renderedFrames} frames in ${(elapsedMs / 1000).toFixed(1)}s (${result.fps} fps)`);
}

const reportPath = path.join(runDir, "profile-report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Profile report: ${reportPath}`);
