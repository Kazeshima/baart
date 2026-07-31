import fs from "node:fs/promises";
import path from "node:path";
import { renderVideoProject } from "./render-service.mjs";
import { readPngColorType, readPngDimensions } from "./core/png.js";

const fixture = JSON.parse(await fs.readFile(new URL("../test/fixtures/render-project.json", import.meta.url), "utf8"));
const format = process.argv[2] || "png";
if (!["png", "prores"].includes(format)) throw new Error("Production asset smoke format must be png or prores.");

const studentId = fixture.records[0].student.id;
const project = {
  ...fixture,
  settings: {
    ...fixture.settings,
    renderMode: "productionAssets",
    format,
    outputName: `baart-production-assets-smoke-${format}`,
    productionAssetStudentIds: [studentId],
    productionAssetLayers: format === "png" ? ["decorations", "overall"] : ["overall"],
  },
};

const output = await renderVideoProject(project, {
  onProgress: progress => process.stdout.write(`\r${format.toUpperCase()} assets ${Math.round(progress * 100)}%`),
});
const manifest = JSON.parse(await fs.readFile(path.join(output, "production-assets.json"), "utf8"));
if (manifest.kind !== "baart-production-assets" || manifest.alpha !== true) throw new Error("Production asset manifest is invalid.");
const layerOutputs = manifest.students[0]?.layers || [];
if (layerOutputs.length !== project.settings.productionAssetLayers.length) throw new Error("Production asset manifest has incorrect layer outputs.");

if (format === "png") {
  const expected = project.settings.studentDuration * project.settings.fps;
  const samples = [];
  for (const layer of layerOutputs) {
    const layerOutput = path.join(output, ...layer.output.split("/"));
    const frames = (await fs.readdir(layerOutput)).filter(name => name.endsWith(".png")).sort();
    if (frames.length !== expected) throw new Error(`Expected ${expected} transparent ${layer.layer} frames, found ${frames.length}.`);
    const contents = await fs.readFile(path.join(layerOutput, frames[Math.floor(frames.length * 0.8)]));
    const dimensions = readPngDimensions(contents);
    if (dimensions.width !== project.settings.width || dimensions.height !== project.settings.height) throw new Error("Production PNG dimensions are incorrect.");
    if (readPngColorType(contents) !== 6) throw new Error("Production PNG is not RGBA.");
    samples.push(contents);
  }
  if (samples.length > 1 && samples[0].equals(samples[1])) throw new Error("Distinct production layers rendered identical PNG content.");
} else {
  const layerOutput = path.join(output, ...layerOutputs[0].output.split("/"));
  const stat = await fs.stat(layerOutput);
  if (stat.size < 10_000) throw new Error("Production ProRes file is unexpectedly small.");
}

console.log(`\nTransparent ${format.toUpperCase()} production asset rendered to ${output}`);
