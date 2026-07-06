import {
  DIMENSIONS, OVERALL_LEVELS, OVERALL_COLORS,
} from "../utils/constants.js";
import { DIMENSION_LABELS, OVERALL_LABELS, localeFor, t } from "../utils/i18n.js";
import { weightMultiplier } from "../utils/scoring.js";
import { useRatingStore } from "../store/ratingStore.js";
import OverallBadge from "./presentation/OverallBadge.jsx";

const TIER_BG_MAP = {
  4: "#f0b42922", 3: "#ef444422", 2: "#a855f722",
  1: "#38bdf822", 0: "#64748b22",
};

export default function OverallRating() {
  const {
    selectedStudent, getCurrentRatings,
    setOverallRating, setOverallAuto,
    setNotes, uiLanguage,
  } = useRatingStore();

  if (!selectedStudent) return null;
  const ratings = getCurrentRatings();
  const { overall, overallScore, overallAuto, dimensionWeights, notes } = ratings;
  const locale = localeFor(uiLanguage);
  const dimensionLabels = DIMENSION_LABELS[locale] || DIMENSION_LABELS.zh;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="overall-section">
        {/* Big badge */}
        <OverallBadge overall={overall} overallScore={overallScore} language={uiLanguage} />

        {/* Controls */}
        <div className="overall-controls">
          <div className="overall-label">{t(uiLanguage, "overall")}</div>
          <div className="score-line">
            {t(uiLanguage, "overallScore")} {overallScore !== null ? overallScore.toFixed(1) : "--"} / 5.0
          </div>

          {/* Auto/manual toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <button
              className={`btn ${overallAuto ? "btn-primary" : "btn-ghost"}`}
              style={{ fontSize: 11 }}
              onClick={() => setOverallAuto(!overallAuto)}
              title={t(uiLanguage, "autoExplain")}
            >
              {overallAuto ? t(uiLanguage, "auto") : t(uiLanguage, "manual")}
            </button>
          </div>

          <div className="weight-summary">
            <span className="weight-summary__label">{t(uiLanguage, "weightsUsed")}</span>
            <div className="weight-summary__items">
              {DIMENSIONS.map(({ key }) => (
                <span key={key} className="weight-summary__item">
                  {dimensionLabels[key][0]} <strong>×{weightMultiplier(dimensionWeights[key])}</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Manual override tier buttons */}
          {!overallAuto && (
            <div className="overall-btns">
              {OVERALL_LEVELS.map(level => {
                const color    = OVERALL_COLORS[level];
                const selected = overall === level;
                const label    = OVERALL_LABELS[locale][level];
                return (
                  <button
                    key={level}
                    className={`overall-tier-btn ${selected ? "selected" : ""}`}
                    style={{
                      color:       selected ? "#fff" : color,
                      background:  selected ? color : TIER_BG_MAP[level],
                      borderColor: selected ? color : "var(--border-bright)",
                    }}
                    onClick={() => setOverallRating(selected ? null : level)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {overallAuto && (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {overallAuto ? t(uiLanguage, "autoExplain") : t(uiLanguage, "manualExplain")}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 5,
        }}>
          {t(uiLanguage, "notes")}
        </div>
        <textarea
          className="notes-area"
          placeholder={t(uiLanguage, "notesPlaceholder")}
          value={notes || ""}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
    </div>
  );
}
