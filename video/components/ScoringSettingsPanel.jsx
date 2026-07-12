import React from "react";
import { WeightShareControl } from "../../src/components/weights/WeightInputs.jsx";
import { DIMENSIONS } from "../../src/utils/constants.js";
import { DIMENSION_LABELS, localeFor } from "../../src/utils/i18n.js";
import { WEIGHT_EDITOR_MODES, adjustFineWeightShare, formatWeightShare, normalizeFineWeightState } from "../../src/utils/scoring.js";
import { vt } from "../core/i18n.js";

export default function ScoringSettingsPanel({ settings, language, updateSetting, updateSharedPresetWeight, updateSharedWeightShare }) {
  const labels = DIMENSION_LABELS[localeFor(language)] || DIMENSION_LABELS.zh;
  const fineState = normalizeFineWeightState({ dimensionWeightShares: settings.sharedDimensionWeightShares });

  let weightControls = <p className="studio-help">{vt(language, "individualWeightsHelp")}</p>;
  if (settings.weightMode === "shared" && settings.weightEditorMode === WEIGHT_EDITOR_MODES.preset) {
    weightControls = DIMENSIONS.map(({ key }) => <div key={key} className="studio-control studio-control--presets">
      <span>{labels[key][0]}</span>
      <div>{["none", "half", "full"].map(weight => <button key={weight} type="button" className={settings.sharedDimensionWeights?.[key] === weight ? "active" : ""} onClick={() => updateSharedPresetWeight(key, weight)}>{vt(language, weight === "none" ? "weightNone" : weight === "half" ? "weightHalf" : "weightFull")}</button>)}</div>
    </div>);
  } else if (settings.weightMode === "shared") {
    weightControls = <>
      <div className={`studio-unassigned ${fineState.unassignedWeightShare > 0 ? "is-incomplete" : ""}`}><span>{vt(language, "unassignedWeight")}</span><strong>{formatWeightShare(fineState.unassignedWeightShare)}</strong><progress value={fineState.unassignedWeightShare} max="100" /></div>
      {fineState.unassignedWeightShare > 0 ? <p className="studio-help studio-help--warning">{vt(language, "incompleteWeights")}</p> : null}
      {DIMENSIONS.map(({ key }) => <WeightShareControl
        key={key}
        className="studio-control studio-control--weight"
        label={labels[key][0]}
        value={fineState.dimensionWeightShares?.[key]}
        onChange={value => {
          const next = adjustFineWeightShare(settings.sharedDimensionWeightShares, key, value).dimensionWeightShares[key];
          updateSharedWeightShare(key, value);
          return next;
        }}
      />)}
    </>;
  }

  return <section className="studio-panel"><h2>{vt(language, "scoring")}</h2>
    <label className="studio-control"><span>{vt(language, "weightMode")}</span><select value={settings.weightMode} onChange={event => updateSetting("weightMode", event.target.value)}><option value="shared">{vt(language, "sharedWeights")}</option><option value="individual">{vt(language, "individualWeights")}</option></select></label>
    <label className="studio-control"><span>{vt(language, "weightEditorMode")}</span><select value={settings.weightEditorMode} onChange={event => updateSetting("weightEditorMode", event.target.value)}><option value="fine">{vt(language, "fineWeights")}</option><option value="preset">{vt(language, "presetWeights")}</option></select></label>
    {weightControls}
  </section>;
}
