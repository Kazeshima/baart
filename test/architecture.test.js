import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportFilenamePart, makeStoredZip, normalizeExportRatings } from "../src/export/exportPipeline.js";

test("export pipeline owns filename normalization, rating normalization, and stored ZIP encoding", () => {
  assert.equal(exportFilenamePart('10001:A/B*?'), "10001_A_B__");
  const normalized = normalizeExportRatings({ blindspot: "S", counter: "A", defense: "B", antiCounter: "C", cost: "D" });
  assert.ok(Math.abs(normalized.overallScore - 3) < 1e-9);
  const zip = makeStoredZip([{ name: "card.svg", data: new TextEncoder().encode("<svg/>") }]);
  assert.deepEqual(Array.from(zip.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual(Array.from(zip.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06]);
});

test("architecture boundaries keep transport, render jobs, and controls out of orchestrators", async () => {
  const [store, fileTransport, exportCard, cardSvg, exportPipeline, videoStudio, renderHook, weightPanel, ratingPanel] = await Promise.all([
    readFile(new URL("../src/store/ratingStore.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/fileTransport.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ExportCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/export/cardSvg.js", import.meta.url), "utf8"),
    readFile(new URL("../src/export/exportPipeline.js", import.meta.url), "utf8"),
    readFile(new URL("../video/VideoStudio.jsx", import.meta.url), "utf8"),
    readFile(new URL("../video/hooks/useVideoRenderJob.js", import.meta.url), "utf8"),
    readFile(new URL("../video/components/ScoringSettingsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/RatingPanel.jsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(store, /invoke\(|URL\.createObjectURL/);
  assert.match(fileTransport, /invoke\("save_text_as"/);
  assert.doesNotMatch(exportCard, /CRC_TABLE|canvas\.toBlob|FileReader/);
  assert.match(exportCard, /useCardExport\(buildExportSVG\)/);
  assert.match(cardSvg, /buildCompactSVG|buildFullSVG/);
  assert.match(exportPipeline, /makeStoredZip|svgToPngBytes|inlineSvgImages/);
  assert.match(videoStudio, /useVideoRenderJob|usePreviewTelemetry|VideoSettingsSidebar/);
  assert.doesNotMatch(videoStudio, /setInterval\(|benchmarkRenderSettings/);
  assert.match(renderHook, /setInterval\(|benchmarkRenderSettings/);
  assert.match(weightPanel, /WeightShareControl/);
  assert.match(ratingPanel, /WeightShareControl/);
});

test("React and static SVG radar adapters share one geometry model", async () => {
  const [reactRadar, cardSvg] = await Promise.all([
    readFile(new URL("../src/components/RadarChart.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/export/cardSvg.js", import.meta.url), "utf8"),
  ]);
  assert.match(reactRadar, /createRadarRenderModel/);
  assert.match(cardSvg, /createRadarRenderModel/);
  assert.doesNotMatch(cardSvg, /Math\.cos|Math\.sin/);
});
