import RadarChart from "./RadarChart.jsx";
import {
  DIMENSIONS, TIERS, TIER_COLORS,
} from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor, t } from "../utils/i18n.js";
import { formatWeightShare } from "../utils/scoring.js";
import { useRatingStore } from "../store/ratingStore.js";

const TIER_BG = {
  S: "#b8860022", A: "#ef444422", B: "#a855f722",
  C: "#38bdf822", D: "#22c55e22", E: "#64748b22",
};

export default function RatingPanel() {
  const {
    selectedStudent, getCurrentRatings,
    setDimensionRating, setDimensionWeightShare, uiLanguage,
    weightMode, setWeightMode,
  } = useRatingStore();

  if (!selectedStudent) return null;
  const ratings = getCurrentRatings();
  const dimLabels = DIMENSION_LABELS[localeFor(uiLanguage)] || DIMENSION_LABELS.zh;

  return (
    <div className="rating-section">
      {/* Radar chart left */}
      <div className="radar-container">
        <RadarChart ratings={ratings} size={430} language={uiLanguage} />
      </div>

      {/* Dimension controls right */}
      <div className="dims-panel">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
          {t(uiLanguage, "dimensions")}
        </div>
        <label className="dim-weight-mode">
          <span>{t(uiLanguage, "weightMode")}</span>
          <select value={weightMode} onChange={event => setWeightMode(event.target.value)}>
            <option value="shared">{t(uiLanguage, "sharedWeights")}</option>
            <option value="individual">{t(uiLanguage, "individualWeights")}</option>
          </select>
        </label>

        {DIMENSIONS.map(dim => {
          const current = ratings[dim.key];
          const currentWeightShare = ratings.dimensionWeightShares[dim.key];
          return (
            <div key={dim.key} className="dim-row">
              <div className="dim-label">
                {dimLabels[dim.key][0]}
                <span className="dim-label-en">{dimLabels[dim.key][1]}</span>
              </div>
              <div className="dim-btns">
                {TIERS.map(tier => {
                  const color   = TIER_COLORS[tier];
                  const selected = current === tier;
                  return (
                    <button
                      key={tier}
                      className={`tier-btn ${selected ? "selected" : ""}`}
                      style={{
                        color:      selected ? "#fff" : color,
                        background: selected ? color : TIER_BG[tier],
                        borderColor: selected ? color : "var(--border-bright)",
                      }}
                      onClick={() => setDimensionRating(dim.key, selected ? null : tier)}
                      title={selected ? "点击取消" : `设为 ${tier}`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
              <label className="dim-weight-row dim-weight-row--slider">
                <span>{t(uiLanguage, "dimensionWeight")}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={currentWeightShare}
                  onChange={event => setDimensionWeightShare(dim.key, Number(event.target.value))}
                />
                <input
                  className="dim-weight-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number(currentWeightShare).toFixed(1)}
                  onChange={event => setDimensionWeightShare(dim.key, Number(event.target.value))}
                />
                <strong>{formatWeightShare(currentWeightShare)}</strong>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
