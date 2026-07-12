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

export function radarScanBeam(progress, options = {}) {
  const center = Number(options.center ?? RADAR_CENTER);
  const radius = Number(options.radius ?? RADAR_RADIUS);
  const centerWidth = Math.max(0, Number(options.centerWidth ?? 7));
  const edgeWidth = Math.max(0, Number(options.edgeWidth ?? 1.2));
  const end = radarScanPoint(progress, radius);
  const dx = end[0] - center;
  const dy = end[1] - center;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const startHalf = centerWidth / 2;
  const endHalf = edgeWidth / 2;
  const start = [center, center];
  const points = [
    [center + normalX * startHalf, center + normalY * startHalf],
    [end[0] + normalX * endHalf, end[1] + normalY * endHalf],
    [end[0] - normalX * endHalf, end[1] - normalY * endHalf],
    [center - normalX * startHalf, center - normalY * startHalf],
  ];
  return { start, end, points, polygon: radarPolygon(points) };
}

export const RADAR_RIPPLE_TIER_STRENGTH = Object.freeze({
  S: 1,
  A: 0.78,
  B: 0.56,
  C: 0.34,
  D: 0.14,
  E: 0,
});

export function radarRippleProfile(tier, options = {}) {
  const strength = RADAR_RIPPLE_TIER_STRENGTH[tier] || 0;
  if (strength <= 0) return { strength: 0, count: 0, durationScale: 0, radiusScale: 0, opacityScale: 0, strokeWidth: 0 };
  const baseCount = Math.max(0, Math.round(Number(options.count ?? 3)));
  return {
    strength,
    count: Math.max(1, Math.round(baseCount * strength)),
    durationScale: 0.42 + strength * 0.58,
    radiusScale: 0.48 + strength * 0.52,
    opacityScale: strength ** 1.25,
    strokeWidth: 1 + strength * 1.4,
  };
}

export function radarRevealCircle(targetPoint, progress, maxRadius = 4) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  return {
    cx: targetPoint[0],
    cy: targetPoint[1],
    r: maxRadius * normalized,
    opacity: normalized,
  };
}
