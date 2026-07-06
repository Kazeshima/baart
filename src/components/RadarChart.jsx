import { DIMENSIONS, TIER_SCORES, TIER_COLORS, OVERALL_COLORS } from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor } from "../utils/i18n.js";
import {
  RADAR_ANGLES, RADAR_CENTER, RADAR_LEVELS, RADAR_RADIUS, RADAR_VIEWBOX,
  radarPoint, radarPolygon, radarScanPoint, radarScanPolygon,
} from "../utils/radar.js";

const SIZE = RADAR_VIEWBOX;

function LabelText({ label, x, y, color, score }) {
  const isLongZh = /进攻对策性|特防对策性/.test(label);
  if (isLongZh) {
    return (
      <text x={x} y={y - 7} textAnchor="middle" fill={color} fontSize={14} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
        <tspan x={x}>{label.slice(0, 2)}</tspan>
        <tspan x={x} dy="15">{label.slice(2)}</tspan>
        {score && <tspan x={x} dy="16" fontSize={15}>{score}</tspan>}
      </text>
    );
  }
  return (
    <text x={x} y={y - 5} textAnchor="middle" fill={color} fontSize={14} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
      {label}
      {score && <tspan x={x} dy="16" fontSize={15}>{score}</tspan>}
    </text>
  );
}

export default function RadarChart({
  ratings,
  size = SIZE,
  language = "zh",
  axisProgress = [1, 1, 1, 1, 1],
  dataProgress = [1, 1, 1, 1, 1],
  ringProgress = 1,
  scanProgress = null,
  scanBeamIntensity = 0,
}) {
  const labels = DIMENSION_LABELS[localeFor(language)] || DIMENSION_LABELS.zh;

  // Data polygon
  const dataPoints = DIMENSIONS.map((d, i) => {
    const score = ratings[d.key] !== null ? TIER_SCORES[ratings[d.key]] : 0;
    const frac  = score / 5;
    const [targetX, targetY] = radarPoint(RADAR_ANGLES[i], RADAR_RADIUS * frac);
    const progress = dataProgress[i] ?? 1;
    return [
      RADAR_CENTER + (targetX - RADAR_CENTER) * progress,
      RADAR_CENTER + (targetY - RADAR_CENTER) * progress,
    ];
  });

  const fillColor = ratings.overall !== null && ratings.overall !== undefined
    ? OVERALL_COLORS[ratings.overall]
    : "#4a6080";
  const scanLines = scanProgress !== null && scanBeamIntensity > 0
    ? [0, -6, -12].map(offset => radarScanPoint(scanProgress, undefined, offset))
    : [];
  const scanSector = scanProgress !== null && scanBeamIntensity > 0
    ? radarScanPolygon(scanProgress)
    : null;

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${RADAR_VIEWBOX} ${RADAR_VIEWBOX}`}
      style={{ display: "block" }}
    >
      {scanSector ? <polygon
        points={scanSector}
        fill="#38bdf8"
        opacity={scanBeamIntensity * 0.12}
      /> : null}
      {scanLines.map(([x, y], index) => <line
        key={`scan-${index}`}
        x1={RADAR_CENTER}
        y1={RADAR_CENTER}
        x2={x}
        y2={y}
        stroke="#38bdf8"
        strokeWidth={index === 0 ? 2.5 : 1.5}
        opacity={scanBeamIntensity * (1 - index * 0.22)}
      />)}

      {/* Background rings */}
      {Array.from({ length: RADAR_LEVELS }, (_, lvl) => {
        const radius = RADAR_RADIUS * ((lvl + 1) / RADAR_LEVELS) * ringProgress;
        const pts = RADAR_ANGLES.map(angle => radarPoint(angle, radius));
        return (
          <polygon
            key={lvl}
            points={radarPolygon(pts)}
            fill="none"
            stroke="#1e2d42"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {RADAR_ANGLES.map((angle, i) => {
        const [targetX, targetY] = radarPoint(angle, RADAR_RADIUS);
        const progress = axisProgress[i] ?? 1;
        const x = RADAR_CENTER + (targetX - RADAR_CENTER) * progress;
        const y = RADAR_CENTER + (targetY - RADAR_CENTER) * progress;
        return <line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={x} y2={y} stroke="#1e2d42" strokeWidth={1} />;
      })}

      {/* Data polygon */}
      <polygon
        points={radarPolygon(dataPoints)}
        fill={`${fillColor}30`}
        stroke={fillColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => {
        const score = ratings[DIMENSIONS[i].key] !== null ? TIER_SCORES[ratings[DIMENSIONS[i].key]] : 0;
        if (score === 0) return null;
        const ptColor = TIER_COLORS[ratings[DIMENSIONS[i].key]] || "#888";
        return (
          <circle key={i} cx={x} cy={y} r={4} fill={ptColor} stroke="#000" strokeWidth={1} />
        );
      })}

      {/* Labels */}
      {DIMENSIONS.map((d, i) => {
        const angle  = RADAR_ANGLES[i];
        const [x, y] = radarPoint(angle, RADAR_RADIUS + 58);
        const score = ratings[d.key];
        const tierColor = score ? TIER_COLORS[score] : "#4a6080";
        return (
          <g key={i}>
            <g opacity={axisProgress[i] ?? 1}>
              <LabelText label={labels[d.key][0]} x={x} y={y} color={tierColor} score={score} />
            </g>
          </g>
        );
      })}

      {/* Center */}
      <circle cx={RADAR_CENTER} cy={RADAR_CENTER} r={3} fill="#1e2d42" />
    </svg>
  );
}
