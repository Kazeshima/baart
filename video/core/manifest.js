import { z } from "zod";
import { DEFAULT_DIMENSION_WEIGHT_SHARES, DEFAULT_RATINGS, DIMENSIONS } from "../../src/utils/constants.js";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  normalizeDimensionWeights,
  normalizeFineWeightState,
  normalizeWeightEditorMode,
  normalizeWeightMode,
  recalculateRatings,
} from "../../src/utils/scoring.js";
import { DEFAULT_VIDEO_SETTINGS, VIDEO_PROJECT_VERSION } from "./config.js";
import { DEFAULT_ORDER, sortRatingRecords } from "./sorting.js";

const finiteNonNegative = z.number().finite().nonnegative();
const opacity = z.number().finite().min(0).max(1);
const weightSharesSchema = z.object(Object.fromEntries(DIMENSIONS.map(({ key }) => [key, z.number().finite().min(0).max(100)])));
const dimensionWeightsSchema = z.object(Object.fromEntries(DIMENSIONS.map(({ key }) => [key, z.enum(["none", "half", "full"])])));

export const videoSettingsSchema = z.object({
  width: z.number().int().min(640).max(7680),
  height: z.number().int().min(360).max(4320),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  renderConcurrency: z.union([
    z.literal("adaptive"),
    z.literal("auto"),
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
  renderQualityMode: z.enum(["quality", "balanced", "fast"]),
  format: z.enum(["mp4", "png", "jpeg"]),
  outputName: z.string().trim().min(1).max(128),
  studentDuration: z.number().finite().positive(),
  fadeIn: finiteNonNegative,
  fadeOut: finiteNonNegative,
  infoStagger: finiteNonNegative,
  infoEnterDuration: finiteNonNegative,
  infoEnterDistance: finiteNonNegative,
  radarScanDuration: z.number().finite().positive(),
  radarScanFadeOutDuration: finiteNonNegative,
  radarPointDuration: z.number().finite().positive(),
  radarPolygonDuration: z.number().finite().positive(),
  radarScanTrailDegrees: z.number().finite().min(0).max(180),
  radarScanTrailSegments: z.number().int().min(0).max(24),
  scanBeamColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  scanAfterglowOpacity: opacity,
  scanBeamCenterWidth: z.number().finite().positive().max(24),
  scanBeamEdgeWidth: z.number().finite().nonnegative().max(24),
  overallReveal: finiteNonNegative,
  overallDelay: finiteNonNegative,
  overallGlowStrength: finiteNonNegative,
  rippleCount: z.number().int().min(0).max(6),
  rippleDuration: finiteNonNegative,
  rippleScale: finiteNonNegative,
  rippleOpacity: opacity,
  scanBeamIntensity: opacity,
  commentScrollDelay: finiteNonNegative,
  commentScrollMode: z.enum(["fitHold", "fixedSpeed"]),
  commentScrollSpeed: finiteNonNegative,
  portraitOpacity: opacity,
  theme: z.enum(["dark", "light"]),
  uiLanguage: z.enum(["zh", "en"]),
  dataLanguage: z.enum(["zh", "cn", "tw", "jp", "en"]),
  season: z.enum(["Street", "Outdoor", "Indoor"]),
  arenaSeason: z.string().trim().min(1).max(32),
  weightMode: z.enum(["shared", "individual"]),
  weightEditorMode: z.enum(["fine", "preset"]),
  sharedDimensionWeightShares: weightSharesSchema.transform(value => normalizeFineWeightState({ dimensionWeightShares: value }).dimensionWeightShares),
  sharedDimensionWeights: dimensionWeightsSchema.transform(value => normalizeDimensionWeights({ dimensionWeights: value })),
})
  .refine(value => value.width * 9 === value.height * 16, { message: "Resolution must use a 16:9 aspect ratio.", path: ["width"] })
  .refine(value => value.scanBeamEdgeWidth <= value.scanBeamCenterWidth, { message: "Scan beam edge width must not exceed center width.", path: ["scanBeamEdgeWidth"] });

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

export function normalizeVideoRating(raw = {}, settings = DEFAULT_VIDEO_SETTINGS) {
  const ratings = { ...DEFAULT_RATINGS(), ...raw };
  if (!raw || !Object.hasOwn(raw, "dimensionWeightShares")) {
    delete ratings.dimensionWeightShares;
  }
  if (typeof ratings.overall === "string") {
    ratings.overall = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 }[ratings.overall] ?? null;
  }
  return recalculateRatings(ratings, {
    weightMode: normalizeWeightMode(settings.weightMode),
    weightEditorMode: normalizeWeightEditorMode(settings.weightEditorMode),
    sharedDimensionWeightShares: settings.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES,
    sharedDimensionWeights: settings.sharedDimensionWeights || DEFAULT_DIMENSION_WEIGHTS,
  });
}

export function mergeRatedStudents(students, allRatings, settings = DEFAULT_VIDEO_SETTINGS) {
  const studentsById = new Map(students.map(student => [Number(student.id), student]));
  return Object.entries(allRatings || {}).flatMap(([id, ratings], legacyOrder) => {
    const student = studentsById.get(Number(id));
    return student ? [{ student, ratings: normalizeVideoRating(ratings, settings), legacyOrder }] : [];
  });
}

export function createVideoProject({ records, settings, order }) {
  const manifest = {
    version: VIDEO_PROJECT_VERSION,
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      ...settings,
      weightMode: normalizeWeightMode(settings?.weightMode),
      weightEditorMode: normalizeWeightEditorMode(settings?.weightEditorMode),
      sharedDimensionWeightShares: normalizeFineWeightState({
        dimensionWeightShares: settings?.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES,
      }).dimensionWeightShares,
      sharedDimensionWeights: normalizeDimensionWeights({ dimensionWeights: settings?.sharedDimensionWeights || DEFAULT_DIMENSION_WEIGHTS }),
    },
    order: { ...DEFAULT_ORDER, ...order },
    records,
  };
  return videoProjectSchema.parse(manifest);
}

export function safeCreateVideoProject(value) {
  const manifest = {
    version: VIDEO_PROJECT_VERSION,
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      ...value.settings,
      weightMode: normalizeWeightMode(value.settings?.weightMode),
      weightEditorMode: normalizeWeightEditorMode(value.settings?.weightEditorMode),
      sharedDimensionWeightShares: normalizeFineWeightState({
        dimensionWeightShares: value.settings?.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES,
      }).dimensionWeightShares,
      sharedDimensionWeights: normalizeDimensionWeights({ dimensionWeights: value.settings?.sharedDimensionWeights || DEFAULT_DIMENSION_WEIGHTS }),
    },
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
      ratings: normalizeVideoRating(record.ratings, project.settings),
    })),
  };
}

export function ratingsFromProjectRecords(records) {
  return Object.fromEntries(records.map(record => [String(record.student.id), normalizeVideoRating(record.ratings)]));
}

export function orderedProjectRecords(project) {
  return sortRatingRecords(project.records, project.order);
}
