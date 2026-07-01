import { DIMENSIONS, TIER_SCORES, TIER_COLORS, OVERALL_COLORS } from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor } from "../utils/i18n.js";

const SIZE   = 420;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R      = 128;   // outer ring radius
const LEVELS = 5;     // S=5 rings

function polygon(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

// Get (x,y) for a point at angle and radius
function polar(angle, r) {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

const ANGLES = [-72, 0, 72, 144, 216];

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

export default function RadarChart({ ratings, size = SIZE, language = "zh" }) {
  const scale = size / SIZE;
  const labels = DIMENSION_LABELS[localeFor(language)] || DIMENSION_LABELS.zh;

  // Data polygon
  const dataPoints = DIMENSIONS.map((d, i) => {
    const score = ratings[d.key] !== null ? TIER_SCORES[ratings[d.key]] : 0;
    const frac  = score / 5;
    return polar(ANGLES[i], R * frac);
  });

  const fillColor = ratings.overall !== null && ratings.overall !== undefined
    ? OVERALL_COLORS[ratings.overall]
    : "#4a6080";

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ display: "block" }}
    >
      {/* Background rings */}
      {Array.from({ length: LEVELS }, (_, lvl) => {
        const r = R * ((lvl + 1) / LEVELS);
        const pts = ANGLES.map(a => polar(a, r));
        return (
          <polygon
            key={lvl}
            points={polygon(pts)}
            fill="none"
            stroke="#1e2d42"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {ANGLES.map((angle, i) => {
        const [x, y] = polar(angle, R);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#1e2d42" strokeWidth={1} />;
      })}

      {/* Data polygon */}
      <polygon
        points={polygon(dataPoints)}
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
        const angle  = ANGLES[i];
        const [x, y] = polar(angle, R + 58);
        const score = ratings[d.key];
        const tierColor = score ? TIER_COLORS[score] : "#4a6080";
        return (
          <g key={i}>
            <LabelText label={labels[d.key][0]} x={x} y={y} color={tierColor} score={score} />
          </g>
        );
      })}

      {/* Center */}
      <circle cx={CX} cy={CY} r={3} fill="#1e2d42" />
    </svg>
  );
}
