import React, { useMemo } from "react";
import { studentDisplayName } from "../../src/utils/studentDisplay.js";
import {
  PRODUCTION_ASSET_LAYERS,
  normalizeProductionAssetLayerSettings,
} from "../core/productionAssets.js";
import { vt } from "../core/i18n.js";
import { NumberControl } from "./StudioControls.jsx";

const LAYER_LABEL_KEYS = {
  decorations: "assetDecorations",
  portrait: "assetPortrait",
  specs: "assetSpecs",
  comments: "assetComments",
  radar: "assetRadar",
  overall: "assetOverall",
};

export default function ProductionAssetsPanel({
  settings,
  records,
  language,
  updateSetting,
  previewStudentId,
  setPreviewStudentId,
  previewLayer,
  setPreviewLayer,
}) {
  const allIds = useMemo(() => records.map(record => Number(record.student.id)), [records]);
  const selectedIds = useMemo(() => new Set(settings.productionAssetStudentIds === null ? allIds : settings.productionAssetStudentIds), [allIds, settings.productionAssetStudentIds]);
  const selectedLayers = new Set(settings.productionAssetLayers);
  const layerSettings = normalizeProductionAssetLayerSettings(settings.productionAssetLayerSettings);
  const activeSettings = layerSettings[previewLayer];

  const toggleStudent = id => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    updateSetting("productionAssetStudentIds", allIds.filter(value => next.has(value)));
  };
  const toggleLayer = layer => {
    const next = PRODUCTION_ASSET_LAYERS.filter(value => value === layer ? !selectedLayers.has(value) : selectedLayers.has(value));
    updateSetting("productionAssetLayers", next);
  };
  const updateLayerSetting = (key, value) => updateSetting("productionAssetLayerSettings", {
    ...layerSettings,
    [previewLayer]: { ...activeSettings, [key]: value },
  });

  return <section className="studio-panel studio-production-assets" data-testid="production-assets-panel">
    <h2>{vt(language, "productionAssets")}</h2>
    <p className="studio-help">{vt(language, "productionAssetsHelp")}</p>
    <div className="studio-subhead"><span>{vt(language, "assetStudents")}</span><div><button type="button" onClick={() => updateSetting("productionAssetStudentIds", null)}>{vt(language, "selectAll")}</button><button type="button" onClick={() => updateSetting("productionAssetStudentIds", [])}>{vt(language, "clearAll")}</button></div></div>
    <div className="studio-asset-students">
      {records.map(record => {
        const id = Number(record.student.id);
        return <label key={id}><input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleStudent(id)} /><span>{studentDisplayName(record.student, language)}</span><small>#{id}</small></label>;
      })}
    </div>
    <div className="studio-subhead"><span>{vt(language, "assetLayers")}</span><div><button type="button" onClick={() => updateSetting("productionAssetLayers", [...PRODUCTION_ASSET_LAYERS])}>{vt(language, "selectAll")}</button><button type="button" onClick={() => updateSetting("productionAssetLayers", [])}>{vt(language, "clearAll")}</button></div></div>
    <div className="studio-asset-layers">
      {PRODUCTION_ASSET_LAYERS.map(layer => <label key={layer}><input type="checkbox" checked={selectedLayers.has(layer)} onChange={() => toggleLayer(layer)} /><span>{vt(language, LAYER_LABEL_KEYS[layer])}</span></label>)}
    </div>
    <label className="studio-control"><span>{vt(language, "previewStudent")}</span><select value={previewStudentId || ""} onChange={event => setPreviewStudentId(Number(event.target.value))}>{records.map(record => <option key={record.student.id} value={record.student.id}>{studentDisplayName(record.student, language)}</option>)}</select></label>
    <label className="studio-control"><span>{vt(language, "previewLayer")}</span><select value={previewLayer} onChange={event => setPreviewLayer(event.target.value)}>{PRODUCTION_ASSET_LAYERS.map(layer => <option key={layer} value={layer}>{vt(language, LAYER_LABEL_KEYS[layer])}</option>)}</select></label>
    <NumberControl label={vt(language, "layerPositionX")} value={activeSettings.x} min={-1920} max={1920} step={5} onChange={value => updateLayerSetting("x", value)} />
    <NumberControl label={vt(language, "layerPositionY")} value={activeSettings.y} min={-1080} max={1080} step={5} onChange={value => updateLayerSetting("y", value)} />
    <NumberControl label={vt(language, "layerScale")} value={activeSettings.scale} min={0.1} max={3} step={0.05} onChange={value => updateLayerSetting("scale", value)} />
    <NumberControl label={vt(language, "layerOpacity")} value={activeSettings.opacity} min={0} max={1} step={0.05} onChange={value => updateLayerSetting("opacity", value)} />
  </section>;
}

export { LAYER_LABEL_KEYS };
