export const PRODUCTION_ASSET_LAYERS = Object.freeze([
  "decorations",
  "portrait",
  "specs",
  "comments",
  "radar",
  "overall",
]);

export const DEFAULT_PRODUCTION_ASSET_LAYER_SETTINGS = Object.freeze(Object.fromEntries(
  PRODUCTION_ASSET_LAYERS.map(layer => [layer, Object.freeze({ x: 0, y: 0, scale: 1, opacity: 1 })]),
));

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeProductionAssetLayers(value) {
  if (!Array.isArray(value)) return [...PRODUCTION_ASSET_LAYERS];
  return PRODUCTION_ASSET_LAYERS.filter(layer => value.includes(layer));
}

export function normalizeProductionAssetStudentIds(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(id => Number.isInteger(id) && id > 0))];
}

export function normalizeProductionAssetLayerSettings(value = {}) {
  return Object.fromEntries(PRODUCTION_ASSET_LAYERS.map(layer => {
    const raw = value?.[layer] || {};
    return [layer, {
      x: clamp(finiteOr(raw.x, 0), -1920, 1920),
      y: clamp(finiteOr(raw.y, 0), -1080, 1080),
      scale: clamp(finiteOr(raw.scale, 1), 0.1, 3),
      opacity: clamp(finiteOr(raw.opacity, 1), 0, 1),
    }];
  }));
}

export function selectedProductionAssetRecords(records, selectedStudentIds) {
  const selected = normalizeProductionAssetStudentIds(selectedStudentIds);
  if (selected === null) return records;
  const ids = new Set(selected);
  return records.filter(record => ids.has(Number(record.student.id)));
}

export function safeAssetPathSegment(value, fallback = "asset") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || fallback;
}

export function productionAssetStudentFolder(record) {
  const id = Number(record.student.id);
  const name = safeAssetPathSegment(record.student.devName || record.student.name, "student");
  return `${id}-${name}`;
}

export function buildProductionAssetTasks(records, settings) {
  const selectedRecords = selectedProductionAssetRecords(records, settings.productionAssetStudentIds);
  const layers = normalizeProductionAssetLayers(settings.productionAssetLayers);
  return selectedRecords.flatMap(record => layers.map(layer => ({
    id: `${record.student.id}:${layer}`,
    studentId: Number(record.student.id),
    studentFolder: productionAssetStudentFolder(record),
    layer,
    record,
  })));
}

export function productionAssetTaskOutput(root, task, format) {
  const segments = [root, task.studentFolder, task.layer];
  if (format === "prores") {
    return [...segments, `${task.studentFolder}-${task.layer}.mov`];
  }
  return segments;
}

export function productionAssetLayerStyle(settings, layer) {
  const value = normalizeProductionAssetLayerSettings(settings)[layer];
  return {
    opacity: value.opacity,
    transform: `translate(${value.x}px, ${value.y}px) scale(${value.scale})`,
    transformOrigin: "center center",
  };
}
