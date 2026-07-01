import { DIMENSIONS, TIER_SCORES } from "./constants.js";

export const WEIGHT_VALUES = Object.freeze({
  none: 0,
  half: 0.5,
  full: 1,
});

export const DEFAULT_DIMENSION_WEIGHTS = Object.freeze({
  blindshot: "full",
  counter: "full",
  defense: "full",
  counterDef: "full",
  cost: "half",
});

export function normalizeDimensionWeights(ratings = {}) {
  const supplied = ratings.dimensionWeights || {};
  const legacyCost = Object.hasOwn(WEIGHT_VALUES, ratings.costWeight)
    ? ratings.costWeight
    : DEFAULT_DIMENSION_WEIGHTS.cost;

  return Object.fromEntries(DIMENSIONS.map(({ key }) => {
    const fallback = key === "cost" ? legacyCost : DEFAULT_DIMENSION_WEIGHTS[key];
    const value = supplied[key];
    return [key, Object.hasOwn(WEIGHT_VALUES, value) ? value : fallback];
  }));
}

export function computeOverallScore(ratings) {
  const dimensionWeights = normalizeDimensionWeights(ratings);
  const weighted = DIMENSIONS.flatMap(({ key }) => {
    const tier = ratings[key];
    const weight = WEIGHT_VALUES[dimensionWeights[key]];
    if (tier === null || tier === undefined || !Object.hasOwn(TIER_SCORES, tier) || weight === 0) return [];
    return [{ score: TIER_SCORES[tier], weight }];
  });

  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  return weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

export function computeOverallLevel(score) {
  if (score === null) return null;
  if (score >= 4) return 4;
  if (score >= 3) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function recalculateRatings(ratings) {
  const dimensionWeights = normalizeDimensionWeights(ratings);
  const overallScore = computeOverallScore({ ...ratings, dimensionWeights });
  return {
    ...ratings,
    dimensionWeights,
    costWeight: dimensionWeights.cost,
    overallScore,
    overall: ratings.overallAuto === false ? ratings.overall : computeOverallLevel(overallScore),
  };
}

export function weightMultiplier(weight) {
  return WEIGHT_VALUES[weight] ?? 0;
}
