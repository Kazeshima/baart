import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VIDEO_SETTINGS,
  benchmarkStorageKey,
  clampProgress,
  commentScrollDistanceFromHeights,
  commentScrollFrames,
  commentScrollOffset,
  dimensionScanFrame,
  estimatePreviewFps,
  estimateCommentScroll,
  getTimeline,
  predictRenderConcurrency,
  resolveRenderConcurrency,
  sceneFadeOpacity,
  totalDurationInFrames,
  validateVideoSettings,
} from "../video/core/config.js";
import { createVideoProject, parseVideoProject, ratingsFromProjectRecords } from "../video/core/manifest.js";
import { normalizeRatingOrder, ratingRecordsFromStudents, sortRatingRecords } from "../video/core/sorting.js";
import { applyJobProgress, browserDownloadPercent, cancelJob, isActiveRenderStatus } from "../video/core/renderJob.js";
import { readPngDimensions } from "../video/core/png.js";
import { timestampRating } from "../src/utils/ratingTimestamps.js";
import { OVERALL_LABELS, schoolLabel } from "../src/utils/i18n.js";
import { parseStudents } from "../src/utils/students.js";
import { RADAR_ANGLES, RADAR_RADIUS, radarPoint, radarRevealCircle, radarScanPoint, radarScanTrail } from "../src/utils/radar.js";
import { studentDisplayName } from "../src/utils/studentDisplay.js";
import { schoolIconPath } from "../src/utils/schoolIcons.js";
import { runWorker } from "../video/sidecar/worker.mjs";
import { collectRenderAssetUrls, renderAssetCacheKey, studentPortraitUrl } from "../video/core/renderAssets.js";
import { createProfileCases, safeProfileName } from "../video/core/profile.js";
import { benchmarkOutputIo, classifyRenderBottleneck, selectBenchmarkConcurrencyCandidates } from "../video/render-service.mjs";
import { vt } from "../video/core/i18n.js";
import { buildDimensionReportSvg, dimensionReportRows } from "../src/utils/dimensionReport.js";

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

test("render concurrency defaults to adaptive prediction and validates supported choices", () => {
  assert.equal(DEFAULT_VIDEO_SETTINGS.renderConcurrency, "adaptive");
  assert.equal(resolveRenderConcurrency("adaptive", { logicalCores: 22 }), 8);
  assert.equal(predictRenderConcurrency(4), 2);
  assert.equal(predictRenderConcurrency(8), 4);
  assert.equal(predictRenderConcurrency(14), 6);
  assert.equal(predictRenderConcurrency(24), 8);
  assert.equal(predictRenderConcurrency(32), 12);
  assert.equal(resolveRenderConcurrency("auto"), undefined);
  assert.equal(resolveRenderConcurrency("50%"), null);
  assert.equal(resolveRenderConcurrency("100%"), "100%");
  assert.equal(resolveRenderConcurrency("4"), 4);
  assert.equal(resolveRenderConcurrency("12"), 12);
  assert.equal(resolveRenderConcurrency(8), 8);
  assert.equal(resolveRenderConcurrency("3"), null);
  assert.ok(validateVideoSettings({ ...DEFAULT_VIDEO_SETTINGS, renderConcurrency: "3" }).some(error => error.includes("concurrency")));
});

test("video profiling cases cover scene blocks and concurrency choices", () => {
  const cases = createProfileCases();
  assert.ok(cases.some(item => item.name === "no-portrait-adaptive" && item.profile.disablePortrait));
  assert.ok(cases.some(item => item.name === "no-shadows-glows-adaptive" && item.profile.disableShadows));
  assert.ok(cases.some(item => item.name === "no-comment-mask-scroll-adaptive" && item.profile.disableCommentMask && item.profile.disableCommentScroll));
  assert.ok(cases.some(item => item.name === "static-radar-adaptive" && item.profile.staticRadar));
  assert.ok(cases.some(item => item.name === "no-radar-ripples-adaptive" && item.profile.disableRipples));
  assert.ok(cases.some(item => item.name === "fast-quality-mode-adaptive" && item.settings.renderQualityMode === "fast"));
  assert.ok(cases.some(item => item.name === "simple-radar-adaptive" && item.profile.simplifyRadar));
  assert.ok(!cases.some(item => item.renderConcurrency === "75%"));
  assert.ok(cases.some(item => item.name === "full-2" && item.renderConcurrency === "2"));
  assert.ok(cases.some(item => item.name === "full-12" && item.renderConcurrency === "12"));
  assert.ok(cases.some(item => item.name === "full-adaptive-jpeg" && item.imageFormat === "jpeg"));
  assert.equal(safeProfileName("75%"), "75");
});

