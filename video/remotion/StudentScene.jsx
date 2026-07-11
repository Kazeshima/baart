import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Img, spring, useCurrentFrame, useCurrentScale, useVideoConfig } from "remotion";
import { createStudentRatingPresentation } from "../../src/utils/presentationModel.js";
import OverallBadge from "../../src/components/presentation/OverallBadge.jsx";
import { StudentIdentity, StudentTerrainIndicators, StudentTypeIndicators } from "../../src/components/presentation/StudentPresentation.jsx";
import { COMMENT_SCROLL_BOTTOM_CLEARANCE, COMMENT_SCROLL_TOP_GAP, commentScrollDistanceFromHeights, commentScrollOffset, getTimeline, phaseProgress, estimateCommentScroll, sceneFadeOpacity } from "../core/config.js";
import AnimatedRadar from "./AnimatedRadar.jsx";

const palettes = {
  dark: { bg: "#06080f", text: "#e8f0fe", muted: "#4a6080" },
  light: { bg: "#e4edf5", text: "#1b2b3d", muted: "#71839a" },
};

function enterStyle(frame, start, duration = 16, distance = 28) {
  const progress = phaseProgress(frame, start, duration);
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance}px)` };
}

function videoTitleFontSize(displayName) {
  const weightedLength = Array.from(displayName).reduce((sum, character) => sum + (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character) ? 1.9 : 1), 0);
  if (weightedLength > 18) return 70;
  if (weightedLength > 15) return 78;
  if (weightedLength > 13) return 86;
  return 100;
}

export default function StudentScene({ record, settings }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = useCurrentScale();
  const timeline = useMemo(() => getTimeline({ ...settings, fps }), [settings, fps]);
  const { student, ratings } = record;
  const profile = settings.renderProfile || {};
  const qualityMode = settings.renderQualityMode || "balanced";
  const fastRender = qualityMode === "fast" || profile.disableShadows;
  const AssetImg = useCallback(({ src, ...props }) => <Img {...props} src={settings.assetMap?.[src] || src} />, [settings.assetMap]);
  const palette = palettes[settings.theme] || palettes.dark;
  const presentation = useMemo(() => createStudentRatingPresentation({
    student,
    ratings,
    language: settings.uiLanguage,
    activeSeason: settings.season,
  }), [student, ratings, settings.uiLanguage, settings.season]);
  const titleFontSize = useMemo(() => videoTitleFontSize(presentation.identity.displayName), [presentation.identity.displayName]);
  const overallColor = presentation.overall.level !== null ? presentation.overall.color : palette.muted;
  const overallSpring = spring({ frame: frame - timeline.overallStart, fps, config: { damping: 14, stiffness: 115, mass: 0.8 } });
  const infoEnterFrames = Math.max(1, Math.round(settings.infoEnterDuration * fps));
  const cardOpacity = sceneFadeOpacity(frame, timeline);
  const hasQualityCommentMask = !profile.disableCommentMask && qualityMode === "quality";
  const commentTopGap = hasQualityCommentMask ? COMMENT_SCROLL_TOP_GAP : 0;
  const commentBottomClearance = hasQualityCommentMask ? COMMENT_SCROLL_BOTTOM_CLEARANCE : 0;
  const scroll = useMemo(() => estimateCommentScroll(ratings.notes, settings.uiLanguage, {
    charsPerLine: settings.uiLanguage === "en" ? 28 : 17,
    lineHeight: 58,
    viewportHeight: 260,
    topGap: commentTopGap,
    bottomClearance: commentBottomClearance,
  }), [ratings.notes, settings.uiLanguage, commentTopGap, commentBottomClearance]);
  const commentViewportRef = useRef(null);
  const commentTextRef = useRef(null);
  const [measuredScrollDistance, setMeasuredScrollDistance] = useState(null);
  useLayoutEffect(() => {
    if (!commentViewportRef.current || !commentTextRef.current) return;
    const viewportRect = commentViewportRef.current.getBoundingClientRect();
    const textRect = commentTextRef.current.getBoundingClientRect();
    const viewportHeight = viewportRect.height / (scale || 1);
    const textHeight = Math.max(
      textRect.height / (scale || 1),
      commentTextRef.current.scrollHeight || 0,
    );
    const measured = commentScrollDistanceFromHeights(textHeight + commentTopGap, viewportHeight, 0.1, commentBottomClearance);
    setMeasuredScrollDistance(current => Math.abs(Number(current ?? -1) - measured) > 0.5 ? measured : current);
  }, [ratings.notes, settings.uiLanguage, settings.theme, qualityMode, commentTopGap, commentBottomClearance, scale]);
  const scrollDistance = measuredScrollDistance ?? scroll.distance;
  const scrollY = profile.disableCommentScroll ? 0 : commentScrollOffset({ frame, distance: scrollDistance, timeline, settings, fps });
  const commentMaskClass = hasQualityCommentMask ? "video-comments__viewport--quality" : "video-comments__viewport--no-mask";

  return (
    <div className={`video-scene baart-theme ${fastRender ? "video-scene--fast" : ""}`} data-theme={settings.theme} style={{ opacity: cardOpacity, background: palette.bg, color: palette.text }}>
      {!profile.disableGrid ? <div className="video-scene__grid" /> : null}
      {!profile.disablePortrait ? <div className="video-portrait" style={{ opacity: settings.portraitOpacity }}>
        <AssetImg src={presentation.identity.portraitUrl} />
      </div> : null}
      <div className="video-portrait-shade" />

      <header className="video-title" style={enterStyle(frame, timeline.infoStart, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-title__season">{settings.arenaSeason} · ARENA GUIDE</div>
        <StudentIdentity student={student} language={settings.uiLanguage} presentation={presentation} nameClassName="video-title__name" metaClassName="video-title__meta" nameStyle={{ fontSize: titleFontSize }} ImageComponent={AssetImg} />
      </header>

      <section className="video-info" style={enterStyle(frame, timeline.infoStart + timeline.infoStep, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-info__role">{presentation.role.squadLabel} / {presentation.role.tacticLabel}</div>
        {!profile.disableTypeIndicators ? <div className="video-facts">
        <StudentTypeIndicators student={student} language={settings.uiLanguage} presentation={presentation} ImageComponent={AssetImg} variant="video" mutedColor={palette.muted} />
        </div> : null}
        <div className="video-weapon">{presentation.weapon.key} {presentation.weapon.label} · {presentation.labels.range} {presentation.weapon.range}</div>
        <StudentTerrainIndicators student={student} activeSeason={settings.season} language={settings.uiLanguage} presentation={presentation} ImageComponent={AssetImg} variant="video" />
      </section>

      {!profile.disableComments ? <section className="video-comments" style={enterStyle(frame, timeline.infoStart + timeline.infoStep * 2, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-section-label">{presentation.labels.comments}</div>
        <div ref={commentViewportRef} className={`video-comments__viewport ${commentMaskClass}`} style={{ "--comment-scroll-top-gap": `${commentTopGap}px` }}>
          <div ref={commentTextRef} className="video-comments__text" style={{ transform: `translateY(${-scrollY}px)` }}>{presentation.notes || "—"}</div>
        </div>
      </section> : null}

      <section className="video-radar-panel" style={enterStyle(frame, timeline.radarStart - Math.round(fps * 0.25), Math.max(1, Math.round(settings.infoEnterDuration * fps)), 18)}>
        <AnimatedRadar ratings={ratings} language={settings.uiLanguage} settings={settings} size={640} />
      </section>
      <div className="video-weights" style={enterStyle(frame, timeline.radarStart, Math.max(1, Math.round(settings.infoEnterDuration * fps)), 12)}>
        <span className="video-weights__label">{presentation.labels.weightsUsed}</span>
        {presentation.dimensions.map(dimension => <span key={dimension.key}>{dimension.label} <strong>{dimension.weightLabel}</strong></span>)}
      </div>

      <section className="video-overall" style={{
        opacity: overallSpring,
        transform: `scale(${0.82 + overallSpring * 0.18})`,
        borderColor: overallColor,
        boxShadow: `0 0 ${settings.overallGlowStrength * overallSpring}px ${overallColor}35`,
      }}>
        <div className="video-section-label">{presentation.labels.overall}</div>
        <OverallBadge overall={ratings.overall} overallScore={ratings.overallScore} language={settings.uiLanguage} className="video-overall__badge" />
      </section>
    </div>
  );
}
