import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import RadarChart from "../../src/components/RadarChart.jsx";
import { DIMENSIONS, TIER_SCORES, TIER_COLORS } from "../../src/utils/constants.js";
import { RADAR_ANGLES, RADAR_RADIUS, radarPoint } from "../../src/utils/radar.js";
import { getTimeline, phaseProgress } from "../core/config.js";

export default function AnimatedRadar({ ratings, language, settings, size = 570 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = getTimeline({ ...settings, fps });
  const axisProgress = DIMENSIONS.map((_, index) => phaseProgress(frame, timeline.axesStart + index * timeline.axisStep, timeline.axisStep));
  const dataProgress = DIMENSIONS.map((_, index) => phaseProgress(frame, timeline.dataStart + index * timeline.dataStep, timeline.dataStep));
  const scanStart = timeline.axesStart;
  const scanEnd = timeline.polygonEnd;
  const scanProgress = phaseProgress(frame, scanStart, scanEnd - scanStart);
  const beamOpacity = frame >= scanStart && frame <= scanEnd ? settings.scanBeamIntensity : 0;

  return (
    <div className="video-radar" style={{ width: size, height: size }}>
      <RadarChart
        ratings={ratings}
        size={size}
        language={language}
        axisProgress={axisProgress}
        dataProgress={dataProgress}
        ringProgress={phaseProgress(frame, timeline.axesStart - Math.round(fps * 0.3), Math.round(fps * 0.5))}
        scanProgress={scanProgress}
        scanBeamIntensity={beamOpacity}
      />
      <svg className="video-radar__ripples" viewBox="0 0 420 420">
        {DIMENSIONS.flatMap((dimension, index) => {
          const tier = ratings[dimension.key];
          if (tier !== "S" && tier !== "A") return [];
          const score = TIER_SCORES[tier];
          const [x, y] = radarPoint(RADAR_ANGLES[index], RADAR_RADIUS * score / 5);
          const start = timeline.dataStart + index * timeline.dataStep + timeline.dataStep;
          return Array.from({ length: settings.rippleCount }, (_, rippleIndex) => {
            const delay = rippleIndex * Math.round(fps * 0.13);
            const rippleFrames = Math.max(1, Math.round(settings.rippleDuration * fps));
            const progress = phaseProgress(frame, start + delay, rippleFrames);
            if (progress <= 0 || progress >= 1) return null;
            const radius = interpolate(progress, [0, 1], [5, 28 * settings.rippleScale]);
            const opacity = (1 - progress) * settings.rippleOpacity;
            return <circle key={`${dimension.key}-${rippleIndex}`} cx={x} cy={y} r={radius} fill="none" stroke={TIER_COLORS[tier]} strokeWidth={2.4} opacity={opacity} />;
          });
        })}
      </svg>
    </div>
  );
}
