import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VIDEO_SETTINGS,
  clampProgress,
  dimensionScanFrame,
  estimatePreviewFps,
  estimateCommentScroll,
  getTimeline,
  resolveRenderConcurrency,
  totalDurationInFrames,
  validateVideoSettings,
} from "../video/core/config.js";
import { createVideoProject, parseVideoProject, ratingsFromProjectRecords } from "../video/core/manifest.js";
import { sortRatingRecords } from "../video/core/sorting.js";
import { applyJobProgress, browserDownloadPercent, cancelJob, isActiveRenderStatus } from "../video/core/renderJob.js";
import { readPngDimensions } from "../video/core/png.js";
import { timestampRating } from "../src/utils/ratingTimestamps.js";
import { schoolLabel } from "../src/utils/i18n.js";
import { parseStudents } from "../src/utils/students.js";
import { radarScanPoint, radarScanTrail } from "../src/utils/radar.js";
import { studentDisplayName } from "../src/utils/studentDisplay.js";
import { runWorker } from "../video/sidecar/worker.mjs";
import { collectRenderAssetUrls, renderAssetCacheKey, studentPortraitUrl } from "../video/core/renderAssets.js";
import { createProfileCases, safeProfileName } from "../video/core/profile.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/video-project.json", import.meta.url), "utf8"));
const records = fixture.records;
const ids = values => values.map(record => record.student.id);

test("timeline assigns every student the same frame count", () => {
  const timeline = getTimeline(DEFAULT_VIDEO_SETTINGS);
  assert.equal(timeline.duration, 360);
  assert.equal(timeline.radarDuration, 45);
  assert.equal(timeline.pointDuration, 14);
  assert.equal(timeline.polygonDuration, 17);
  assert.ok(timeline.polygonStart >= timeline.radarEnd);
  assert.ok(timeline.polygonStart >= timeline.radarDataEnd);
  assert.equal(totalDurationInFrames(3, DEFAULT_VIDEO_SETTINGS), timeline.duration * 3);
  assert.ok(timeline.overallEnd <= timeline.fadeOutStart);
});

test("timing validation rejects phases longer than a student slot", () => {
  const errors = validateVideoSettings({ ...DEFAULT_VIDEO_SETTINGS, studentDuration: 2 });
  assert.ok(errors.some(error => error.includes("exceed")));
});

test("render concurrency defaults to the measured worker count and validates supported choices", () => {
  assert.equal(DEFAULT_VIDEO_SETTINGS.renderConcurrency, "8");
  assert.equal(resolveRenderConcurrency(), 8);
  assert.equal(resolveRenderConcurrency("auto"), undefined);
  assert.equal(resolveRenderConcurrency("50%"), "50%");
  assert.equal(resolveRenderConcurrency("4"), 4);
  assert.equal(resolveRenderConcurrency(8), 8);
  assert.equal(resolveRenderConcurrency("3"), null);
  assert.ok(validateVideoSettings({ ...DEFAULT_VIDEO_SETTINGS, renderConcurrency: "3" }).some(error => error.includes("concurrency")));
});

test("video profiling cases cover scene blocks and concurrency choices", () => {
  const cases = createProfileCases();
  assert.ok(cases.some(item => item.name === "no-portrait-auto" && item.profile.disablePortrait));
  assert.ok(cases.some(item => item.name === "simple-radar-auto" && item.profile.simplifyRadar));
  assert.ok(cases.some(item => item.name === "full-75" && item.renderConcurrency === "75%"));
  assert.equal(safeProfileName("75%"), "75");
});

test("chronological mode preserves legacy insertion order before timestamps", () => {
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "chronological", direction: "asc" })), [10001, 10002, 10003]);
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "chronological", direction: "desc" })), [10003, 10002, 10001]);
});

test("ID and school sorting are deterministic", () => {
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "id", direction: "asc" })), [10001, 10002, 10003]);
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "school", direction: "asc" })), [10001, 10003, 10002]);
});

test("overall score sorting supports both directions and keeps missing scores last", () => {
  const scored = parseVideoProject(fixture).records;
  assert.deepEqual(ids(sortRatingRecords(scored, { mode: "score", direction: "desc" })), [10003, 10001, 10002]);
  assert.deepEqual(ids(sortRatingRecords(scored, { mode: "score", direction: "asc" })), [10002, 10001, 10003]);
  const missing = { ...scored[0], student: { ...scored[0].student, id: 10999 }, ratings: { ...scored[0].ratings, overallScore: null } };
  assert.equal(sortRatingRecords([...scored, missing], { mode: "score", direction: "desc" }).at(-1).student.id, 10999);
});

test("manual order appends unlisted students by ID", () => {
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "manual", manualIds: [10003, 10001] })), [10003, 10001, 10002]);
});

test("video project manifests validate and retain reproducible records", () => {
  const parsed = parseVideoProject(fixture);
  const created = createVideoProject(parsed);
  assert.equal(created.version, 1);
  assert.equal(created.records.length, 3);
  assert.throws(() => parseVideoProject({ ...fixture, version: 2 }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, format: "gif" } }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, width: 1000, height: 1000 } }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, rippleOpacity: 2 } }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, radarPointDuration: 0 } }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, radarPolygonDuration: 0 } }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, uiLanguage: "jp" } }));
});

