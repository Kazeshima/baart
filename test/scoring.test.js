import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  adjustDimensionWeightShare,
  computeOverallScore,
  formatWeightShare,
  normalizeDimensionWeightShares,
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
  assert.deepEqual(normalizeDimensionWeightShares({}), {
    blindshot: 22.3,
    counter: 22.2,
    defense: 22.2,
    counterDef: 22.2,
    cost: 11.1,
  });
  assert.equal(Number(computeOverallScore(complete).toFixed(3)), 3.224);
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
  assert.deepEqual(normalizeDimensionWeightShares(ratings), {
    blindshot: 0,
    counter: 20,
    defense: 40,
    counterDef: 40,
    cost: 0,
  });
  assert.equal(computeOverallScore(ratings), 2.8);
});

test("normalizes supplied shares and preserves a 5.0 maximum", () => {
  const allS = {
    blindshot: "S",
    counter: "S",
    defense: "S",
    counterDef: "S",
    cost: "S",
    dimensionWeightShares: { blindshot: 25, counter: 15, defense: 20, counterDef: 20, cost: 20 },
  };
  assert.equal(computeOverallScore(allS), 5);
  assert.deepEqual(normalizeDimensionWeightShares(allS), { blindshot: 25, counter: 15, defense: 20, counterDef: 20, cost: 20 });
});

test("slider redistribution keeps percentage shares normalized", () => {
  const current = normalizeDimensionWeightShares({});
  const adjusted = adjustDimensionWeightShare(current, "cost", 20);
  assert.equal(Object.values(adjusted).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(adjusted.cost, 20);
  assert.equal(formatWeightShare(adjusted.cost), "20%");
  assert.deepEqual(adjustDimensionWeightShare({ blindshot: 100, counter: 0, defense: 0, counterDef: 0, cost: 0 }, "cost", 50), {
    blindshot: 50,
    counter: 0,
    defense: 0,
    counterDef: 0,
    cost: 50,
  });
});

test("automatic mode recalculates the overall tier", () => {
  const result = recalculateRatings({ ...complete, dimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS, cost: "none" } });
  assert.equal(result.overallScore, 3.5);
  assert.equal(result.overall, 3);
});

test("manual mode preserves the selected overall tier", () => {
  const result = recalculateRatings({ ...complete, overallAuto: false, overall: 0 });
  assert.equal(result.overall, 0);
  assert.equal(Number(result.overallScore.toFixed(3)), 3.224);
});
