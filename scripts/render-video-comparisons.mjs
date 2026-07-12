import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { DEFAULT_VIDEO_SETTINGS, getTimeline } from "../video/core/config.js";
import { parseVideoProject } from "../video/core/manifest.js";
import { createRenderAssetServer, prepareRenderAssetMap } from "../video/core/renderAssets.js";
import { LANG_URLS } from "../src/utils/constants.js";
import { parseStudents } from "../src/utils/students.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".tmp", "video-comparison");
const cacheDir = path.join(root, ".cache", "render-assets");
const fixture = JSON.parse(await fs.readFile(path.join(root, "test", "fixtures", "render-project.json"), "utf8"));

const comparisonComments = Object.freeze({
  en: "Kadenokouji Yukari (Swimsuit) is a matchup-sensitive Arena option whose value changes with terrain, cover, opening skill order, enemy damage type, and whether the team survives the first burst cycle. This long comment verifies wrapping and scrolling against the final output layout.",
  zh: "勘解由小路  紫草（泳装）在竞技场里更像是针对环境的精密工具。地形适性、掩体站位、开局技能牌序、对手伤害类型以及队伍能否撑过第一轮爆发都会改变她的实际价值。这段中英混排评价用于验证最终视频布局中的换行和滚动。Arena PvP layout stress test.",
});

const studentsByLanguage = Object.fromEntries(await Promise.all(["zh", "en"].map(async language => {
  const response = await fetch(LANG_URLS[language]);
  if (!response.ok) throw new Error(`Student data HTTP ${response.status}`);
  const student = parseStudents(await response.json()).find(item => Number(item.id) === 10121);
  if (!student) throw new Error(`Student 10121 missing from ${language} data`);
  return [language, student];
})));

function localizedRecord(language, overallLevel) {
  return {
    ...fixture.records[0],
    student: { ...studentsByLanguage[language], bulletType: "Explosion" },
    ratings: {
      ...fixture.records[0].ratings,
      overall: overallLevel,
      overallScore: overallLevel === 4 ? 5 : 2.6,
      notes: comparisonComments[language],
    },
  };
}

function comparisonProject(language, theme, overallLevel = 2) {
  return parseVideoProject({
    ...fixture,
    settings: {
      ...fixture.settings,
      ...DEFAULT_VIDEO_SETTINGS,
      width: 1920,
      height: 1080,
      uiLanguage: language,
      dataLanguage: language,
      theme,
      portraitOpacity: 1,
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
      if (overallLevel === 2) {
        const holdFrame = Math.max(frame, timeline.fadeOutStart - Math.max(2, Math.round(project.settings.fps * 0.35)));
        await renderStill({
          serveUrl,
          composition,
          inputProps,
          frame: holdFrame,
          output: path.join(outputDir, `${language}-${theme}-hold-late.png`),
          imageFormat: "png",
          chromeMode: "chrome-for-testing",
          logLevel: "error",
        });
        console.log(`Rendered ${language}/${theme}/hold-late comparison frame ${holdFrame}.`);
      }
      }
    }
  }
} finally {
  await assetServer.close();
}

console.log(`Video comparisons written to ${path.relative(root, outputDir)}.`);
