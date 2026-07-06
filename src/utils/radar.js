export const RADAR_VIEWBOX = 420;
export const RADAR_CENTER = RADAR_VIEWBOX / 2;
export const RADAR_RADIUS = 128;
export const RADAR_LEVELS = 5;
export const RADAR_ANGLES = [-72, 0, 72, 144, 216];

export function radarPoint(angle, radius, center = RADAR_CENTER) {
  const radians = (angle - 90) * (Math.PI / 180);
  return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
}

export function radarPolygon(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

export function radarScanAngle(progress) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  return RADAR_ANGLES[0] + normalized * 360;
}

export function radarScanTrail(progress, segments = 20, trailDegrees = 60, radius = RADAR_RADIUS) {
  const angle = radarScanAngle(progress);
  const step = trailDegrees / segments;
  return Array.from({ length: segments }, (_, index) => ({
    points: radarPolygon([
      [RADAR_CENTER, RADAR_CENTER],
      radarPoint(angle - index * step, radius),
      radarPoint(angle - (index + 1) * step, radius),
    ]),
    opacity: ((segments - index) / segments) ** 2,
  }));
}

export function radarScanPoint(progress, radius = RADAR_RADIUS, offsetDegrees = 0) {
  return radarPoint(radarScanAngle(progress) + offsetDegrees, radius);
}
