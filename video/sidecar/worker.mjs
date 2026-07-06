import fs from "node:fs/promises";
import { renderVideoProject } from "../render-service.mjs";

const EVENT_PREFIX = "BAART_EVENT ";

function emit(type, value = {}) {
  process.stdout.write(`${EVENT_PREFIX}${JSON.stringify({ type, ...value })}\n`);
}

const [projectPath, serveUrl, outputLocation, binariesDirectory] = process.argv.slice(2);
if (!projectPath || !serveUrl || !outputLocation || !binariesDirectory) {
  throw new Error("Usage: worker <project.json> <serve-url> <output> <binaries-directory>");
}

try {
  const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
  let lastStatus = "";
  let lastProgress = -1;
  const output = await renderVideoProject(project, {
    onStatus: status => {
      if (status !== lastStatus) {
        lastStatus = status;
        emit("status", { status });
      }
    },
    onProgress: progress => {
      if (progress >= 1 || progress - lastProgress >= 0.01) {
        lastProgress = progress;
        emit("progress", { progress });
      }
    },
    onBrowserDownload: progress => emit("browserDownload", { progress }),
  }, { serveUrl, outputLocation, binariesDirectory });
  emit("complete", { output });
} catch (error) {
  emit("error", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
