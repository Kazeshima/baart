import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  WEIGHT_EDITOR_MODES,
  WEIGHT_MODES,
  adjustFineWeightShare,
  adjustDimensionWeightShare,
  computeOverallScore,
  formatWeightShare,
  hasIncompleteFineWeights,
  normalizeFineWeightState,
  normalizeDimensionWeightShares,
  normalizeDimensionWeights,
  resolveDimensionWeightShares,
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

test("slider redistribution is proportional and preserves exact total", () => {
  const adjusted = adjustDimensionWeightShare({
    blindshot: 40,
    counter: 30,
    defense: 20,
    counterDef: 10,
    cost: 0,
  }, "cost", 20);
  assert.deepEqual(adjusted, {
    blindshot: 32,
    counter: 24,
    defense: 16,
    counterDef: 8,
    cost: 20,
  });

  const decreased = adjustDimensionWeightShare({
    blindshot: 40,
    counter: 20,
    defense: 20,
    counterDef: 20,
    cost: 0,
  }, "blindshot", 10);
  assert.equal(decreased.blindshot, 10);
  assert.equal(decreased.counter, 30);
  assert.equal(decreased.defense, 30);
  assert.equal(decreased.counterDef, 30);
  assert.equal(decreased.cost, 0);
  assert.equal(Object.values(decreased).reduce((sum, value) => sum + value, 0), 100);
});

test("shared weight mode overrides individual shares while individual mode preserves them", () => {
  const ratings = {
    ...complete,
    dimensionWeightShares: { blindshot: 100, counter: 0, defense: 0, counterDef: 0, cost: 0 },
  };
  const shared = { blindshot: 0, counter: 0, defense: 0, counterDef: 0, cost: 100 };
  assert.deepEqual(resolveDimensionWeightShares(ratings, { weightMode: WEIGHT_MODES.shared, weightEditorMode: WEIGHT_EDITOR_MODES.fine, sharedDimensionWeightShares: shared }), shared);
  assert.deepEqual(resolveDimensionWeightShares(ratings, { weightMode: WEIGHT_MODES.individual, weightEditorMode: WEIGHT_EDITOR_MODES.fine }), {
    blindshot: 100,
    counter: 0,
    defense: 0,
    counterDef: 0,
    cost: 0,
  });
  assert.equal(computeOverallScore(ratings, { weightMode: WEIGHT_MODES.shared, weightEditorMode: WEIGHT_EDITOR_MODES.fine, sharedDimensionWeightShares: shared }), 1);
  assert.equal(computeOverallScore(ratings, { weightMode: WEIGHT_MODES.individual, weightEditorMode: WEIGHT_EDITOR_MODES.fine }), 5);
});

test("fine weight budget only changes the edited dimension and unassigned pool", () => {
  const current = { blindshot: 20, counter: 20, defense: 20, counterDef: 20, cost: 10 };
  const state = normalizeFineWeightState({ dimensionWeightShares: current });
  assert.equal(state.unassignedWeightShare, 10);
  const increased = adjustFineWeightShare(current, "cost", 15);
  assert.deepEqual(increased.dimensionWeightShares, { blindshot: 20, counter: 20, defense: 20, counterDef: 20, cost: 15 });
  assert.equal(increased.unassignedWeightShare, 5);
  const capped = adjustFineWeightShare(increased.dimensionWeightShares, "cost", 30);
  assert.equal(capped.dimensionWeightShares.cost, 20);
  assert.equal(capped.unassignedWeightShare, 0);
  const decreased = adjustFineWeightShare(capped.dimensionWeightShares, "counter", 12.5);
  assert.equal(decreased.dimensionWeightShares.counter, 12.5);
  assert.equal(decreased.dimensionWeightShares.blindshot, 20);
  assert.equal(decreased.unassignedWeightShare, 7.5);
});

test("fine weight illegal input clamps the edited dimension without moving others", () => {
  const current = { blindshot: 25, counter: 20, defense: 20, counterDef: 20, cost: 10 };
  const adjusted = adjustFineWeightShare(current, "cost", 100);
  assert.deepEqual(adjusted.dimensionWeightShares, { blindshot: 25, counter: 20, defense: 20, counterDef: 20, cost: 15 });
  assert.equal(adjusted.unassignedWeightShare, 0);

  const negative = adjustFineWeightShare(current, "blindshot", -50);
  assert.deepEqual(negative.dimensionWeightShares, { blindshot: 0, counter: 20, defense: 20, counterDef: 20, cost: 10 });
  assert.equal(negative.unassignedWeightShare, 30);
});

test("fine mode blocks scoring until all weight is assigned", () => {
  const incomplete = {
    ...complete,
    dimensionWeightShares: { blindshot: 20, counter: 20, defense: 20, counterDef: 20, cost: 10 },
  };
  assert.equal(hasIncompleteFineWeights(incomplete), true);
  assert.equal(computeOverallScore(incomplete, { weightEditorMode: WEIGHT_EDITOR_MODES.fine }), null);
  const completeFine = { ...incomplete, dimensionWeightShares: { ...incomplete.dimensionWeightShares, cost: 20 } };
  assert.equal(hasIncompleteFineWeights(completeFine), false);
  assert.equal(computeOverallScore(completeFine, { weightEditorMode: WEIGHT_EDITOR_MODES.fine }), 3);
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
