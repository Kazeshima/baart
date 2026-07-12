import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import RadarChart from "../../src/components/RadarChart.jsx";
import { DIMENSIONS, TIER_SCORES, TIER_COLORS } from "../../src/utils/constants.js";
import { RADAR_ANGLES, RADAR_RADIUS, radarPoint, radarRippleProfile } from "../../src/utils/radar.js";
import { dimensionScanFrame, getTimeline, phaseProgress, radarScanVisibility } from "../core/config.js";

export default function AnimatedRadar({ ratings, language, settings, size = 570 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const profile = settings.renderProfile || {};
  const timeline = getTimeline({ ...settings, fps });
  const scanProgress = profile.staticRadar ? 1 : phaseProgress(frame, timeline.radarStart, timeline.radarDuration);
  const dataProgress = DIMENSIONS.map((_, index) => {
    if (profile.staticRadar) return 1;
    const start = dimensionScanFrame(timeline, index, DIMENSIONS.length);
    return interpolate(frame, [start, start + timeline.pointDuration], [0, 1], {
      easing: Easing.bezier(0.65, 0, 0.35, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  });
  const polygonProgress = profile.staticRadar ? 1 : interpolate(frame, [timeline.polygonStart, timeline.polygonEnd], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const polygonOpacity = profile.staticRadar ? 1 : interpolate(frame, [timeline.polygonStart, timeline.polygonStart + Math.max(1, timeline.polygonDuration * 0.7)], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringProgress = profile.staticRadar ? 1 : phaseProgress(frame, timeline.radarStart - Math.round(fps * 0.35), Math.round(fps * 0.5));
  const axisProgress = DIMENSIONS.map(() => ringProgress);
  const scanVisibility = profile.simplifyRadar || profile.staticRadar ? 0 : radarScanVisibility(frame, timeline);
  const beamOpacity = settings.scanBeamIntensity * scanVisibility;
  const afterglowOpacity = settings.scanAfterglowOpacity * scanVisibility;
  const ripplesEnabled = !profile.simplifyRadar && !profile.disableRipples && !profile.staticRadar;

  return (
    <div className="video-radar" style={{ width: size, height: size }}>
      <RadarChart
        ratings={ratings}
        size={size}
        language={language}
        axisProgress={axisProgress}
        dataProgress={dataProgress}
        ringProgress={ringProgress}
        polygonProgress={polygonProgress}
        polygonOpacity={polygonOpacity}
        scanProgress={scanProgress}
        scanBeamIntensity={beamOpacity}
        scanBeamColor={settings.scanBeamColor}
        scanAfterglowOpacity={afterglowOpacity}
        scanBeamCenterWidth={settings.scanBeamCenterWidth}
        scanBeamEdgeWidth={settings.scanBeamEdgeWidth}
        scanTrailSegments={settings.radarScanTrailSegments}
        scanTrailDegrees={settings.radarScanTrailDegrees}
        labelColor={settings.theme === "light" ? "#53677e" : "#8da4be"}
        labelFontScale={1.25}
      />
      <svg className="video-radar__ripples" viewBox="0 0 420 420">
        {DIMENSIONS.flatMap((dimension, index) => {
          const tier = ratings[dimension.key];
          const ripple = radarRippleProfile(tier, { count: ripplesEnabled ? settings.rippleCount : 0 });
          if (ripple.count <= 0) return [];
          const score = TIER_SCORES[tier];
          const [x, y] = radarPoint(RADAR_ANGLES[index], RADAR_RADIUS * score / 5);
          const start = dimensionScanFrame(timeline, index, DIMENSIONS.length) + timeline.pointDuration;
          return Array.from({ length: ripple.count }, (_, rippleIndex) => {
            const delay = rippleIndex * Math.round(fps * 0.13);
            const rippleFrames = Math.max(1, Math.round(settings.rippleDuration * ripple.durationScale * fps));
            const progress = phaseProgress(frame, start + delay, rippleFrames);
            if (progress <= 0 || progress >= 1) return null;
            const radius = interpolate(progress, [0, 1], [5, 28 * settings.rippleScale * ripple.radiusScale], { easing: Easing.out(Easing.cubic) });
            const opacity = interpolate(progress, [0, 1], [settings.rippleOpacity * ripple.opacityScale, 0], { easing: Easing.in(Easing.cubic) });
            return <circle key={`${dimension.key}-${rippleIndex}`} cx={x} cy={y} r={radius} fill="none" stroke={TIER_COLORS[tier]} strokeWidth={ripple.strokeWidth} opacity={opacity} />;
          });
        })}
      </svg>
    </div>
  );
}
