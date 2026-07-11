import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { DEFAULT_RATINGS } from "../utils/constants.js";
import {
  WEIGHT_EDITOR_MODES,
  WEIGHT_MODES,
  adjustFineWeightShare,
  normalizeDimensionWeights,
  normalizeWeightEditorMode,
  normalizeWeightMode,
  recalculateRatings,
} from "../utils/scoring.js";
import { timestampRating } from "../utils/ratingTimestamps.js";
import {
  RATING_ORDER_STORAGE_KEYS,
  RATING_STORAGE_KEYS,
  WEIGHT_STORAGE_KEYS,
  createRatingsExportPayload,
  normalizeRatingCollection,
  normalizeStoredRating,
  parseRatingsPayload,
  persistImportedRatingPayload,
  persistRatingOrder,
  persistRatings,
  persistSharedWeightSettings,
  readRatingOrder,
  readRatings,
  readSharedWeightSettings,
  readStoredValue,
  writeStoredValue,
} from "./ratingPersistence.js";

export { RATING_ORDER_STORAGE_KEYS, WEIGHT_STORAGE_KEYS };

function effectiveOptions(state) {
  return {
    weightMode: state.weightMode,
    weightEditorMode: state.weightEditorMode,
    sharedDimensionWeightShares: state.sharedDimensionWeightShares,
    sharedDimensionWeights: state.sharedDimensionWeights,
  };
}

function effectiveRatings(rawRatings, state) {
  return recalculateRatings(normalizeStoredRating(rawRatings || {}), effectiveOptions(state));
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
const initialSharedWeightSettings = readSharedWeightSettings();

export const useRatingStore = create((set, get) => ({
  // Student data
  students: [],
  loading: true,
  error: null,
  language: readStoredValue(RATING_STORAGE_KEYS.dataLanguage, "zh"),
  uiLanguage: readStoredValue(RATING_STORAGE_KEYS.uiLanguage, "zh"),
  theme: readStoredValue(RATING_STORAGE_KEYS.theme, "dark"),

  // Selected student
  selectedStudent: null,

  // Season selector
  season: readStoredValue(RATING_STORAGE_KEYS.season, "Street"),
  arenaSeason: readStoredValue(RATING_STORAGE_KEYS.arenaSeason, "S9"),

  // All saved ratings: { [studentId]: RatingObject }
  allRatings: readRatings(),
  weightMode: initialSharedWeightSettings.weightMode,
  weightEditorMode: initialSharedWeightSettings.weightEditorMode,
  sharedDimensionWeightShares: initialSharedWeightSettings.sharedDimensionWeightShares,
  sharedDimensionWeights: initialSharedWeightSettings.sharedDimensionWeights,
  ratingOrder: readRatingOrder(),
  lastFilePath: "",
  fileStatus: "",

  // Search
  searchQuery: "",
  searchResults: [],

  // Actions
  setLanguage: (lang) => {
    writeStoredValue(RATING_STORAGE_KEYS.dataLanguage, lang);
    set({ language: lang, students: [], loading: true, error: null, selectedStudent: null });
  },
  setUiLanguage: (lang) => {
    writeStoredValue(RATING_STORAGE_KEYS.uiLanguage, lang);
    set({ uiLanguage: lang });
  },
  setTheme: (theme) => {
    writeStoredValue(RATING_STORAGE_KEYS.theme, theme);
    set({ theme });
  },
  setSeason: (season) => {
    writeStoredValue(RATING_STORAGE_KEYS.season, season);
    set({ season });
  },
  setArenaSeason: (arenaSeason) => {
    writeStoredValue(RATING_STORAGE_KEYS.arenaSeason, arenaSeason);
    set({ arenaSeason });
  },
  setWeightMode: (weightMode) => {
    const mode = normalizeWeightMode(weightMode);
    persistSharedWeightSettings({ weightMode: mode });
    set({ weightMode: mode });
  },
  setWeightEditorMode: (weightEditorMode) => {
    const mode = normalizeWeightEditorMode(weightEditorMode);
    persistSharedWeightSettings({ weightEditorMode: mode });
    set({ weightEditorMode: mode });
  },
  setSharedDimensionWeightShare: (dimension, share) => {
    const current = get().sharedDimensionWeightShares;
    const sharedDimensionWeightShares = adjustFineWeightShare(current, dimension, share).dimensionWeightShares;
    persistSharedWeightSettings({ sharedDimensionWeightShares });
    set({ sharedDimensionWeightShares });
  },
  setSharedDimensionWeight: (dimension, weight) => {
    const sharedDimensionWeights = normalizeDimensionWeights({
      dimensionWeights: { ...get().sharedDimensionWeights, [dimension]: weight },
    });
    persistSharedWeightSettings({ sharedDimensionWeights });
    set({ sharedDimensionWeights });
  },
  syncSharedWeightSettingsFromStorage: () => {
    set(readSharedWeightSettings(get()));
  },
  setRatingOrder: (order) => {
    const ratingOrder = persistRatingOrder(order);
    set({ ratingOrder });
  },
  syncRatingOrderFromStorage: () => {
    set({ ratingOrder: readRatingOrder() });
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
    persistRatings(allRatings);
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
    persistRatings(allRatings);
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
    persistRatings(allRatings);
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
    persistRatings(allRatings);
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
    persistRatings(allRatings);
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
    persistRatings(allRatings);
  },

  // Manual save (also done automatically, but useful for export)
  saveAllRatings: async () => {
    persistRatings(get().allRatings);
    const contents = JSON.stringify(createRatingsExportPayload(get()), null, 2);
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
      set({ allRatings: data, ...persistImportedRatingPayload(parsed, data) });
      return true;
    } catch { return false; }
  },

  loadRatingsFromFile: async () => {
    if (!isTauri()) return null;
    const text = await invoke("open_text_file", { filters: JSON_FILTER });
    if (!text) return null;
    const parsed = parseRatingsPayload(JSON.parse(text));
    const data = normalizeRatingCollection(parsed.ratings);
    set({ allRatings: data, fileStatus: "loaded JSON", ...persistImportedRatingPayload(parsed, data) });
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
