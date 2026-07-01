import RadarChart from "./RadarChart.jsx";
import {
  DIMENSIONS, TIERS, TIER_COLORS,
} from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor, t } from "../utils/i18n.js";
import { useRatingStore } from "../store/ratingStore.js";

const WEIGHT_OPTIONS = [
  ["none", "costNone"],
  ["half", "costHalf"],
  ["full", "costFull"],
];

const TIER_BG = {
  S: "#b8860022", A: "#ef444422", B: "#a855f722",
  C: "#38bdf822", D: "#22c55e22", E: "#64748b22",
};

export default function RatingPanel() {
  const {
    selectedStudent, getCurrentRatings,
    setDimensionRating, setDimensionWeight, uiLanguage,
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

        {DIMENSIONS.map(dim => {
          const current = ratings[dim.key];
          const currentWeight = ratings.dimensionWeights[dim.key];
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
              <div className="dim-weight-row">
                <span>{t(uiLanguage, "dimensionWeight")}</span>
                {WEIGHT_OPTIONS.map(([weight, labelKey]) => (
                  <button
                    key={weight}
                    className={`weight-btn weight-btn--compact ${currentWeight === weight ? "active" : ""}`}
                    onClick={() => setDimensionWeight(dim.key, weight)}
                  >
                    {t(uiLanguage, labelKey)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
