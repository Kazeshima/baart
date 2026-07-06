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

export function radarScanPolygon(progress, radius = RADAR_RADIUS * 1.5, spread = 24) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  const angle = RADAR_ANGLES[0] + normalized * 360;
  return radarPolygon([
    [RADAR_CENTER, RADAR_CENTER],
    radarPoint(angle - spread, radius),
    radarPoint(angle + spread, radius),
  ]);
}

export function radarScanPoint(progress, radius = RADAR_RADIUS * 1.35, offsetDegrees = 0) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  return radarPoint(RADAR_ANGLES[0] + normalized * 360 + offsetDegrees, radius);
}
