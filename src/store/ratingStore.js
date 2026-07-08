import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { DEFAULT_DIMENSION_WEIGHT_SHARES, DEFAULT_RATINGS } from "../utils/constants.js";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  WEIGHT_EDITOR_MODES,
  WEIGHT_MODES,
  adjustFineWeightShare,
  normalizeDimensionWeights,
  normalizeFineWeightState,
  normalizeWeightEditorMode,
  normalizeWeightMode,
  recalculateRatings,
} from "../utils/scoring.js";
import { timestampRating } from "../utils/ratingTimestamps.js";

const LS_LANG = "ba_rating_lang";
const LS_UI_LANG = "ba_rating_ui_lang";
const LS_SEASON = "ba_rating_season";
const LS_ARENA_SEASON = "ba_rating_arena_season";
const LS_THEME = "ba_rating_theme";
const LS_WEIGHT_MODE = "ba_rating_weight_mode";
const LS_WEIGHT_EDITOR_MODE = "ba_rating_weight_editor_mode";
const LS_SHARED_WEIGHTS = "ba_rating_shared_dimension_weight_shares";
const LS_SHARED_PRESET_WEIGHTS = "ba_rating_shared_dimension_weights";
const RATINGS_KEY = "ba_pvp_ratings";  // localStorage key for all saved ratings
const RATINGS_FILE = "ratings/ba_pvp_ratings.json";

export const WEIGHT_STORAGE_KEYS = Object.freeze([
  LS_WEIGHT_MODE,
  LS_WEIGHT_EDITOR_MODE,
  LS_SHARED_WEIGHTS,
  LS_SHARED_PRESET_WEIGHTS,
]);

function loadRatings() {
  try {
    const payload = JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}");
    const parsed = parseRatingsPayload(payload);
    return normalizeRatingCollection(parsed.ratings);
  }
  catch { return {}; }
}
function saveRatings(r) {
  localStorage.setItem(RATINGS_KEY, JSON.stringify(r));
}

function loadSharedDimensionWeightShares() {
  try {
    return normalizeFineWeightState({
      dimensionWeightShares: JSON.parse(localStorage.getItem(LS_SHARED_WEIGHTS) || "null") || DEFAULT_DIMENSION_WEIGHT_SHARES,
    }).dimensionWeightShares;
  } catch {
    return normalizeFineWeightState({ dimensionWeightShares: DEFAULT_DIMENSION_WEIGHT_SHARES }).dimensionWeightShares;
  }
}

function saveSharedDimensionWeightShares(shares) {
  localStorage.setItem(LS_SHARED_WEIGHTS, JSON.stringify(normalizeFineWeightState({ dimensionWeightShares: shares }).dimensionWeightShares));
}

function loadSharedDimensionWeights() {
  try {
    return normalizeDimensionWeights({ dimensionWeights: JSON.parse(localStorage.getItem(LS_SHARED_PRESET_WEIGHTS) || "null") || DEFAULT_DIMENSION_WEIGHTS });
  } catch {
    return { ...DEFAULT_DIMENSION_WEIGHTS };
  }
}

function saveSharedDimensionWeights(weights) {
  localStorage.setItem(LS_SHARED_PRESET_WEIGHTS, JSON.stringify(normalizeDimensionWeights({ dimensionWeights: weights })));
}

function parseRatingsPayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && payload.ratings && typeof payload.ratings === "object") {
    const hasSharedFine = Boolean(payload.sharedDimensionWeightShares);
    const hasSharedPreset = Boolean(payload.sharedDimensionWeights);
    return {
      ratings: payload.ratings,
      weightMode: normalizeWeightMode(payload.weightMode),
      weightEditorMode: payload.weightEditorMode
        ? normalizeWeightEditorMode(payload.weightEditorMode)
        : (hasSharedPreset && !hasSharedFine ? WEIGHT_EDITOR_MODES.preset : null),
      sharedDimensionWeightShares: payload.sharedDimensionWeightShares
        ? normalizeFineWeightState({ dimensionWeightShares: payload.sharedDimensionWeightShares }).dimensionWeightShares
        : null,
      sharedDimensionWeights: payload.sharedDimensionWeights
        ? normalizeDimensionWeights({ dimensionWeights: payload.sharedDimensionWeights })
        : null,
    };
  }
  const ratings = payload || {};
  const values = ratings && typeof ratings === "object" && !Array.isArray(ratings) ? Object.values(ratings) : [];
  const hasFine = values.some(item => item && typeof item === "object" && Object.hasOwn(item, "dimensionWeightShares"));
  const hasPreset = values.some(item => item && typeof item === "object" && (Object.hasOwn(item, "dimensionWeights") || Object.hasOwn(item, "costWeight")));
  return {
    ratings,
    weightMode: null,
    weightEditorMode: hasFine ? WEIGHT_EDITOR_MODES.fine : hasPreset ? WEIGHT_EDITOR_MODES.preset : null,
    sharedDimensionWeightShares: null,
    sharedDimensionWeights: null,
  };
}

