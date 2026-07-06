import fs from "node:fs/promises";
import path from "node:path";
import { renderVideoProject } from "./render-service.mjs";
import { readPngDimensions } from "./core/png.js";

const fixture = JSON.parse(await fs.readFile(new URL("../test/fixtures/render-project.json", import.meta.url), "utf8"));

const requestedFormat = process.argv[2];
const formats = requestedFormat ? [requestedFormat] : ["mp4", "png"];
if (formats.some(format => !["mp4", "png"].includes(format))) {
  throw new Error("Smoke format must be mp4 or png.");
}

for (const format of formats) {
  const project = {
    ...fixture,
    settings: {
      ...fixture.settings,
      format,
      outputName: `baart-smoke-${format}`,
    },
  };
  const output = await renderVideoProject(project, {
    onProgress: progress => process.stdout.write(`\r${format.toUpperCase()} ${Math.round(progress * 100)}%`),
  });
  const stat = await fs.stat(output);
  if (format === "png") {
    const frames = (await fs.readdir(output)).filter(name => name.endsWith(".png")).sort();
    const expectedFrames = project.settings.studentDuration * project.settings.fps * project.records.length;
    if (frames.length !== expectedFrames) throw new Error(`Expected ${expectedFrames} PNG frames, found ${frames.length}.`);
    for (const name of [frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)]) {
      const dimensions = readPngDimensions(await fs.readFile(path.join(output, name)));
      if (dimensions.width !== project.settings.width || dimensions.height !== project.settings.height) {
        throw new Error(`${name} is ${dimensions.width}x${dimensions.height}, expected ${project.settings.width}x${project.settings.height}.`);
      }
    }
  } else if (stat.size < 10_000) {
    throw new Error("Smoke MP4 is unexpectedly small.");
  }
  console.log(`\n${format.toUpperCase()} rendered to ${output}`);
}
