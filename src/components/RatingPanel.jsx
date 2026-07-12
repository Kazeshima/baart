import RadarChart from "./RadarChart.jsx";
import { WeightShareControl } from "./weights/WeightInputs.jsx";
import {
  DIMENSIONS, TIERS, TIER_COLORS,
} from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor, t } from "../utils/i18n.js";
import { WEIGHT_EDITOR_MODES, adjustFineWeightShare, formatWeightShare, normalizeFineWeightState } from "../utils/scoring.js";
import { useRatingStore } from "../store/ratingStore.js";

const TIER_BG = {
  S: "#b8860022", A: "#ef444422", B: "#a855f722",
  C: "#38bdf822", D: "#22c55e22", E: "#64748b22",
};

const PRESET_WEIGHTS = ["none", "half", "full"];

export default function RatingPanel() {
  const {
    selectedStudent, getCurrentRatings,
    setDimensionRating, setDimensionWeightShare, uiLanguage,
    setDimensionWeight,
    weightMode, setWeightMode,
    weightEditorMode, setWeightEditorMode,
  } = useRatingStore();

  if (!selectedStudent) return null;
  const ratings = getCurrentRatings();
  const dimLabels = DIMENSION_LABELS[localeFor(uiLanguage)] || DIMENSION_LABELS.zh;
  const fineState = normalizeFineWeightState({ dimensionWeightShares: ratings.dimensionWeightShares });
  const unassigned = fineState.unassignedWeightShare;
  const isFineMode = weightEditorMode !== WEIGHT_EDITOR_MODES.preset;
  const commitDimensionWeightShare = (dimension, value) => {
    const next = adjustFineWeightShare(ratings.dimensionWeightShares, dimension, value).dimensionWeightShares[dimension];
    setDimensionWeightShare(dimension, value);
    return next;
  };

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
        <label className="dim-weight-mode">
          <span>{t(uiLanguage, "weightEditorMode")}</span>
          <select value={weightEditorMode} onChange={event => setWeightEditorMode(event.target.value)}>
            <option value="fine">{t(uiLanguage, "fineWeights")}</option>
            <option value="preset">{t(uiLanguage, "presetWeights")}</option>
          </select>
        </label>
        {isFineMode && (
          <div className={`unassigned-weight ${unassigned > 0 ? "is-incomplete" : ""}`}>
            <div>
              <span>{t(uiLanguage, "unassignedWeight")}</span>
              <strong>{formatWeightShare(unassigned)}</strong>
            </div>
            <progress value={unassigned} max="100" />
            {unassigned > 0 && <small>{t(uiLanguage, "incompleteWeights")}</small>}
          </div>
        )}

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
              {isFineMode ? (
                <WeightShareControl
                  className="dim-weight-row dim-weight-row--slider"
                  numberClassName="dim-weight-input"
                  label={t(uiLanguage, "dimensionWeight")}
                  value={currentWeightShare}
                  onChange={value => setDimensionWeightShare(dim.key, value)}
                  onCommit={value => commitDimensionWeightShare(dim.key, value)}
                />
              ) : (
                <div className="dim-weight-row dim-weight-row--presets">
                  <span>{t(uiLanguage, "dimensionWeight")}</span>
                  {PRESET_WEIGHTS.map(weight => (
                    <button
                      key={weight}
                      className={`weight-btn weight-btn--compact ${ratings.dimensionWeights[dim.key] === weight ? "active" : ""}`}
                      type="button"
                      onClick={() => setDimensionWeight(dim.key, weight)}
                    >
                      {weight === "none" ? t(uiLanguage, "costNone") : weight === "half" ? t(uiLanguage, "costHalf") : t(uiLanguage, "costFull")}
                    </button>
                  ))}
                  <strong>{formatWeightShare(currentWeightShare)}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
