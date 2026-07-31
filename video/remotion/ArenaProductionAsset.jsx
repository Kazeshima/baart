import React from "react";
import { AbsoluteFill } from "remotion";
import { orderedProjectRecords } from "../core/manifest.js";
import { PRODUCTION_ASSET_LAYERS } from "../core/productionAssets.js";
import StudentScene from "./StudentScene.jsx";

export default function ArenaProductionAsset({ project, studentId, layer }) {
  const records = orderedProjectRecords(project);
  const record = records.find(item => Number(item.student.id) === Number(studentId)) || records[0];
  const productionLayer = PRODUCTION_ASSET_LAYERS.includes(layer) ? layer : PRODUCTION_ASSET_LAYERS[0];
  if (!record) return <AbsoluteFill style={{ background: "transparent" }} />;
  return <AbsoluteFill style={{ background: "transparent" }}>
    <StudentScene record={record} settings={project.settings} productionLayer={productionLayer} />
  </AbsoluteFill>;
}
