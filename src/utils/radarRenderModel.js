import { RADAR_ANGLES, RADAR_LEVELS } from "./radar.js";

function polarPoint(angle, radius, centerX, centerY) {
  const radians = (angle - 90) * (Math.PI / 180);
  return [centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)];
}

export function createRadarRenderModel(dimensions, options = {}) {
  const centerX = Number(options.centerX ?? 210);
  const centerY = Number(options.centerY ?? centerX);
  const radius = Number(options.radius ?? 128);
  const labelRadius = Number(options.labelRadius ?? radius + 58);
  const angles = options.angles || RADAR_ANGLES;
  const levels = Number(options.levels ?? RADAR_LEVELS);

  const pointAt = (angle, pointRadius) => polarPoint(angle, pointRadius, centerX, centerY);
  const rings = Array.from({ length: levels }, (_, index) => (
    angles.map(angle => pointAt(angle, radius * ((index + 1) / levels)))
  ));
  const axes = angles.map(angle => pointAt(angle, radius));
  const labels = angles.map(angle => pointAt(angle, labelRadius));
  const data = dimensions.map((dimension, index) => ({
    ...dimension,
    point: pointAt(angles[index], radius * (Number(dimension.score || 0) / 5)),
    labelPoint: labels[index],
  }));

  return Object.freeze({ centerX, centerY, radius, angles, rings, axes, labels, data });
}

export function revealRadarPoints(model, progress = 1) {
  return model.data.map(({ point }) => [
    model.centerX + (point[0] - model.centerX) * progress,
    model.centerY + (point[1] - model.centerY) * progress,
  ]);
}
