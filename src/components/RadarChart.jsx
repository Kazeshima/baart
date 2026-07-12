import { useMemo } from "react";
import { DIMENSIONS, TIER_SCORES, TIER_COLORS, OVERALL_COLORS } from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor } from "../utils/i18n.js";
import {
  RADAR_CENTER, RADAR_RADIUS, RADAR_VIEWBOX,
  radarPolygon, radarRevealCircle, radarScanBeam, radarScanTrail,
} from "../utils/radar.js";
import { createRadarRenderModel, revealRadarPoints } from "../utils/radarRenderModel.js";

const SIZE = RADAR_VIEWBOX;
function LabelText({ label, x, y, labelColor, scoreColor, score, resultProgress = 1, labelFontScale = 1 }) {
  const isLongZh = /进攻对策性|特防对策性/.test(label);
  const labelSize = 17 * labelFontScale;
  const scoreSize = 20 * labelFontScale;
  const firstOffset = 18 * labelFontScale;
  const scoreOffset = 20 * labelFontScale;
  if (isLongZh) {
    return (
      <text x={x} y={y - 10 * labelFontScale} textAnchor="middle" fill={labelColor} fontSize={labelSize} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
        <tspan x={x}>{label.slice(0, 2)}</tspan>
        <tspan x={x} dy={firstOffset}>{label.slice(2)}</tspan>
        {score && <tspan x={x} dy={scoreOffset} fill={scoreColor} fontSize={scoreSize} opacity={resultProgress}>{score}</tspan>}
      </text>
    );
  }
  return (
    <text x={x} y={y - 7 * labelFontScale} textAnchor="middle" fill={labelColor} fontSize={labelSize} fontFamily="Rajdhani, Noto Sans SC, sans-serif" fontWeight={800}>
      {label}
      {score && <tspan x={x} dy={scoreOffset} fill={scoreColor} fontSize={scoreSize} opacity={resultProgress}>{score}</tspan>}
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
  scanBeamColor = "#38bdf8",
  scanAfterglowOpacity = 0.18,
  scanBeamCenterWidth = 7,
  scanBeamEdgeWidth = 1.2,
  scanTrailSegments = 10,
  scanTrailDegrees = 48,
  labelColor = "var(--text-secondary)",
  labelFontScale = 1,
}) {
  const labels = DIMENSION_LABELS[localeFor(language)] || DIMENSION_LABELS.zh;
  const dimensions = useMemo(() => DIMENSIONS.map(dimension => ({
    key: dimension.key,
    label: labels[dimension.key][0],
    tier: ratings[dimension.key],
    score: ratings[dimension.key] !== null ? TIER_SCORES[ratings[dimension.key]] : 0,
    tierColor: TIER_COLORS[ratings[dimension.key]] || "#4a6080",
  })), [labels, ratings]);
  const radarModel = useMemo(() => createRadarRenderModel(dimensions, {
    centerX: RADAR_CENTER,
    centerY: RADAR_CENTER,
    radius: RADAR_RADIUS,
    labelRadius: RADAR_RADIUS + 58,
  }), [dimensions]);
  const targetPoints = radarModel.data.map(dimension => dimension.point);
  const polygonPoints = revealRadarPoints(radarModel, polygonProgress);

  const fillColor = ratings.overall !== null && ratings.overall !== undefined
    ? OVERALL_COLORS[ratings.overall]
    : "#4a6080";
  const hasScan = scanProgress !== null && (scanBeamIntensity > 0 || scanAfterglowOpacity > 0);
  const scanBeam = hasScan ? radarScanBeam(scanProgress, { centerWidth: scanBeamCenterWidth, edgeWidth: scanBeamEdgeWidth }) : null;
  const scanTrail = hasScan ? radarScanTrail(scanProgress, scanTrailSegments, scanTrailDegrees) : [];

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${RADAR_VIEWBOX} ${RADAR_VIEWBOX}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {scanBeam ? <defs>
        <linearGradient id="radar-scan-beam" gradientUnits="userSpaceOnUse" x1={scanBeam.start[0]} y1={scanBeam.start[1]} x2={scanBeam.end[0]} y2={scanBeam.end[1]}>
          <stop offset="0%" stopColor={scanBeamColor} stopOpacity="1" />
          <stop offset="58%" stopColor={scanBeamColor} stopOpacity="0.66" />
          <stop offset="100%" stopColor={scanBeamColor} stopOpacity="0.16" />
        </linearGradient>
      </defs> : null}
      {scanTrail.map((segment, index) => <polygon
        key={`scan-trail-${index}`}
        points={segment.points}
        fill={scanBeamColor}
        opacity={scanAfterglowOpacity * segment.opacity}
      />)}
      {scanBeam ? <polygon
        points={scanBeam.polygon}
        fill="url(#radar-scan-beam)"
        opacity={scanBeamIntensity}
      /> : null}

      {/* Background rings */}
      {radarModel.rings.map((points, lvl) => {
        const transform = ringProgress < 1 ? `translate(${RADAR_CENTER} ${RADAR_CENTER}) scale(${ringProgress}) translate(${-RADAR_CENTER} ${-RADAR_CENTER})` : undefined;
        return (
          <polygon
            key={lvl}
            points={radarPolygon(points)}
            transform={transform}
            fill="none"
            stroke="#1e2d42"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {radarModel.axes.map(([targetX, targetY], i) => {
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
      {targetPoints.map((targetPoint, i) => {
        const score = ratings[DIMENSIONS[i].key] !== null ? TIER_SCORES[ratings[DIMENSIONS[i].key]] : 0;
        if (score === 0) return null;
        const ptColor = TIER_COLORS[ratings[DIMENSIONS[i].key]] || "#888";
        const progress = dataProgress[i] ?? 1;
        const circle = radarRevealCircle(targetPoint, progress);
        return <circle key={i} cx={circle.cx} cy={circle.cy} r={circle.r} opacity={circle.opacity} fill={ptColor} stroke="#000" strokeWidth={1} />;
      })}

      {/* Labels */}
      {radarModel.data.map((dimension, i) => {
        const [x, y] = dimension.labelPoint;
        const score = dimension.tier;
        const tierColor = score ? dimension.tierColor : "#4a6080";
        return (
          <g key={i}>
            <g opacity={dataProgress[i] ?? 1}>
              <LabelText label={dimension.label} x={x} y={y} labelColor={labelColor} scoreColor={tierColor} score={score} resultProgress={dataProgress[i] ?? 1} labelFontScale={labelFontScale} />
            </g>
          </g>
        );
      })}

      {/* Center */}
      <circle cx={RADAR_CENTER} cy={RADAR_CENTER} r={3} fill="#1e2d42" />
    </svg>
  );
}
