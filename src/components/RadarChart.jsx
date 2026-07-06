import { DIMENSIONS, TIER_SCORES, TIER_COLORS, OVERALL_COLORS } from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor } from "../utils/i18n.js";
import {
  RADAR_ANGLES, RADAR_CENTER, RADAR_LEVELS, RADAR_RADIUS, RADAR_VIEWBOX,
  radarPoint, radarPolygon, radarScanPoint, radarScanTrail,
} from "../utils/radar.js";

const SIZE = RADAR_VIEWBOX;

function LabelText({ label, x, y, labelColor, scoreColor, score, resultProgress = 1 }) {
  const isLongZh = /进攻对策性|特防对策性/.test(label);
  if (isLongZh) {
    return (
      <text x={x} y={y - 10} textAnchor="middle" fill={labelColor} fontSize={17} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
        <tspan x={x}>{label.slice(0, 2)}</tspan>
        <tspan x={x} dy="18">{label.slice(2)}</tspan>
        {score && <tspan x={x} dy="20" fill={scoreColor} fontSize={20} opacity={resultProgress}>{score}</tspan>}
      </text>
    );
  }
  return (
    <text x={x} y={y - 7} textAnchor="middle" fill={labelColor} fontSize={17} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
      {label}
      {score && <tspan x={x} dy="20" fill={scoreColor} fontSize={20} opacity={resultProgress}>{score}</tspan>}
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
  polygonProgress = 1,
  polygonOpacity = 1,
  scanProgress = null,
  scanBeamIntensity = 0,
  labelColor = "var(--text-secondary)",
}) {
  const labels = DIMENSION_LABELS[localeFor(language)] || DIMENSION_LABELS.zh;

  // Data polygon
  const targetPoints = DIMENSIONS.map((d, i) => {
    const score = ratings[d.key] !== null ? TIER_SCORES[ratings[d.key]] : 0;
    const frac  = score / 5;
    return radarPoint(RADAR_ANGLES[i], RADAR_RADIUS * frac);
  });
  const dataPoints = targetPoints.map(([targetX, targetY], i) => {
    const progress = dataProgress[i] ?? 1;
    return [
      RADAR_CENTER + (targetX - RADAR_CENTER) * progress,
      RADAR_CENTER + (targetY - RADAR_CENTER) * progress,
    ];
  });
  const polygonPoints = targetPoints.map(([targetX, targetY]) => [
    RADAR_CENTER + (targetX - RADAR_CENTER) * polygonProgress,
    RADAR_CENTER + (targetY - RADAR_CENTER) * polygonProgress,
  ]);

  const fillColor = ratings.overall !== null && ratings.overall !== undefined
    ? OVERALL_COLORS[ratings.overall]
    : "#4a6080";
  const scanPoint = scanProgress !== null && scanBeamIntensity > 0 ? radarScanPoint(scanProgress) : null;
  const scanTrail = scanPoint ? radarScanTrail(scanProgress) : [];

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${RADAR_VIEWBOX} ${RADAR_VIEWBOX}`}
      style={{ display: "block" }}
    >
      {scanTrail.map((segment, index) => <polygon
        key={`scan-trail-${index}`}
        points={segment.points}
        fill="#38bdf8"
        opacity={scanBeamIntensity * 0.11 * segment.opacity}
      />)}
      {scanPoint ? <line
        x1={RADAR_CENTER}
        y1={RADAR_CENTER}
        x2={scanPoint[0]}
        y2={scanPoint[1]}
        stroke="#38bdf8"
        strokeWidth={2.4}
        opacity={scanBeamIntensity}
      /> : null}

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
        points={radarPolygon(polygonPoints)}
        fill={`${fillColor}30`}
        stroke={fillColor}
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={polygonOpacity}
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => {
        const score = ratings[DIMENSIONS[i].key] !== null ? TIER_SCORES[ratings[DIMENSIONS[i].key]] : 0;
        if (score === 0) return null;
        const ptColor = TIER_COLORS[ratings[DIMENSIONS[i].key]] || "#888";
        const progress = dataProgress[i] ?? 1;
        return <circle key={i} cx={x} cy={y} r={4 * progress} opacity={progress} fill={ptColor} stroke="#000" strokeWidth={1} />;
      })}

      {/* Labels */}
      {DIMENSIONS.map((d, i) => {
        const angle  = RADAR_ANGLES[i];
        const [x, y] = radarPoint(angle, RADAR_RADIUS + 58);
        const score = ratings[d.key];
        const tierColor = score ? TIER_COLORS[score] : "#4a6080";
        return (
          <g key={i}>
            <g opacity={dataProgress[i] ?? 1}>
              <LabelText label={labels[d.key][0]} x={x} y={y} labelColor={labelColor} scoreColor={tierColor} score={score} resultProgress={dataProgress[i] ?? 1} />
            </g>
          </g>
        );
      })}

      {/* Center */}
      <circle cx={RADAR_CENTER} cy={RADAR_CENTER} r={3} fill="#1e2d42" />
    </svg>
  );
}
