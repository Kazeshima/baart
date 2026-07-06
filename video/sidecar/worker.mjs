import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const EVENT_PREFIX = "BAART_EVENT ";

function emit(type, value = {}) {
  process.stdout.write(`${EVENT_PREFIX}${JSON.stringify({ type, ...value })}\n`);
}

export async function runWorker(argv = process.argv.slice(2), io = {}) {
  const emitEvent = io.emit || emit;
  const [projectPath, serveUrl, outputLocation, binariesDirectory] = argv;
  if (!projectPath || !serveUrl || !outputLocation || !binariesDirectory) {
    const error = new Error("Usage: worker <project.json> <serve-url> <output> <binaries-directory>");
    emitEvent("error", { error: error.message });
    if (io.exit) {
      io.exit(1);
    } else {
      process.exitCode = 1;
    }
    return { ok: false, error };
  }

  try {
    const renderVideoProject = io.renderVideoProject || (await import("../render-service.mjs")).renderVideoProject;
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    let lastStatus = "";
    let lastProgress = -1;
    const output = await renderVideoProject(project, {
      onStatus: status => {
        if (status !== lastStatus) {
          lastStatus = status;
          emitEvent("status", { status });
        }
      },
      onProgress: progress => {
        if (progress >= 1 || progress - lastProgress >= 0.01) {
          lastProgress = progress;
          emitEvent("progress", { progress });
        }
      },
      onBrowserDownload: progress => emitEvent("browserDownload", { progress }),
    }, {
      serveUrl,
      outputLocation,
      binariesDirectory,
    });
    emitEvent("complete", { output });
    return { ok: true, output };
  } catch (error) {
    emitEvent("error", { error: error instanceof Error ? error.message : String(error) });
    if (io.exit) {
      io.exit(1);
    } else {
      process.exitCode = 1;
    }
    return { ok: false, error };
  }
}

const isDirectExecution = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  await runWorker();
}
