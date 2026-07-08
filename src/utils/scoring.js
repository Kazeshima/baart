import { DEFAULT_DIMENSION_WEIGHT_SHARES, DIMENSIONS, TIER_SCORES } from "./constants.js";

export const WEIGHT_VALUES = Object.freeze({
  none: 0,
  half: 0.5,
  full: 1,
});

export const WEIGHT_MODES = Object.freeze({
  shared: "shared",
  individual: "individual",
});

export const WEIGHT_EDITOR_MODES = Object.freeze({
  fine: "fine",
  preset: "preset",
});

export const DEFAULT_DIMENSION_WEIGHTS = Object.freeze({
  blindshot: "full",
  counter: "full",
  defense: "full",
  counterDef: "full",
  cost: "half",
});

export const WEIGHT_SHARE_TOTAL = 100;
const SHARE_PRECISION = 10;
const TOTAL_TENTHS = WEIGHT_SHARE_TOTAL * SHARE_PRECISION;

function normalizeShareTenths(rawShares) {
  const values = DIMENSIONS.map(({ key }) => {
    const value = Number(rawShares?.[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return DIMENSIONS.map(({ key }) => Math.round((DEFAULT_DIMENSION_WEIGHT_SHARES[key] || 0) * SHARE_PRECISION));
  }
  const exact = values.map(value => (value / total) * WEIGHT_SHARE_TOTAL * SHARE_PRECISION);
  const floors = exact.map(Math.floor);
  let remainder = WEIGHT_SHARE_TOTAL * SHARE_PRECISION - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i += 1) {
    floors[order[i % order.length].index] += 1;
  }
  return floors;
}

export function normalizeDimensionWeightShares(ratings = {}) {
  if (ratings.dimensionWeightShares && typeof ratings.dimensionWeightShares === "object") {
    const tenths = normalizeShareTenths(ratings.dimensionWeightShares);
    return Object.fromEntries(DIMENSIONS.map(({ key }, index) => [key, tenths[index] / SHARE_PRECISION]));
  }
  const dimensionWeights = normalizeDimensionWeights(ratings);
  const rawShares = Object.fromEntries(DIMENSIONS.map(({ key }) => [key, WEIGHT_VALUES[dimensionWeights[key]] ?? 0]));
  const tenths = normalizeShareTenths(rawShares);
  return Object.fromEntries(DIMENSIONS.map(({ key }, index) => [key, tenths[index] / SHARE_PRECISION]));
}

function roundTenths(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * SHARE_PRECISION)) : 0;
}

function sharesFromTenths(tenths) {
  return Object.fromEntries(DIMENSIONS.map(({ key }, index) => [key, (tenths[index] || 0) / SHARE_PRECISION]));
}

export function normalizeFineWeightState(value = {}) {
  const source = value.dimensionWeightShares || value;
  let tenths = DIMENSIONS.map(({ key }) => roundTenths(source?.[key]));
  const total = tenths.reduce((sum, item) => sum + item, 0);
  if (total > TOTAL_TENTHS) {
    const exact = tenths.map(item => (item / total) * TOTAL_TENTHS);
    const floors = exact.map(Math.floor);
    let remainder = TOTAL_TENTHS - floors.reduce((sum, item) => sum + item, 0);
    const order = exact
      .map((item, index) => ({ index, fraction: item - floors[index] }))
      .sort((a, b) => b.fraction - a.fraction);
    for (let i = 0; i < remainder; i += 1) floors[order[i % order.length].index] += 1;
    tenths = floors;
  }
  const assignedTenths = tenths.reduce((sum, item) => sum + item, 0);
  return {
    dimensionWeightShares: sharesFromTenths(tenths),
    unassignedWeightShare: (TOTAL_TENTHS - assignedTenths) / SHARE_PRECISION,
  };
}

export function hasIncompleteFineWeights(value = {}) {
  return normalizeFineWeightState(value).unassignedWeightShare > 0;
}

export function normalizeWeightMode(value) {
  return value === WEIGHT_MODES.individual ? WEIGHT_MODES.individual : WEIGHT_MODES.shared;
}

export function normalizeWeightEditorMode(value) {
  return value === WEIGHT_EDITOR_MODES.preset ? WEIGHT_EDITOR_MODES.preset : WEIGHT_EDITOR_MODES.fine;
}

export function resolveDimensionWeightShares(ratings = {}, options = {}) {
  const mode = options.weightMode === undefined ? WEIGHT_MODES.individual : normalizeWeightMode(options.weightMode);
  const editorMode = normalizeWeightEditorMode(options.weightEditorMode || WEIGHT_EDITOR_MODES.preset);
  if (editorMode === WEIGHT_EDITOR_MODES.preset) {
    if (mode === WEIGHT_MODES.shared && options.sharedDimensionWeights) {
      return normalizeDimensionWeightShares({ dimensionWeights: options.sharedDimensionWeights });
    }
    return normalizeDimensionWeightShares({ ...ratings, dimensionWeightShares: undefined });
  }
  if (mode === WEIGHT_MODES.shared) {
    return normalizeFineWeightState({ dimensionWeightShares: options.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES }).dimensionWeightShares;
  }
  return normalizeFineWeightState(ratings).dimensionWeightShares;
}

