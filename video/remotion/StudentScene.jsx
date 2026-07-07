import React, { useMemo } from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DIMENSIONS, OVERALL_COLORS } from "../../src/utils/constants.js";
import { DIMENSION_LABELS, localeFor, t } from "../../src/utils/i18n.js";
import { formatWeightShare } from "../../src/utils/scoring.js";
import { studentDisplayName } from "../../src/utils/studentDisplay.js";
import OverallBadge from "../../src/components/presentation/OverallBadge.jsx";
import { StudentIdentity, StudentTerrainIndicators, StudentTypeIndicators, studentPresentation } from "../../src/components/presentation/StudentPresentation.jsx";
import { getTimeline, phaseProgress, estimateCommentScroll } from "../core/config.js";
import AnimatedRadar from "./AnimatedRadar.jsx";

const palettes = {
  dark: { bg: "#06080f", panel: "#0d1120", card: "#111827", stroke: "#1e2d42", text: "#e8f0fe", sub: "#8da4be", muted: "#4a6080" },
  light: { bg: "#e4edf5", panel: "#f8fbff", card: "#e7eef6", stroke: "#b9c8d8", text: "#1b2b3d", sub: "#53677e", muted: "#71839a" },
};

function enterStyle(frame, start, duration = 16, distance = 28) {
  const progress = phaseProgress(frame, start, duration);
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance}px)` };
}

function videoTitleFontSize(student, language) {
  const displayName = studentDisplayName(student, language);
  const weightedLength = Array.from(displayName).reduce((sum, character) => sum + (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character) ? 1.9 : 1), 0);
  if (weightedLength > 18) return 70;
  if (weightedLength > 15) return 78;
  if (weightedLength > 13) return 86;
  return 100;
}

export default function StudentScene({ record, settings }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = getTimeline({ ...settings, fps });
  const { student, ratings } = record;
  const profile = settings.renderProfile || {};
  const assetSrc = src => settings.assetMap?.[src] || src;
  const AssetImg = props => <Img {...props} src={assetSrc(props.src)} />;
  const palette = palettes[settings.theme] || palettes.dark;
  const presentation = useMemo(() => studentPresentation(student, settings.uiLanguage), [student, settings.uiLanguage]);
  const titleFontSize = useMemo(() => videoTitleFontSize(student, settings.uiLanguage), [student, settings.uiLanguage]);
  const dimensionLabels = useMemo(() => DIMENSION_LABELS[localeFor(settings.uiLanguage)] || DIMENSION_LABELS.zh, [settings.uiLanguage]);
  const overallColor = ratings.overall !== null ? OVERALL_COLORS[ratings.overall] : palette.muted;
  const overallSpring = spring({ frame: frame - timeline.overallStart, fps, config: { damping: 14, stiffness: 115, mass: 0.8 } });
  const infoEnterFrames = Math.max(1, Math.round(settings.infoEnterDuration * fps));
  const cardOpacity = Math.min(
    phaseProgress(frame, 0, timeline.fadeIn),
    1 - phaseProgress(frame, timeline.fadeOutStart, timeline.fadeOut || 1),
  );
  const scroll = useMemo(() => estimateCommentScroll(ratings.notes, settings.uiLanguage, {
    charsPerLine: settings.uiLanguage === "en" ? 28 : 17,
    lineHeight: 58,
    viewportHeight: 260,
  }), [ratings.notes, settings.uiLanguage]);
  const scrollStart = timeline.overallEnd + Math.round(settings.commentScrollDelay * fps);
  const scrollHoldFrames = Math.max(1, timeline.fadeOutStart - scrollStart - Math.round(fps * 0.15));
  const scrollY = settings.commentScrollMode === "fixedSpeed"
    ? Math.min(scroll.distance, Math.max(0, frame - scrollStart) / fps * settings.commentScrollSpeed)
    : scroll.distance * phaseProgress(frame, scrollStart, scrollHoldFrames);

  return (
    <div className="video-scene baart-theme" data-theme={settings.theme} style={{ opacity: cardOpacity, background: palette.bg, color: palette.text }}>
      <div className="video-scene__grid" />
      {!profile.disablePortrait ? <div className="video-portrait" style={{ opacity: settings.portraitOpacity }}>
        <AssetImg src={`https://schaledb.com/images/student/portrait/${student.id}.webp`} />
      </div> : null}
      <div className="video-portrait-shade" />

      <header className="video-title" style={enterStyle(frame, timeline.infoStart, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-title__season">{settings.arenaSeason} · ARENA GUIDE</div>
        <StudentIdentity student={student} language={settings.uiLanguage} nameClassName="video-title__name" metaClassName="video-title__meta" nameStyle={{ fontSize: titleFontSize }} />
      </header>

      <section className="video-info" style={enterStyle(frame, timeline.infoStart + timeline.infoStep, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-info__role">{presentation.squadLabel} / {presentation.roleLabel}</div>
        {!profile.disableTypeIndicators ? <div className="video-facts">
          <StudentTypeIndicators student={student} language={settings.uiLanguage} ImageComponent={AssetImg} variant="video" mutedColor={palette.muted} />
        </div> : null}
        <div className="video-weapon">{student.weaponType} {presentation.weaponLabel} · {t(settings.uiLanguage, "range")} {student.range}</div>
        <StudentTerrainIndicators student={student} activeSeason={settings.season} language={settings.uiLanguage} ImageComponent={AssetImg} variant="video" />
      </section>

      {!profile.disableComments ? <section className="video-comments" style={enterStyle(frame, timeline.infoStart + timeline.infoStep * 2, infoEnterFrames, settings.infoEnterDistance)}>
        <div className="video-section-label">{t(settings.uiLanguage, "comments")}</div>
        <div className="video-comments__viewport">
          <div className="video-comments__text" style={{ transform: `translateY(${-scrollY}px)` }}>{ratings.notes || "—"}</div>
        </div>
      </section> : null}

      <section className="video-radar-panel" style={enterStyle(frame, timeline.radarStart - Math.round(fps * 0.25), Math.max(1, Math.round(settings.infoEnterDuration * fps)), 18)}>
        <AnimatedRadar ratings={ratings} language={settings.uiLanguage} settings={settings} size={640} />
        <div className="video-weights">
          <span className="video-weights__label">{t(settings.uiLanguage, "weightsUsed")}</span>
          {DIMENSIONS.map(({ key }) => <span key={key}>{dimensionLabels[key][0]} <strong>{formatWeightShare(ratings.dimensionWeightShares?.[key])}</strong></span>)}
        </div>
      </section>

      <section className="video-overall" style={{ opacity: overallSpring, transform: `scale(${0.82 + overallSpring * 0.18})`, borderColor: overallColor, boxShadow: `0 0 ${settings.overallGlowStrength * overallSpring}px ${overallColor}35` }}>
        <div className="video-section-label">{t(settings.uiLanguage, "overall")}</div>
        <OverallBadge overall={ratings.overall} overallScore={ratings.overallScore} language={settings.uiLanguage} className="video-overall__badge" />
      </section>
    </div>
  );
}