test("benchmark helpers select valid candidates and key local results by hardware and target", async () => {
  assert.deepEqual(selectBenchmarkConcurrencyCandidates(["adaptive", "adaptive", "3", "12"], 22), ["adaptive", "12"]);
  assert.notEqual(
    benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, format: "png" }, 22),
    benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, format: "mp4" }, 22),
  );
  assert.notEqual(
    benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, format: "png" }, 22),
    benchmarkStorageKey({ ...DEFAULT_VIDEO_SETTINGS, format: "png" }, 8),
  );
  const io = await benchmarkOutputIo(".cache/test-video-io", { frames: 2, bytesPerFrame: 1024 });
  assert.equal(io.frames, 2);
  assert.equal(io.totalBytes, 2048);
  assert.ok(io.filesPerSecond > 0);
  assert.ok(io.mbPerSecond > 0);
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

test("scene fades fully out on the final frame", () => {
  const timeline = getTimeline(DEFAULT_VIDEO_SETTINGS);
  assert.equal(sceneFadeOpacity(0, timeline), 0);
  assert.equal(sceneFadeOpacity(timeline.duration - 1, timeline), 0);
  assert.ok(sceneFadeOpacity(timeline.fadeOutStart, timeline) < 1);
});

test("quality comment mask fades both top and bottom edges", async () => {
  const css = await readFile(new URL("../video/video.css", import.meta.url), "utf8");
  assert.match(css, /video-comments__viewport[^{]*\{[^}]*linear-gradient\(to bottom,\s*transparent 0%/s);
  assert.match(css, /video-comments__viewport[^{]*\{[^}]*#000 9%[^}]*#000 88%[^}]*transparent 100%/s);
});

test("shared rating order normalization and student record conversion support the main sidebar", () => {
  assert.deepEqual(normalizeRatingOrder({ mode: "invalid", direction: "sideways", manualIds: ["10003", -1, "bad"] }), {
    mode: "chronological",
    direction: "asc",
    manualIds: [10003],
  });
  const students = records.map(record => record.student);
  const allRatings = Object.fromEntries(records.map(record => [record.student.id, record.ratings]));
  const converted = ratingRecordsFromStudents(students, allRatings, allRatings);
  assert.deepEqual(ids(sortRatingRecords(converted, { mode: "manual", manualIds: [10002, 10001] })), [10002, 10001, 10003]);
});

test("dimension ranking report sorts by selected tier and omits missing dimensions", () => {
  const parsed = parseVideoProject(fixture).records;
  const rows = dimensionReportRows({
    students: parsed.map(record => record.student),
    ratingsById: Object.fromEntries(parsed.map(record => [record.student.id, record.ratings])),
    dimension: "blindshot",
    direction: "desc",
    language: "en",
  });
  assert.deepEqual(rows.map(row => row.student.id), [10003, 10001, 10002]);
  assert.deepEqual(dimensionReportRows({
    students: parsed.map(record => record.student),
    ratingsById: { [parsed[0].student.id]: { ...parsed[0].ratings, blindshot: null } },
    dimension: "blindshot",
  }), []);
  const svg = buildDimensionReportSvg({ rows, dimension: "blindshot", language: "en", arenaSeason: "S9" });
  assert.match(svg, /Dimension Ranks/);
  assert.match(svg, /student\/icon\/10003\.webp/);
});

test("video project manifests validate and retain reproducible records", () => {
  const parsed = parseVideoProject(fixture);
  const created = createVideoProject(parsed);
  assert.equal(created.version, 1);
  assert.equal(created.records.length, 3);
  assert.throws(() => parseVideoProject({ ...fixture, version: 2 }));
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, format: "gif" } }));
  assert.equal(parseVideoProject({ ...fixture, settings: { ...fixture.settings, format: "jpeg" } }).settings.format, "jpeg");
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
  assert.equal(partial.settings.renderConcurrency, "adaptive");
  assert.equal(partial.settings.weightMode, "shared");
  assert.equal(partial.settings.renderQualityMode, "balanced");
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
  const job = { kind: "render", status: "rendering", progress: 0.4, cancelRequested: false, cancel: () => { cancelled += 1; } };
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

test("benchmark jobs use step labels instead of frame labels", () => {
  const job = { kind: "benchmark", renderedFrames: 11, totalFrames: 11 };
  const label = job.kind === "benchmark" ? vt("zh", "benchmarkSteps") : vt("zh", "framesRendered");
  assert.equal(label, "步骤");
  assert.equal(`${label} ${job.renderedFrames} / ${job.totalFrames}`, "步骤 11 / 11");
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

test("radar reveal points fade in at final coordinates", () => {
  const target = radarPoint(RADAR_ANGLES[2], RADAR_RADIUS * 0.8);
  const quarter = radarRevealCircle(target, 0.25);
  const complete = radarRevealCircle(target, 1);
  assert.equal(quarter.cx, target[0]);
  assert.equal(quarter.cy, target[1]);
  assert.equal(complete.cx, target[0]);
  assert.equal(complete.cy, target[1]);
  assert.equal(quarter.r, 1);
  assert.equal(quarter.opacity, 0.25);
  assert.equal(complete.r, 4);
  assert.equal(complete.opacity, 1);
});

test("school names localize without changing canonical English keys", () => {
  assert.equal(schoolLabel("zh", "Millennium"), "千年科学学园");
  assert.equal(schoolLabel("zh", "WildHunt"), "狂猎艺术学院");
  assert.equal(schoolLabel("en", "Trinity"), "Trinity");
  assert.equal(schoolIconPath("Millennium"), "/assets/schoolicon/Millennium.png");
  assert.equal(schoolIconPath("Sakugawa"), "");
});

test("English overall top label uses compact GOAT wording", () => {
  assert.equal(OVERALL_LABELS.en[4], "GOAT");
  assert.ok(!OVERALL_LABELS.en.includes("Gigachad"));
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
  assert.equal(studentDisplayName({ ...student, familyName: "Kadenokouji", personalName: "Yukari", name: "Yukari (Swimsuit)" }, "en"), "Kadenokouji Yukari (Swimsuit)");
  assert.equal(studentDisplayName({ ...student, familyName: "勘解由小路", personalName: "紫草", name: "紫草（泳装）" }, "zh"), "勘解由小路  紫草（泳装）");
  assert.equal(studentDisplayName({ ...student, familyName: "和泉元", name: "和泉元艾米", personalName: "" }, "zh"), "和泉元艾米");
});

test("render bottleneck classification separates IO from render or PNG encoding", () => {
  assert.equal(classifyRenderBottleneck(5, 8), "disk-io");
  assert.equal(classifyRenderBottleneck(5, 80), "browser-or-png-encoding");
  assert.equal(classifyRenderBottleneck(0, 80), "unknown");
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
  assert.ok(urls.includes(schoolIconPath("Abydos")));
  assert.ok(urls.some(url => url.includes("/images/ui/Type_Attack_s.png")));
  assert.match(renderAssetCacheKey(studentPortraitUrl(10001)), /^[a-f0-9]{24}\.webp$/);
  assert.match(renderAssetCacheKey(schoolIconPath("Abydos")), /^[a-f0-9]{24}\.png$/);
});

test("comment scrolling starts only when estimated text exceeds the viewport", () => {
  assert.equal(estimateCommentScroll("Short note", "en").distance, 0);
  const long = estimateCommentScroll("Detailed arena note ".repeat(40), "en");
  assert.ok(long.lines > 3);
  assert.ok(long.distance > 0);
  assert.equal(commentScrollDistanceFromHeights(260.05, 260), 0);
  assert.equal(commentScrollDistanceFromHeights(260.2, 260), 1);
  const wrapped = estimateCommentScroll("averyveryveryveryverylongunbrokentoken", "en", { charsPerLine: 8, lineHeight: 10, viewportHeight: 10 });
  assert.ok(wrapped.lines > 1);
  const cjk = estimateCommentScroll("这是很长的竞技场评价说明".repeat(8), "zh", { charsPerLine: 8, lineHeight: 10, viewportHeight: 10 });
  assert.ok(cjk.distance > 0);
  const supplied = estimateCommentScroll("伟大。酒谷这个五边形是瞎画的吧。不说了，黑月舜星牌序解是S9最天马行空的对策。喷不死黑子正常，喷不死瞬你也未必会输啊。", "zh", {
    charsPerLine: 17,
    lineHeight: 58,
    viewportHeight: 260,
  });
  assert.equal(supplied.distance, 0);
  assert.equal(commentScrollDistanceFromHeights(260.2, 260), 1);
});

test("fit-hold comment scrolling starts before overall reveal and finishes before fade-out", () => {
  const settings = { ...DEFAULT_VIDEO_SETTINGS, fps: 30, commentScrollMode: "fitHold", commentScrollDelay: 0.8 };
  const timeline = getTimeline(settings);
  const scroll = commentScrollFrames(timeline, settings, settings.fps);
  assert.ok(scroll.start < timeline.overallStart);
  assert.ok(scroll.end <= timeline.fadeOutStart);
  assert.equal(commentScrollOffset({ frame: scroll.start - 1, distance: 240, timeline, settings, fps: settings.fps }), 0);
  assert.equal(commentScrollOffset({ frame: scroll.end, distance: 240, timeline, settings, fps: settings.fps }), 240);
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
