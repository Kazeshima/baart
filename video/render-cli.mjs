import fs from "node:fs/promises";
import path from "node:path";
import { renderVideoProject } from "./render-service.mjs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: npm run video:render -- <project.baart-video.json>");
  process.exit(1);
}

const project = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8"));
const output = await renderVideoProject(project, {
  onStatus: status => console.log(status),
  onProgress: progress => process.stdout.write(`\r${Math.round(progress * 100)}%`),
});
console.log(`\nRendered to ${output}`);