export function formatWeightShare(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)}%`;
}

export function adjustDimensionWeightShare(currentShares, changedKey, nextValue) {
  const current = normalizeDimensionWeightShares({ dimensionWeightShares: currentShares });
  const target = Math.max(0, Math.min(WEIGHT_SHARE_TOTAL, Number(nextValue)));
  const currentValue = current[changedKey] ?? 0;
  const delta = target - currentValue;
  if (Math.abs(delta) < 0.0001) return current;

  const otherKeys = DIMENSIONS.map(({ key }) => key).filter(key => key !== changedKey);
  const others = otherKeys.map(key => current[key] ?? 0);
  const otherTotal = others.reduce((sum, value) => sum + value, 0);
  const result = { ...current, [changedKey]: target };

  if (delta > 0) {
    const available = otherTotal;
    const actualDelta = Math.min(delta, available);
    result[changedKey] = currentValue + actualDelta;
    for (const key of otherKeys) {
      const share = available > 0 ? (current[key] || 0) / available : 1 / otherKeys.length;
      result[key] = Math.max(0, (current[key] || 0) - actualDelta * share);
    }
  } else {
    const increase = -delta;
    for (const key of otherKeys) {
      const share = otherTotal > 0 ? (current[key] || 0) / otherTotal : 1 / otherKeys.length;
      result[key] = (current[key] || 0) + increase * share;
    }
  }

  return normalizeDimensionWeightShares({ dimensionWeightShares: result });
}

export function adjustFineWeightShare(currentShares, changedKey, nextValue) {
  const current = normalizeFineWeightState({ dimensionWeightShares: currentShares });
  const currentValue = current.dimensionWeightShares[changedKey] ?? 0;
  const max = currentValue + current.unassignedWeightShare;
  const target = Math.max(0, Math.min(max, Number(nextValue)));
  const nextShares = { ...current.dimensionWeightShares, [changedKey]: Number.isFinite(target) ? target : currentValue };
  return normalizeFineWeightState({ dimensionWeightShares: nextShares });
}

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

export function computeOverallScore(ratings, options = {}) {
  const editorMode = normalizeWeightEditorMode(options.weightEditorMode || WEIGHT_EDITOR_MODES.preset);
  const mode = options.weightMode === undefined ? WEIGHT_MODES.individual : normalizeWeightMode(options.weightMode);
  if (editorMode === WEIGHT_EDITOR_MODES.fine) {
    const fineState = mode === WEIGHT_MODES.shared
      ? normalizeFineWeightState({ dimensionWeightShares: options.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES })
      : normalizeFineWeightState(ratings);
    if (fineState.unassignedWeightShare > 0) return null;
  }
  const dimensionWeightShares = resolveDimensionWeightShares(ratings, options);
  const weighted = DIMENSIONS.flatMap(({ key }) => {
    const tier = ratings[key];
    const share = dimensionWeightShares[key];
    if (tier === null || tier === undefined || !Object.hasOwn(TIER_SCORES, tier) || share === 0) return [];
    return [{ score: TIER_SCORES[tier], share }];
  });

  if (weighted.length === 0) return null;
  const totalShare = weighted.reduce((sum, item) => sum + item.share, 0);
  return weighted.reduce((sum, item) => sum + item.score * item.share, 0) / totalShare;
}

export function computeOverallLevel(score) {
  if (score === null) return null;
  if (score >= 4) return 4;
  if (score >= 3) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function recalculateRatings(ratings, options = {}) {
  const dimensionWeights = normalizeDimensionWeights(ratings);
  const editorMode = normalizeWeightEditorMode(options.weightEditorMode || WEIGHT_EDITOR_MODES.preset);
  const dimensionWeightShares = resolveDimensionWeightShares({ ...ratings, dimensionWeights }, options);
  const overallScore = computeOverallScore({ ...ratings, dimensionWeights, dimensionWeightShares }, {
    ...options,
    weightMode: editorMode === WEIGHT_EDITOR_MODES.preset ? WEIGHT_MODES.individual : options.weightMode,
  });
  const unassignedWeightShare = editorMode === WEIGHT_EDITOR_MODES.fine
    ? (options.weightMode === WEIGHT_MODES.shared
        ? normalizeFineWeightState({ dimensionWeightShares: options.sharedDimensionWeightShares || DEFAULT_DIMENSION_WEIGHT_SHARES }).unassignedWeightShare
        : normalizeFineWeightState({ dimensionWeightShares }).unassignedWeightShare)
    : 0;
  return {
    ...ratings,
    dimensionWeights,
    dimensionWeightShares,
    unassignedWeightShare,
    weightEditorMode: editorMode,
    costWeight: dimensionWeights.cost,
    overallScore,
    overall: ratings.overallAuto === false ? ratings.overall : computeOverallLevel(overallScore),
  };
}

export function weightMultiplier(weight) {
  return WEIGHT_VALUES[weight] ?? 0;
}
