export const DEFAULT_ORDER = Object.freeze({
  mode: "chronological",
  direction: "asc",
  manualIds: [],
});

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
  const config = { ...DEFAULT_ORDER, ...order };
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
  if (config.mode === "id") result.sort(byId);
  else if (config.mode === "school") {
    result.sort((a, b) => String(a.student.school || "").localeCompare(String(b.student.school || "")) || byId(a, b));
  } else result.sort(chronological);
  if (config.direction === "desc") result.reverse();
  return result;
}
