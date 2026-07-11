import { DEFAULT_DIMENSION_WEIGHT_SHARES, DEFAULT_RATINGS, DIMENSIONS } from "../utils/constants.js";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  WEIGHT_EDITOR_MODES,
  WEIGHT_MODES,
  normalizeDimensionWeights,
  normalizeFineWeightState,
  normalizeWeightEditorMode,
  normalizeWeightMode,
  recalculateRatings,
} from "../utils/scoring.js";
import { DEFAULT_ORDER, RATING_ORDER_STORAGE_KEY, normalizeRatingOrder } from "../utils/ratingSorting.js";

export const RATING_STORAGE_KEYS = Object.freeze({
  ratings: "ba_pvp_ratings",
  dataLanguage: "ba_rating_lang",
  uiLanguage: "ba_rating_ui_lang",
  season: "ba_rating_season",
  arenaSeason: "ba_rating_arena_season",
  theme: "ba_rating_theme",
  weightMode: "ba_rating_weight_mode",
  weightEditorMode: "ba_rating_weight_editor_mode",
  sharedDimensionWeightShares: "ba_rating_shared_dimension_weight_shares",
  sharedDimensionWeights: "ba_rating_shared_dimension_weights",
  ratingOrder: RATING_ORDER_STORAGE_KEY,
});

export const WEIGHT_STORAGE_KEYS = Object.freeze([
  RATING_STORAGE_KEYS.weightMode,
  RATING_STORAGE_KEYS.weightEditorMode,
  RATING_STORAGE_KEYS.sharedDimensionWeightShares,
  RATING_STORAGE_KEYS.sharedDimensionWeights,
]);

export const RATING_ORDER_STORAGE_KEYS = Object.freeze([RATING_STORAGE_KEYS.ratingOrder]);

function targetStorage(storage) {
  return storage || globalThis.localStorage || null;
}

export function readStoredValue(key, fallback = null, storage) {
  try {
    return targetStorage(storage)?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue(key, value, storage) {
  try {
    targetStorage(storage)?.setItem(key, String(value));
  } catch {
    return false;
  }
  return true;
}

export function readStoredJson(key, fallback = {}, storage) {
  const raw = readStoredValue(key, null, storage);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value, storage) {
  return writeStoredValue(key, JSON.stringify(value), storage);
}

function hasDimensionMap(value) {
  return Boolean(value && typeof value === "object" && DIMENSIONS.every(({ key }) => Object.hasOwn(value, key)));
}

export function parseRatingsPayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && payload.ratings && typeof payload.ratings === "object") {
    const hasSharedFine = Boolean(payload.sharedDimensionWeightShares);
    const hasSharedPreset = Boolean(payload.sharedDimensionWeights);
    return {
      ratings: payload.ratings,
      weightMode: normalizeWeightMode(payload.weightMode),
      weightEditorMode: payload.weightEditorMode
        ? normalizeWeightEditorMode(payload.weightEditorMode)
        : (hasSharedPreset && !hasSharedFine ? WEIGHT_EDITOR_MODES.preset : null),
      sharedDimensionWeightShares: hasSharedFine
        ? normalizeFineWeightState({ dimensionWeightShares: payload.sharedDimensionWeightShares }).dimensionWeightShares
        : null,
      sharedDimensionWeights: hasSharedPreset
        ? normalizeDimensionWeights({ dimensionWeights: payload.sharedDimensionWeights })
        : null,
      ratingOrder: payload.ratingOrder ? normalizeRatingOrder(payload.ratingOrder) : null,
    };
  }

  const ratings = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const values = Object.values(ratings);
  const hasFine = values.some(item => item && typeof item === "object" && Object.hasOwn(item, "dimensionWeightShares"));
  const hasPreset = values.some(item => item && typeof item === "object" && (Object.hasOwn(item, "dimensionWeights") || Object.hasOwn(item, "costWeight")));
  return {
    ratings,
    weightMode: null,
    weightEditorMode: hasFine ? WEIGHT_EDITOR_MODES.fine : hasPreset ? WEIGHT_EDITOR_MODES.preset : null,
    sharedDimensionWeightShares: null,
    sharedDimensionWeights: null,
    ratingOrder: null,
  };
}

export function normalizeStoredRating(ratings = {}) {
  const normalized = { ...DEFAULT_RATINGS(), ...ratings };
  if (!Object.hasOwn(ratings, "dimensionWeightShares")) delete normalized.dimensionWeightShares;
  if (typeof normalized.overall === "string") {
    normalized.overall = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 }[normalized.overall] ?? null;
  }
  const legacyEditorMode = Object.hasOwn(ratings, "dimensionWeightShares")
    ? WEIGHT_EDITOR_MODES.fine
    : WEIGHT_EDITOR_MODES.preset;
  return recalculateRatings(normalized, { weightMode: WEIGHT_MODES.individual, weightEditorMode: legacyEditorMode });
}

