import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  computeOverallScore,
  normalizeDimensionWeights,
  recalculateRatings,
} from "../src/utils/scoring.js";

const complete = {
  blindshot: "S",
  counter: "A",
  defense: "B",
  counterDef: "C",
  cost: "D",
  overallAuto: true,
};

test("uses full combat weights and half cost by default", () => {
  assert.deepEqual(normalizeDimensionWeights({}), DEFAULT_DIMENSION_WEIGHTS);
  assert.equal(computeOverallScore(complete), 14.5 / 4.5);
});

test("migrates the legacy costWeight field", () => {
  assert.equal(normalizeDimensionWeights({ costWeight: "none" }).cost, "none");
  assert.equal(normalizeDimensionWeights({ costWeight: "full" }).cost, "full");
});

test("supports excluded and half-weight combat dimensions", () => {
  const ratings = {
    ...complete,
    dimensionWeights: {
      blindshot: "none",
      counter: "half",
      defense: "full",
      counterDef: "full",
      cost: "none",
    },
  };
  assert.equal(computeOverallScore(ratings), 7 / 2.5);
});

test("returns null when every rated dimension is excluded", () => {
  const dimensionWeights = Object.fromEntries(Object.keys(DEFAULT_DIMENSION_WEIGHTS).map(key => [key, "none"]));
  assert.equal(computeOverallScore({ ...complete, dimensionWeights }), null);
});

test("automatic mode recalculates the overall tier", () => {
  const result = recalculateRatings({ ...complete, dimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS, cost: "none" } });
  assert.equal(result.overallScore, 3.5);
  assert.equal(result.overall, 3);
});

test("manual mode preserves the selected overall tier", () => {
  const result = recalculateRatings({ ...complete, overallAuto: false, overall: 0 });
  assert.equal(result.overall, 0);
  assert.equal(result.overallScore, 14.5 / 4.5);
});
