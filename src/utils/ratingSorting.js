export const RATING_ORDER_STORAGE_KEY = "baart_rating_order";

export const DEFAULT_ORDER = Object.freeze({
  mode: "chronological",
  direction: "asc",
  manualIds: [],
});

export const SORT_MODES = Object.freeze(["chronological", "score", "id", "school", "manual"]);
export const SORT_DIRECTIONS = Object.freeze(["asc", "desc"]);

export function normalizeRatingOrder(value = {}) {
  const mode = SORT_MODES.includes(value?.mode) ? value.mode : DEFAULT_ORDER.mode;
  const direction = SORT_DIRECTIONS.includes(value?.direction) ? value.direction : DEFAULT_ORDER.direction;
  const manualIds = Array.isArray(value?.manualIds)
    ? value.manualIds.map(Number).filter(id => Number.isFinite(id) && id > 0)
    : [];
  return { mode, direction, manualIds };
}

function byId(a, b) {
  return Number(a.student.id) - Number(b.student.id);
}

function chronological(a, b) {
  const aCreated = a.ratings.createdAt;
  const bCreated = b.ratings.createdAt;
  if (!aCreated && !bCreated) return a.legacyOrder - b.legacyOrder;
  if (!aCreated) return -1;
  if (!bCreated) return 1;
  return String(aCreated).localeCompare(String(bCreated)) || byId(a, b);
}

export function sortRatingRecords(records, order = DEFAULT_ORDER) {
  const config = normalizeRatingOrder(order);
  const result = [...records];
  if (config.mode === "manual") {
    const rank = new Map(config.manualIds.map((id, index) => [Number(id), index]));
    result.sort((a, b) => {
      const aRank = rank.has(Number(a.student.id)) ? rank.get(Number(a.student.id)) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(Number(b.student.id)) ? rank.get(Number(b.student.id)) : Number.MAX_SAFE_INTEGER;
      return aRank - bRank || byId(a, b);
    });
    return result;
  }
  if (config.mode === "score") {
    const direction = config.direction === "desc" ? -1 : 1;
    result.sort((a, b) => {
      const aScore = Number(a.ratings.overallScore);
      const bScore = Number(b.ratings.overallScore);
      const aValid = a.ratings.overallScore !== null && a.ratings.overallScore !== undefined && Number.isFinite(aScore);
      const bValid = b.ratings.overallScore !== null && b.ratings.overallScore !== undefined && Number.isFinite(bScore);
      if (!aValid && !bValid) return byId(a, b);
      if (!aValid) return 1;
      if (!bValid) return -1;
      return (aScore - bScore) * direction || byId(a, b);
    });
    return result;
  }
  if (config.mode === "id") result.sort(byId);
  else if (config.mode === "school") {
    result.sort((a, b) => String(a.student.school || "").localeCompare(String(b.student.school || "")) || byId(a, b));
  } else result.sort(chronological);
  if (config.direction === "desc") result.reverse();
  return result;
}

export function ratingRecordsFromStudents(students, allRatings, effectiveAllRatings = allRatings) {
  const legacyOrder = new Map(Object.keys(allRatings || {}).map((id, index) => [Number(id), index]));
  return (students || [])
    .filter(student => Object.hasOwn(allRatings || {}, student.id))
    .map(student => ({
      student,
      ratings: effectiveAllRatings?.[student.id] || allRatings?.[student.id] || {},
      legacyOrder: legacyOrder.get(Number(student.id)) ?? Number.MAX_SAFE_INTEGER,
    }));
}
