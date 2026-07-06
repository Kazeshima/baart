import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VIDEO_SETTINGS,
  clampProgress,
  estimateCommentScroll,
  getTimeline,
  totalDurationInFrames,
  validateVideoSettings,
} from "../video/core/config.js";
import { createVideoProject, parseVideoProject, ratingsFromProjectRecords } from "../video/core/manifest.js";
import { sortRatingRecords } from "../video/core/sorting.js";
import { applyJobProgress, cancelJob, isActiveRenderStatus } from "../video/core/renderJob.js";
import { readPngDimensions } from "../video/core/png.js";
import { timestampRating } from "../src/utils/ratingTimestamps.js";
import { radarScanPoint, radarScanPolygon } from "../src/utils/radar.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/video-project.json", import.meta.url), "utf8"));
const records = fixture.records;
const ids = values => values.map(record => record.student.id);

test("timeline assigns every student the same frame count", () => {
  const timeline = getTimeline(DEFAULT_VIDEO_SETTINGS);
  assert.equal(timeline.duration, 360);
  assert.equal(totalDurationInFrames(3, DEFAULT_VIDEO_SETTINGS), timeline.duration * 3);
  assert.ok(timeline.overallEnd <= timeline.fadeOutStart);
});

test("timing validation rejects phases longer than a student slot", () => {
  const errors = validateVideoSettings({ ...DEFAULT_VIDEO_SETTINGS, studentDuration: 2 });
  assert.ok(errors.some(error => error.includes("exceed")));
});

test("chronological mode preserves legacy insertion order before timestamps", () => {
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "chronological", direction: "asc" })), [10001, 10002, 10003]);
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "chronological", direction: "desc" })), [10003, 10002, 10001]);
});

test("ID and school sorting are deterministic", () => {
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "id", direction: "asc" })), [10001, 10002, 10003]);
  assert.deepEqual(ids(sortRatingRecords(records, { mode: "school", direction: "asc" })), [10001, 10003, 10002]);
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
  assert.throws(() => parseVideoProject({ ...fixture, settings: { ...fixture.settings, uiLanguage: "jp" } }));
});

test("legacy manifests receive defaults and imported snapshots retain ratings", () => {
  const partial = parseVideoProject({
    ...fixture,
    settings: { width: 1280, height: 720, fps: 30, format: "png", outputName: "legacy" },
  });
  assert.equal(partial.settings.theme, DEFAULT_VIDEO_SETTINGS.theme);
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
});

test("radar scan geometry is finite across its full rotation", () => {
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const points = radarScanPolygon(progress).split(" ").flatMap(point => point.split(",").map(Number));
    assert.equal(points.length, 6);
    assert.ok(points.every(Number.isFinite));
    assert.ok(radarScanPoint(progress).every(Number.isFinite));
  }
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

test("comment scrolling starts only when estimated text exceeds the viewport", () => {
  assert.equal(estimateCommentScroll("Short note", "en").distance, 0);
  const long = estimateCommentScroll("Detailed arena note ".repeat(40), "en");
  assert.ok(long.lines > 3);
  assert.ok(long.distance > 0);
});