test("legacy manifests receive defaults and imported snapshots retain ratings", () => {
  const partial = parseVideoProject({
    ...fixture,
    settings: { width: 1280, height: 720, fps: 30, format: "png", outputName: "legacy" },
  });
  assert.equal(partial.settings.theme, DEFAULT_VIDEO_SETTINGS.theme);
  assert.equal(partial.settings.renderConcurrency, "8");
  const ratings = ratingsFromProjectRecords(partial.records);
  assert.equal(ratings["10001"].notes, partial.records[0].ratings.notes);
  assert.deepEqual(partial.records.map(record => record.student), fixture.records.map(record => record.student));
});

test("rating timestamps preserve legacy chronology", () => {
  const now = "2026-07-05T12:00:00.000Z";
  assert.deepEqual(timestampRating({ notes: "new" }, true, now), { notes: "new", createdAt: now, updatedAt: now });
  assert.deepEqual(timestampRating({ notes: "legacy" }, false, now), { notes: "legacy", updatedAt: now });
  assert.equal(timestampRating({ createdAt: "old" }, true, now).createdAt, "old");
});

test("render job state clamps progress and cancellation is idempotent", () => {
  let cancelled = 0;
  const job = { status: "rendering", progress: 0.4, cancelRequested: false, cancel: () => { cancelled += 1; } };
  assert.equal(applyJobProgress(job, 4), 1);
  assert.equal(applyJobProgress(job, -1), 1);
  assert.equal(cancelJob(job), true);
  assert.equal(cancelled, 1);
  assert.equal(cancelJob(job), false);
  assert.equal(isActiveRenderStatus("encoding"), true);
  assert.equal(isActiveRenderStatus("complete"), false);
  assert.equal(clampProgress(Number.NaN), 0);
  assert.equal(browserDownloadPercent(0.42), 42);
  assert.equal(browserDownloadPercent(120), 100);
});

test("radar scan geometry and synchronized dimension reveals are deterministic", () => {
  const timeline = getTimeline(DEFAULT_VIDEO_SETTINGS);
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const trail = radarScanTrail(progress);
    assert.equal(trail.length, 20);
    assert.ok(trail.every(segment => segment.points.split(" ").flatMap(point => point.split(",").map(Number)).every(Number.isFinite)));
    assert.ok(radarScanPoint(progress).every(Number.isFinite));
  }
  assert.equal(dimensionScanFrame(timeline, 0), timeline.radarStart);
  assert.equal(dimensionScanFrame(timeline, 4), timeline.radarStart + Math.round(timeline.radarDuration * 0.8));
});

test("school names localize without changing canonical English keys", () => {
  assert.equal(schoolLabel("zh", "Millennium"), "千年科学学园");
  assert.equal(schoolLabel("zh", "WildHunt"), "狂猎艺术学院");
  assert.equal(schoolLabel("en", "Trinity"), "Trinity");
});

test("student parser keeps SchaleDB surname fields for localized display names", () => {
  const [student] = parseStudents({
    10001: {
      Id: 10001,
      IsReleased: [true],
      Name: "艾米",
      FamilyName: "和泉元",
      PersonalName: "艾米",
      DevName: "Eimi",
    },
  });
  assert.equal(student.familyName, "和泉元");
  assert.equal(student.personalName, "艾米");
  assert.equal(studentDisplayName(student, "zh"), "和泉元  艾米");
  assert.equal(studentDisplayName({ ...student, familyName: "Izumimoto", personalName: "Eimi", name: "Eimi" }, "en"), "Izumimoto Eimi");
  assert.equal(studentDisplayName({ ...student, familyName: "和泉元", name: "和泉元艾米", personalName: "" }, "zh"), "和泉元艾米");
});

test("PNG header reader reports exact supported render dimensions", () => {
  for (const [width, height] of [[1280, 720], [1920, 1080], [3840, 2160]]) {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    assert.deepEqual(readPngDimensions(png), { width, height });
  }
  assert.throws(() => readPngDimensions(Buffer.from("not png")));
});

test("render asset collection includes portraits and stable cache keys", () => {
  const project = parseVideoProject(fixture);
  const urls = collectRenderAssetUrls(project);
  assert.ok(urls.includes(studentPortraitUrl(10001)));
  assert.ok(urls.some(url => url.includes("/images/ui/Type_Attack_s.png")));
  assert.match(renderAssetCacheKey(studentPortraitUrl(10001)), /^[a-f0-9]{24}\.webp$/);
});

test("comment scrolling starts only when estimated text exceeds the viewport", () => {
  assert.equal(estimateCommentScroll("Short note", "en").distance, 0);
  const long = estimateCommentScroll("Detailed arena note ".repeat(40), "en");
  assert.ok(long.lines > 3);
  assert.ok(long.distance > 0);
});

test("preview FPS estimate is based on frame events per elapsed time", () => {
  assert.equal(estimatePreviewFps(30, 1000), 30);
  assert.equal(estimatePreviewFps(0, 1000), 0);
  assert.equal(estimatePreviewFps(30, 0), 0);
});

test("worker reports startup errors as structured sidecar events", async () => {
  const events = [];
  let exitCode;
  const result = await runWorker([], {
    emit: (type, value) => events.push({ type, ...value }),
    exit: code => { exitCode = code; },
  });
  assert.equal(result.ok, false);
  assert.equal(exitCode, 1);
  assert.deepEqual(events, [{ type: "error", error: "Usage: worker <project.json> <serve-url> <output> <binaries-directory>" }]);
});
