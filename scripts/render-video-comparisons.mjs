import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { getTimeline } from "../video/core/config.js";
import { parseVideoProject } from "../video/core/manifest.js";
import { createRenderAssetServer, prepareRenderAssetMap } from "../video/core/renderAssets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".tmp", "video-comparison");
const cacheDir = path.join(root, ".cache", "render-assets");
const fixture = JSON.parse(await fs.readFile(path.join(root, "test", "fixtures", "render-project.json"), "utf8"));

function localizedRecord(language, overallLevel) {
  const zh = language === "zh";
  return {
    ...fixture.records[0],
    student: {
      ...fixture.records[0].student,
      name: zh ? "艾米" : "Eimi",
      familyName: zh ? "和泉元" : "Izumimoto",
      personalName: zh ? "艾米" : "Eimi",
    },
    ratings: {
      ...fixture.records[0].ratings,
      overall: overallLevel,
      overallScore: overallLevel === 4 ? 5 : 2.6,
      notes: zh
        ? "前排站位与自我回复能争取反击窗口，地形和伤害类型仍然重要。"
        : "Front-line sustain buys a counterattack window. Terrain still matters.",
    },
  };
}

function comparisonProject(language, theme, overallLevel = 2) {
  return parseVideoProject({
    ...fixture,
    settings: {
      ...fixture.settings,
      width: 1920,
      height: 1080,
      uiLanguage: language,
      dataLanguage: language,
      theme,
      outputName: `comparison-${language}-${theme}`,
    },
    records: [localizedRecord(language, overallLevel)],
  });
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const baseProject = comparisonProject("en", "dark");
await prepareRenderAssetMap(baseProject, { cacheDir, publicDir: path.join(root, "public") });
const assetServer = await createRenderAssetServer(cacheDir);

try {
  const serveUrl = await bundle({ entryPoint: path.join(root, "video", "remotion", "index.jsx") });
  for (const language of ["zh", "en"]) {
    for (const theme of ["light", "dark"]) {
      for (const overallLevel of [2, 4]) {
      const project = comparisonProject(language, theme, overallLevel);
      const { assetMap } = await prepareRenderAssetMap(project, {
        cacheDir,
        publicDir: path.join(root, "public"),
        baseUrl: assetServer.baseUrl,
      });
      project.settings.assetMap = assetMap;
      const inputProps = { project };
      const composition = await selectComposition({
        serveUrl,
        id: "ArenaRatingVideo",
        inputProps,
        chromeMode: "chrome-for-testing",
      });
      const timeline = getTimeline(project.settings);
      const frame = Math.max(0, Math.min(timeline.fadeOutStart - 2, timeline.overallEnd + 2));
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame,
        output: path.join(outputDir, `${language}-${theme}-overall-${overallLevel}.png`),
        imageFormat: "png",
        chromeMode: "chrome-for-testing",
        logLevel: "error",
      });
      console.log(`Rendered ${language}/${theme}/overall-${overallLevel} comparison frame ${frame}.`);
      }
    }
  }
} finally {
  await assetServer.close();
}

console.log(`Video comparisons written to ${path.relative(root, outputDir)}.`);
