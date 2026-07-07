import { z } from "zod";
import { DEFAULT_RATINGS } from "../../src/utils/constants.js";
import { recalculateRatings } from "../../src/utils/scoring.js";
import { DEFAULT_VIDEO_SETTINGS, VIDEO_PROJECT_VERSION } from "./config.js";
import { DEFAULT_ORDER, sortRatingRecords } from "./sorting.js";

const finiteNonNegative = z.number().finite().nonnegative();
const opacity = z.number().finite().min(0).max(1);

export const videoSettingsSchema = z.object({
  width: z.number().int().min(640).max(7680),
  height: z.number().int().min(360).max(4320),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  renderConcurrency: z.union([
    z.literal("adaptive"),
    z.literal("auto"),
    z.literal("25%"),
    z.literal("50%"),
    z.literal("75%"),
    z.literal("100%"),
    z.literal("1"),
    z.literal("2"),
    z.literal("4"),
    z.literal("6"),
    z.literal("8"),
    z.literal("12"),
    z.literal("16"),
    z.literal(1),
    z.literal(2),
    z.literal(4),
    z.literal(6),
    z.literal(8),
    z.literal(12),
    z.literal(16),
  ]).transform(value => String(value)),
  format: z.enum(["mp4", "png"]),
  outputName: z.string().trim().min(1).max(128),
  studentDuration: z.number().finite().positive(),
  fadeIn: finiteNonNegative,
  fadeOut: finiteNonNegative,
  infoStagger: finiteNonNegative,
  radarScanDuration: z.number().finite().positive(),
  radarPointDuration: z.number().finite().positive(),
  radarPolygonDuration: z.number().finite().positive(),
  overallReveal: finiteNonNegative,
  rippleCount: z.number().int().min(0).max(6),
  rippleDuration: finiteNonNegative,
  rippleScale: finiteNonNegative,
  rippleOpacity: opacity,
  scanBeamIntensity: opacity,
  commentScrollDelay: finiteNonNegative,
  commentScrollSpeed: finiteNonNegative,
  portraitOpacity: opacity,
  theme: z.enum(["dark", "light"]),
  uiLanguage: z.enum(["zh", "en"]),
  dataLanguage: z.enum(["zh", "cn", "tw", "jp", "en"]),
  season: z.enum(["Street", "Outdoor", "Indoor"]),
  arenaSeason: z.string().trim().min(1).max(32),
}).refine(value => value.width * 9 === value.height * 16, { message: "Resolution must use a 16:9 aspect ratio.", path: ["width"] });

export const videoProjectSchema = z.object({
  version: z.literal(VIDEO_PROJECT_VERSION),
  settings: videoSettingsSchema,
  order: z.object({
    mode: z.enum(["chronological", "score", "id", "school", "manual"]),
    direction: z.enum(["asc", "desc"]),
    manualIds: z.array(z.number().int().positive()),
  }),
  records: z.array(z.object({
    student: z.object({ id: z.number().int().positive(), name: z.string().min(1) }).passthrough(),
    ratings: z.record(z.string(), z.unknown()),
    legacyOrder: z.number().int().nonnegative(),
  })),
});

export function normalizeVideoRating(raw = {}) {
  const ratings = { ...DEFAULT_RATINGS(), ...raw };
  if (typeof ratings.overall === "string") {
    ratings.overall = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 }[ratings.overall] ?? null;
  }
  return recalculateRatings(ratings);
}

export function mergeRatedStudents(students, allRatings) {
  const studentsById = new Map(students.map(student => [Number(student.id), student]));
  return Object.entries(allRatings || {}).flatMap(([id, ratings], legacyOrder) => {
    const student = studentsById.get(Number(id));
    return student ? [{ student, ratings: normalizeVideoRating(ratings), legacyOrder }] : [];
  });
}

export function createVideoProject({ records, settings, order }) {
  const manifest = {
    version: VIDEO_PROJECT_VERSION,
    settings: { ...DEFAULT_VIDEO_SETTINGS, ...settings },
    order: { ...DEFAULT_ORDER, ...order },
    records,
  };
  return videoProjectSchema.parse(manifest);
}

export function safeCreateVideoProject(value) {
  const manifest = {
    version: VIDEO_PROJECT_VERSION,
    settings: { ...DEFAULT_VIDEO_SETTINGS, ...value.settings },
    order: { ...DEFAULT_ORDER, ...value.order },
    records: value.records || [],
  };
  return videoProjectSchema.safeParse(manifest);
}

export function parseVideoProject(value) {
  const project = videoProjectSchema.parse({
    ...value,
    settings: { ...DEFAULT_VIDEO_SETTINGS, ...(value?.settings || {}) },
    order: { ...DEFAULT_ORDER, ...(value?.order || {}) },
  });
  return {
    ...project,
    records: project.records.map(record => ({
      ...record,
      ratings: normalizeVideoRating(record.ratings),
    })),
  };
}

export function ratingsFromProjectRecords(records) {
  return Object.fromEntries(records.map(record => [String(record.student.id), normalizeVideoRating(record.ratings)]));
}

export function orderedProjectRecords(project) {
  return sortRatingRecords(project.records, project.order);
}