function normalizeRatings(ratings) {
  const normalized = { ...DEFAULT_RATINGS(), ...ratings };
  if (!ratings || !Object.hasOwn(ratings, "dimensionWeightShares")) {
    delete normalized.dimensionWeightShares;
  }
  if (typeof normalized.overall === "string") {
    const legacy = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 };
    normalized.overall = legacy[normalized.overall] ?? null;
  }
  const legacyEditorMode = ratings && Object.hasOwn(ratings, "dimensionWeightShares")
    ? WEIGHT_EDITOR_MODES.fine
    : WEIGHT_EDITOR_MODES.preset;
  return recalculateRatings(normalized, { weightMode: WEIGHT_MODES.individual, weightEditorMode: legacyEditorMode });
}

function normalizeRatingCollection(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).map(([studentId, ratings]) => [
    studentId,
    normalizeRatings(ratings || {}),
  ]));
}

function effectiveOptions(state) {
  return {
    weightMode: state.weightMode,
    weightEditorMode: state.weightEditorMode,
    sharedDimensionWeightShares: state.sharedDimensionWeightShares,
    sharedDimensionWeights: state.sharedDimensionWeights,
  };
}

function effectiveRatings(rawRatings, state) {
  return recalculateRatings(normalizeRatings(rawRatings || {}), effectiveOptions(state));
}

function effectiveRatingCollection(allRatings, state) {
  return Object.fromEntries(Object.entries(allRatings || {}).map(([studentId, ratings]) => [
    studentId,
    effectiveRatings(ratings, state),
  ]));
}

function prepareStoredRating(rating, state) {
  if (state.weightMode !== WEIGHT_MODES.shared) return rating;
  const { dimensionWeightShares, dimensionWeights, costWeight, unassignedWeightShare, weightEditorMode, ...rest } = rating;
  return rest;
}

function ratingsExportPayload(state) {
  const fineState = normalizeFineWeightState({ dimensionWeightShares: state.sharedDimensionWeightShares });
  return {
    version: 2,
    weightMode: state.weightMode,
    weightEditorMode: state.weightEditorMode,
    sharedDimensionWeightShares: fineState.dimensionWeightShares,
    sharedUnassignedWeightShare: fineState.unassignedWeightShare,
    sharedDimensionWeights: normalizeDimensionWeights({ dimensionWeights: state.sharedDimensionWeights }),
    ratings: state.allRatings,
  };
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename, bytes, type = "application/octet-stream") {
  downloadBlob(filename, new Blob([bytes], { type }));
}

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

