export function timestampRating(updated, isNew, now = new Date().toISOString()) {
  return {
    ...updated,
    ...(isNew && !updated.createdAt ? { createdAt: now } : {}),
    updatedAt: now,
  };
}
