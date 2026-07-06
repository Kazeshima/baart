import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readPngDimensions } from "../video/core/png.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "src-tauri", "generated", "renderer");
const nodeBinary = path.join(root, "src-tauri", "binaries", "baart-node-x86_64-pc-windows-msvc.exe");
const worker = path.join(generated, "app", "video", "sidecar", "worker.mjs");
const composition = path.join(generated, "composition");
const binaries = path.join(generated, "app", "node_modules", "@remotion", "compositor-win32-x64-msvc");
const workDir = path.join(root, ".cache", "packaged-renderer-smoke");
const outputDir = path.join(workDir, "output");
const browserCache = path.join(workDir, "node_modules", ".remotion", "chrome-for-testing");
const fixture = JSON.parse(await fs.readFile(path.join(root, "test", "fixtures", "render-project.json"), "utf8"));

if (process.argv.includes("--fresh-browser")) {
  await fs.rm(path.join(workDir, "node_modules", ".remotion"), { recursive: true, force: true });
}
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(workDir, "package.json"), JSON.stringify({ private: true }));

async function runSidecar(format) {
  const project = { ...fixture, settings: { ...fixture.settings, format, outputName: `packaged-${format}-smoke` } };
  const manifest = path.join(workDir, `${format}-project.json`);
  const output = format === "mp4" ? path.join(outputDir, "packaged-smoke.mp4") : path.join(outputDir, "packaged-smoke-frames");
  await fs.rm(output, { recursive: true, force: true });
  await fs.writeFile(manifest, JSON.stringify(project));

  const events = [];
  const stderr = [];
  await new Promise((resolve, reject) => {
    const child = spawn(nodeBinary, [worker, manifest, composition, output, binaries], {
      cwd: workDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("BAART_EVENT ")) continue;
        const event = JSON.parse(line.slice("BAART_EVENT ".length));
        events.push(event);
        if (event.type === "browserDownload") process.stdout.write(`\rDownloading Chrome ${Math.round((event.progress.percent || 0) * 100)}%`);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", code => {
      const workerError = events.find(event => event.type === "error")?.error;
      if (code !== 0 || workerError) reject(new Error(workerError || stderr.join("").trim() || `Packaged renderer exited with code ${code}.`));
      else resolve();
    });
  });

  if (!events.some(event => event.type === "complete")) throw new Error(`${format} sidecar did not emit completion.`);
  if (format === "mp4") {
    const bytes = await fs.readFile(output);
    if (bytes.length < 10_000 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") throw new Error("Packaged MP4 is invalid.");
  } else {
    const frames = (await fs.readdir(output)).filter(name => name.endsWith(".png")).sort();
    const expected = Math.round(project.settings.studentDuration * project.settings.fps) * project.records.length;
    if (frames.length !== expected) throw new Error(`Expected ${expected} PNG frames, found ${frames.length}.`);
    for (const name of [frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)]) {
      const dimensions = readPngDimensions(await fs.readFile(path.join(output, name)));
      if (dimensions.width !== project.settings.width || dimensions.height !== project.settings.height) {
        throw new Error(`${name} has incorrect dimensions ${dimensions.width}x${dimensions.height}.`);
      }
    }
  }
  console.log(`\nPackaged ${format.toUpperCase()} render passed: ${output}`);
}

await runSidecar("mp4");
const versionBefore = await fs.readFile(path.join(browserCache, "VERSION"), "utf8");
await runSidecar("png");
const versionAfter = await fs.readFile(path.join(browserCache, "VERSION"), "utf8");
if (versionBefore !== versionAfter) throw new Error("Chrome cache was not reused between packaged renders.");
console.log(`Chrome for Testing ${versionAfter.trim()} reused from ${browserCache}`);