export function normalizeRatingCollection(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).map(([studentId, ratings]) => [studentId, normalizeStoredRating(ratings || {})]));
}

export function readRatingsPayload(storage) {
  return parseRatingsPayload(readStoredJson(RATING_STORAGE_KEYS.ratings, {}, storage));
}

export function readRatings(storage) {
  return normalizeRatingCollection(readRatingsPayload(storage).ratings);
}

export function persistRatings(ratings, storage) {
  return writeStoredJson(RATING_STORAGE_KEYS.ratings, ratings || {}, storage);
}

export function readSharedWeightSettings(fallback = {}, storage) {
  const payload = readRatingsPayload(storage);
  const storedShares = readStoredJson(RATING_STORAGE_KEYS.sharedDimensionWeightShares, null, storage);
  const storedWeights = readStoredJson(RATING_STORAGE_KEYS.sharedDimensionWeights, null, storage);
  return {
    weightMode: normalizeWeightMode(readStoredValue(RATING_STORAGE_KEYS.weightMode, null, storage) || payload.weightMode || fallback.weightMode),
    weightEditorMode: normalizeWeightEditorMode(readStoredValue(RATING_STORAGE_KEYS.weightEditorMode, null, storage) || payload.weightEditorMode || fallback.weightEditorMode),
    sharedDimensionWeightShares: hasDimensionMap(storedShares)
      ? normalizeFineWeightState({ dimensionWeightShares: storedShares }).dimensionWeightShares
      : normalizeFineWeightState({ dimensionWeightShares: payload.sharedDimensionWeightShares || fallback.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES }).dimensionWeightShares,
    sharedDimensionWeights: hasDimensionMap(storedWeights)
      ? normalizeDimensionWeights({ dimensionWeights: storedWeights })
      : normalizeDimensionWeights({ dimensionWeights: payload.sharedDimensionWeights || fallback.sharedDimensionWeights || DEFAULT_DIMENSION_WEIGHTS }),
  };
}

export function persistSharedWeightSettings(settings = {}, storage) {
  if (settings.weightMode) writeStoredValue(RATING_STORAGE_KEYS.weightMode, normalizeWeightMode(settings.weightMode), storage);
  if (settings.weightEditorMode) writeStoredValue(RATING_STORAGE_KEYS.weightEditorMode, normalizeWeightEditorMode(settings.weightEditorMode), storage);
  if (settings.sharedDimensionWeightShares) {
    writeStoredJson(
      RATING_STORAGE_KEYS.sharedDimensionWeightShares,
      normalizeFineWeightState({ dimensionWeightShares: settings.sharedDimensionWeightShares }).dimensionWeightShares,
      storage,
    );
  }
  if (settings.sharedDimensionWeights) {
    writeStoredJson(
      RATING_STORAGE_KEYS.sharedDimensionWeights,
      normalizeDimensionWeights({ dimensionWeights: settings.sharedDimensionWeights }),
      storage,
    );
  }
}

export function readRatingOrder(fallback = DEFAULT_ORDER, storage) {
  const stored = readStoredJson(RATING_STORAGE_KEYS.ratingOrder, null, storage);
  return normalizeRatingOrder(stored || fallback);
}

export function persistRatingOrder(order, storage) {
  const normalized = normalizeRatingOrder(order);
  writeStoredJson(RATING_STORAGE_KEYS.ratingOrder, normalized, storage);
  return normalized;
}

export function persistImportedRatingPayload(parsed, normalizedRatings, storage) {
  persistRatings(normalizedRatings, storage);
  persistSharedWeightSettings(parsed, storage);
  if (parsed.ratingOrder) persistRatingOrder(parsed.ratingOrder, storage);
  return {
    ...(parsed.weightMode ? { weightMode: parsed.weightMode } : {}),
    ...(parsed.weightEditorMode ? { weightEditorMode: parsed.weightEditorMode } : {}),
    ...(parsed.sharedDimensionWeightShares ? { sharedDimensionWeightShares: parsed.sharedDimensionWeightShares } : {}),
    ...(parsed.sharedDimensionWeights ? { sharedDimensionWeights: parsed.sharedDimensionWeights } : {}),
    ...(parsed.ratingOrder ? { ratingOrder: parsed.ratingOrder } : {}),
  };
}

export function createRatingsExportPayload(state) {
  const fineState = normalizeFineWeightState({ dimensionWeightShares: state.sharedDimensionWeightShares });
  return {
    version: 2,
    weightMode: normalizeWeightMode(state.weightMode),
    weightEditorMode: normalizeWeightEditorMode(state.weightEditorMode),
    sharedDimensionWeightShares: fineState.dimensionWeightShares,
    sharedUnassignedWeightShare: fineState.unassignedWeightShare,
    sharedDimensionWeights: normalizeDimensionWeights({ dimensionWeights: state.sharedDimensionWeights }),
    ratingOrder: normalizeRatingOrder(state.ratingOrder),
    ratings: state.allRatings || {},
  };
}
