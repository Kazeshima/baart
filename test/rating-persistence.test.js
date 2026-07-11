import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DIMENSION_WEIGHT_SHARES } from "../src/utils/constants.js";
import {
  RATING_STORAGE_KEYS,
  createRatingsExportPayload,
  normalizeRatingCollection,
  parseRatingsPayload,
  persistImportedRatingPayload,
  persistRatingOrder,
  persistRatings,
  persistSharedWeightSettings,
  readRatingOrder,
  readRatings,
  readRatingsPayload,
  readSharedWeightSettings,
  readStoredJson,
  writeStoredValue,
} from "../src/store/ratingPersistence.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("rating persistence reads legacy and versioned payloads through one contract", () => {
  const legacy = parseRatingsPayload({ 10001: { blindshot: 5, costWeight: "half" } });
  assert.equal(legacy.weightMode, null);
  assert.equal(legacy.weightEditorMode, "preset");
  assert.ok(Object.hasOwn(legacy.ratings, "10001"));

  const versioned = parseRatingsPayload({
    version: 2,
    weightMode: "shared",
    weightEditorMode: "fine",
    sharedDimensionWeightShares: DEFAULT_DIMENSION_WEIGHT_SHARES,
    ratingOrder: { mode: "score", direction: "desc", manualIds: [] },
    ratings: { 10001: { blindshot: 5 } },
  });
  assert.equal(versioned.weightMode, "shared");
  assert.equal(versioned.weightEditorMode, "fine");
  assert.equal(versioned.ratingOrder.mode, "score");
});

test("editor and Video Studio storage adapters resolve the same weights and order", () => {
  const storage = new MemoryStorage();
  const shares = { blindshot: 25, counter: 20, defense: 20, counterDef: 20, cost: 15 };
  persistSharedWeightSettings({
    weightMode: "shared",
    weightEditorMode: "fine",
    sharedDimensionWeightShares: shares,
  }, storage);
  persistRatingOrder({ mode: "manual", direction: "asc", manualIds: [10121, 10001] }, storage);

  assert.deepEqual(readSharedWeightSettings({}, storage).sharedDimensionWeightShares, shares);
  assert.deepEqual(readRatingOrder(undefined, storage), { mode: "manual", direction: "asc", manualIds: [10121, 10001] });
  assert.equal(storage.getItem(RATING_STORAGE_KEYS.weightMode), "shared");
});

test("import persistence updates ratings, weights, and order atomically for consumers", () => {
  const storage = new MemoryStorage();
  const parsed = parseRatingsPayload({
    version: 2,
    weightMode: "shared",
    weightEditorMode: "preset",
    sharedDimensionWeights: { blindshot: "full", counter: "full", defense: "half", counterDef: "full", cost: "none" },
    ratingOrder: { mode: "id", direction: "desc", manualIds: [] },
    ratings: { 10001: { blindshot: 5, notes: "stored" } },
  });
  const normalized = normalizeRatingCollection(parsed.ratings);
  const statePatch = persistImportedRatingPayload(parsed, normalized, storage);

  assert.equal(statePatch.weightEditorMode, "preset");
  assert.equal(readRatingsPayload(storage).ratings[10001].notes, "stored");
  assert.equal(readRatings(storage)[10001].notes, "stored");
  assert.equal(readSharedWeightSettings({}, storage).sharedDimensionWeights.cost, "none");
  assert.equal(readRatingOrder(undefined, storage).direction, "desc");
});

test("storage helpers tolerate malformed JSON and export the versioned schema", () => {
  const storage = new MemoryStorage();
  writeStoredValue("broken", "{not-json", storage);
  assert.deepEqual(readStoredJson("broken", { safe: true }, storage), { safe: true });
  persistRatings({ 10001: { notes: "ok" } }, storage);
  const payload = createRatingsExportPayload({
    weightMode: "shared",
    weightEditorMode: "fine",
    sharedDimensionWeightShares: DEFAULT_DIMENSION_WEIGHT_SHARES,
    sharedDimensionWeights: { blindshot: "full", counter: "full", defense: "full", counterDef: "full", cost: "half" },
    ratingOrder: { mode: "chronological", direction: "asc", manualIds: [] },
    allRatings: readRatings(storage),
  });
  assert.equal(payload.version, 2);
  assert.equal(payload.ratings[10001].notes, "ok");
  assert.equal(payload.sharedUnassignedWeightShare, 0);
});