export const useRatingStore = create((set, get) => ({
  // Student data
  students: [],
  loading: true,
  error: null,
  language: localStorage.getItem(LS_LANG) || "zh",
  uiLanguage: localStorage.getItem(LS_UI_LANG) || "zh",
  theme: localStorage.getItem(LS_THEME) || "dark",

  // Selected student
  selectedStudent: null,

  // Season selector
  season: localStorage.getItem(LS_SEASON) || "Street",
  arenaSeason: localStorage.getItem(LS_ARENA_SEASON) || "S9",

  // All saved ratings: { [studentId]: RatingObject }
  allRatings: loadRatings(),
  weightMode: normalizeWeightMode(localStorage.getItem(LS_WEIGHT_MODE)),
  weightEditorMode: normalizeWeightEditorMode(localStorage.getItem(LS_WEIGHT_EDITOR_MODE)),
  sharedDimensionWeightShares: loadSharedDimensionWeightShares(),
  sharedDimensionWeights: loadSharedDimensionWeights(),
  lastFilePath: "",
  fileStatus: "",

  // Search
  searchQuery: "",
  searchResults: [],

  // Actions
  setLanguage: (lang) => {
    localStorage.setItem(LS_LANG, lang);
    set({ language: lang, students: [], loading: true, error: null, selectedStudent: null });
  },
  setUiLanguage: (lang) => {
    localStorage.setItem(LS_UI_LANG, lang);
    set({ uiLanguage: lang });
  },
  setTheme: (theme) => {
    localStorage.setItem(LS_THEME, theme);
    set({ theme });
  },
  setSeason: (season) => {
    localStorage.setItem(LS_SEASON, season);
    set({ season });
  },
  setArenaSeason: (arenaSeason) => {
    localStorage.setItem(LS_ARENA_SEASON, arenaSeason);
    set({ arenaSeason });
  },
  setWeightMode: (weightMode) => {
    const mode = normalizeWeightMode(weightMode);
    localStorage.setItem(LS_WEIGHT_MODE, mode);
    set({ weightMode: mode });
  },
  setWeightEditorMode: (weightEditorMode) => {
    const mode = normalizeWeightEditorMode(weightEditorMode);
    localStorage.setItem(LS_WEIGHT_EDITOR_MODE, mode);
    set({ weightEditorMode: mode });
  },
  setSharedDimensionWeightShare: (dimension, share) => {
    const current = get().sharedDimensionWeightShares;
    const sharedDimensionWeightShares = adjustFineWeightShare(current, dimension, share).dimensionWeightShares;
    saveSharedDimensionWeightShares(sharedDimensionWeightShares);
    set({ sharedDimensionWeightShares });
  },
  setSharedDimensionWeight: (dimension, weight) => {
    const sharedDimensionWeights = normalizeDimensionWeights({
      dimensionWeights: { ...get().sharedDimensionWeights, [dimension]: weight },
    });
    saveSharedDimensionWeights(sharedDimensionWeights);
    set({ sharedDimensionWeights });
  },
  syncSharedWeightSettingsFromStorage: () => {
    set({
      weightMode: normalizeWeightMode(localStorage.getItem(LS_WEIGHT_MODE)),
      weightEditorMode: normalizeWeightEditorMode(localStorage.getItem(LS_WEIGHT_EDITOR_MODE)),
      sharedDimensionWeightShares: loadSharedDimensionWeightShares(),
      sharedDimensionWeights: loadSharedDimensionWeights(),
    });
  },
  setStudents: (students) => set({ students, loading: false }),
  setError: (error) => set({ error, loading: false }),

  selectStudent: (student) => set({ selectedStudent: student }),

  setSearchQuery: (q) => {
    const { students } = get();
    const query = q.toLowerCase().trim();
    const results = query
      ? students.filter(s =>
          s.name.toLowerCase().includes(query) ||
          String(s.id).includes(query) ||
          (s.devName || "").toLowerCase().includes(query)
        ).slice(0, 10)
      : [];
    set({ searchQuery: q, searchResults: results });
  },

  // Get ratings for current student (or defaults)
  getCurrentRatings: () => {
    const s = get();
    if (!s.selectedStudent) return DEFAULT_RATINGS();
    return effectiveRatings(s.allRatings[s.selectedStudent.id] || {}, s);
  },

  getEffectiveAllRatings: () => effectiveRatingCollection(get().allRatings, get()),

  // Update one dimension rating
  setDimensionRating: (dim, tier) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating(recalculateRatings({ ...existing, [dim]: tier }, effectiveOptions(s)), isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    // Auto-save on every change
    saveRatings(allRatings);
  },

  setOverallRating: (tier) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating(recalculateRatings({ ...existing, overall: tier, overallAuto: false }, effectiveOptions(s)), isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setOverallAuto: (auto) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating(recalculateRatings({ ...existing, overallAuto: auto }, effectiveOptions(s)), isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setDimensionWeight: (dimension, weight) => {
    const s = get();
    if (s.weightMode === WEIGHT_MODES.shared) {
      s.setSharedDimensionWeight(dimension, weight);
      return;
    }
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating(recalculateRatings({
      ...existing,
      dimensionWeights: { ...existing.dimensionWeights, [dimension]: weight },
      dimensionWeightShares: undefined,
    }, { ...effectiveOptions(s), weightEditorMode: WEIGHT_EDITOR_MODES.preset }), isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setCostWeight: (costWeight) => get().setDimensionWeight("cost", costWeight),

  setDimensionWeightShare: (dimension, share) => {
    const s = get();
    if (s.weightMode === WEIGHT_MODES.shared) {
      s.setSharedDimensionWeightShare(dimension, share);
      return;
    }
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating(recalculateRatings({
      ...existing,
      dimensionWeightShares: adjustFineWeightShare(existing.dimensionWeightShares, dimension, share).dimensionWeightShares,
    }, { weightMode: WEIGHT_MODES.individual, weightEditorMode: WEIGHT_EDITOR_MODES.fine }), isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setNotes: (notes) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const isNew = !Object.hasOwn(s.allRatings, id);
    const existing = effectiveRatings(s.allRatings[id] || {}, s);
    const updated = timestampRating({ ...existing, notes }, isNew);
    const allRatings = { ...s.allRatings, [id]: prepareStoredRating(updated, s) };
    set({ allRatings });
    saveRatings(allRatings);
  },

  // Manual save (also done automatically, but useful for export)
  saveAllRatings: async () => {
    saveRatings(get().allRatings);
    const contents = JSON.stringify(ratingsExportPayload(get()), null, 2);
    if (isTauri()) {
      const path = await invoke("save_text_as", {
        defaultName: "ba_pvp_ratings.json",
        contents,
        filters: JSON_FILTER,
      });
      if (path) set({ fileStatus: path });
      return path;
    }
    downloadTextFile("ba_pvp_ratings.json", contents);
    set({ fileStatus: "ba_pvp_ratings.json" });
    return "ba_pvp_ratings.json";
  },

  exportRatingsJSON: async () => {
    return get().saveAllRatings();
  },

  importRatingsJSON: (jsonText) => {
    try {
      const parsed = parseRatingsPayload(JSON.parse(jsonText));
      const data = normalizeRatingCollection(parsed.ratings);
      const nextState = { allRatings: data };
      if (parsed.weightMode) {
        localStorage.setItem(LS_WEIGHT_MODE, parsed.weightMode);
        nextState.weightMode = parsed.weightMode;
      }
      if (parsed.weightEditorMode) {
        localStorage.setItem(LS_WEIGHT_EDITOR_MODE, parsed.weightEditorMode);
        nextState.weightEditorMode = parsed.weightEditorMode;
      }
      if (parsed.sharedDimensionWeightShares) {
        saveSharedDimensionWeightShares(parsed.sharedDimensionWeightShares);
        nextState.sharedDimensionWeightShares = parsed.sharedDimensionWeightShares;
      }
      if (parsed.sharedDimensionWeights) {
        saveSharedDimensionWeights(parsed.sharedDimensionWeights);
        nextState.sharedDimensionWeights = parsed.sharedDimensionWeights;
      }
      saveRatings(data);
      set(nextState);
      return true;
    } catch { return false; }
  },

  loadRatingsFromFile: async () => {
    if (!isTauri()) return null;
    const text = await invoke("open_text_file", { filters: JSON_FILTER });
    if (!text) return null;
    const parsed = parseRatingsPayload(JSON.parse(text));
    const data = normalizeRatingCollection(parsed.ratings);
    const nextState = { allRatings: data, fileStatus: "loaded JSON" };
    if (parsed.weightMode) {
      localStorage.setItem(LS_WEIGHT_MODE, parsed.weightMode);
      nextState.weightMode = parsed.weightMode;
    }
    if (parsed.weightEditorMode) {
      localStorage.setItem(LS_WEIGHT_EDITOR_MODE, parsed.weightEditorMode);
      nextState.weightEditorMode = parsed.weightEditorMode;
    }
    if (parsed.sharedDimensionWeightShares) {
      saveSharedDimensionWeightShares(parsed.sharedDimensionWeightShares);
      nextState.sharedDimensionWeightShares = parsed.sharedDimensionWeightShares;
    }
    if (parsed.sharedDimensionWeights) {
      saveSharedDimensionWeights(parsed.sharedDimensionWeights);
      nextState.sharedDimensionWeights = parsed.sharedDimensionWeights;
    }
    saveRatings(data);
    set(nextState);
    return data;
  },

  saveExportFile: async (relativePath, contents) => {
    downloadTextFile(relativePath.split("/").pop(), contents);
    set({ fileStatus: relativePath });
    return relativePath;
  },

  downloadFile: (filename, contents, type) => {
    if (isTauri()) {
      const extension = filename.split(".").pop()?.toLowerCase() || "txt";
      const filters = [{ name: extension.toUpperCase(), extensions: [extension] }];
      if (contents instanceof Uint8Array) {
        return invoke("save_bytes_as", {
          defaultName: filename,
          bytes: Array.from(contents),
          filters,
        }).then(path => {
          if (path) set({ fileStatus: path });
          return path;
        });
      }
      return invoke("save_text_as", {
        defaultName: filename,
        contents,
        filters,
      }).then(path => {
        if (path) set({ fileStatus: path });
        return path;
      });
    }
    if (contents instanceof Uint8Array) {
      downloadBinaryFile(filename, contents, type);
    } else {
      downloadBlob(filename, new Blob([contents], { type }));
    }
    set({ fileStatus: filename });
  },
}));
