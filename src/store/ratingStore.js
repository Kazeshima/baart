import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { DEFAULT_RATINGS, TIER_SCORES } from "../utils/constants.js";

const LS_LANG = "ba_rating_lang";
const LS_UI_LANG = "ba_rating_ui_lang";
const LS_SEASON = "ba_rating_season";
const LS_ARENA_SEASON = "ba_rating_arena_season";
const LS_THEME = "ba_rating_theme";
const RATINGS_KEY = "ba_pvp_ratings";  // localStorage key for all saved ratings
const RATINGS_FILE = "ratings/ba_pvp_ratings.json";

function loadRatings() {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}"); }
  catch { return {}; }
}
function saveRatings(r) {
  localStorage.setItem(RATINGS_KEY, JSON.stringify(r));
}

function normalizeRatings(ratings) {
  const normalized = { ...DEFAULT_RATINGS(), ...ratings };
  if (typeof normalized.overall === "string") {
    const legacy = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 };
    normalized.overall = legacy[normalized.overall] ?? null;
  }
  if (!["none", "half", "full"].includes(normalized.costWeight)) {
    normalized.costWeight = "half";
  }
  if (normalized.overallAuto) {
    normalized.overall = computeOverall(normalized);
  }
  normalized.overallScore = computeOverallScore(normalized);
  return normalized;
}

function computeOverallScore(ratings) {
  const dims = ["blindshot", "counter", "defense", "counterDef"];
  const weights = dims.map(key => ({ key, weight: 1 }));
  if (ratings.costWeight === "full") weights.push({ key: "cost", weight: 1 });
  if (ratings.costWeight === "half") weights.push({ key: "cost", weight: 0.5 });

  const available = weights.filter(({ key }) => ratings[key] !== null);
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return available.reduce((sum, item) => sum + TIER_SCORES[ratings[item.key]] * item.weight, 0) / totalWeight;
}

// Compute five-level overall result from dimension ratings.
function computeOverall(ratings) {
  const avg = computeOverallScore(ratings);
  if (avg === null) return null;

  if (avg >= 4) return 4;
  if (avg >= 3) return 3;
  if (avg >= 2) return 2;
  if (avg >= 1) return 1;
  return 0;
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
    return normalizeRatings(s.allRatings[s.selectedStudent.id] || {});
  },

  // Update one dimension rating
  setDimensionRating: (dim, tier) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const existing = normalizeRatings(s.allRatings[id] || {});
    const updated = { ...existing, [dim]: tier };
    // Auto-compute overall if auto mode
    if (updated.overallAuto) {
      updated.overall = computeOverall(updated);
    }
    updated.overallScore = computeOverallScore(updated);
    const allRatings = { ...s.allRatings, [id]: updated };
    set({ allRatings });
    // Auto-save on every change
    saveRatings(allRatings);
  },

  setOverallRating: (tier) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const existing = normalizeRatings(s.allRatings[id] || {});
    const updated = { ...existing, overall: tier, overallAuto: false, overallScore: computeOverallScore(existing) };
    const allRatings = { ...s.allRatings, [id]: updated };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setOverallAuto: (auto) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const existing = normalizeRatings(s.allRatings[id] || {});
    const updated = { ...existing, overallAuto: auto };
    if (auto) updated.overall = computeOverall(updated);
    updated.overallScore = computeOverallScore(updated);
    const allRatings = { ...s.allRatings, [id]: updated };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setCostWeight: (costWeight) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const existing = normalizeRatings(s.allRatings[id] || {});
    const updated = { ...existing, costWeight };
    if (updated.overallAuto) {
      updated.overall = computeOverall(updated);
    }
    updated.overallScore = computeOverallScore(updated);
    const allRatings = { ...s.allRatings, [id]: updated };
    set({ allRatings });
    saveRatings(allRatings);
  },

  setNotes: (notes) => {
    const s = get();
    if (!s.selectedStudent) return;
    const id = s.selectedStudent.id;
    const existing = normalizeRatings(s.allRatings[id] || {});
    const updated = { ...existing, notes };
    const allRatings = { ...s.allRatings, [id]: updated };
    set({ allRatings });
    saveRatings(allRatings);
  },

  // Manual save (also done automatically, but useful for export)
  saveAllRatings: async () => {
    saveRatings(get().allRatings);
    const contents = JSON.stringify(get().allRatings, null, 2);
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
      const data = JSON.parse(jsonText);
      saveRatings(data);
      set({ allRatings: data });
      return true;
    } catch { return false; }
  },

  loadRatingsFromFile: async () => {
    if (!isTauri()) return null;
    const text = await invoke("open_text_file", { filters: JSON_FILTER });
    if (!text) return null;
    const data = JSON.parse(text);
    saveRatings(data);
    set({ allRatings: data, fileStatus: "loaded JSON" });
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
