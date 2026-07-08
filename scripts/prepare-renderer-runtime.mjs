import crypto from "node:crypto";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "24.18.0";
const archiveName = `node-v${version}-win-x64.zip`;
const archiveUrl = `https://nodejs.org/dist/v${version}/${archiveName}`;
const archiveHash = "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821";
const cacheDir = path.join(root, ".cache", "renderer-runtime");
const archivePath = path.join(cacheDir, archiveName);
const extractedDir = path.join(cacheDir, `node-v${version}-win-x64`);
const generatedDir = path.join(root, "src-tauri", "generated", "renderer");
const runtimeAppDir = path.join(generatedDir, "app");
const binaryPath = path.join(root, "src-tauri", "binaries", "baart-node-x86_64-pc-windows-msvc.exe");

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function sha256(file) {
  const data = await fs.readFile(file);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function download(url, output) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url), output).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Node runtime download failed with HTTP ${response.statusCode}.`));
        return;
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => fs.writeFile(output, Buffer.concat(chunks)).then(resolve, reject));
    });
    request.on("error", reject);
  });
}

async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true, shell: false });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The packaged BAART renderer currently supports Windows x64 only.");
}

if (!await exists(archivePath) || await sha256(archivePath) !== archiveHash) {
  await fs.rm(archivePath, { force: true });
  console.log(`Downloading pinned Node.js ${version} runtime...`);
  await download(archiveUrl, archivePath);
}
if (await sha256(archivePath) !== archiveHash) throw new Error("Downloaded Node.js archive failed SHA-256 verification.");

if (!await exists(path.join(extractedDir, "node.exe"))) {
  await fs.rm(extractedDir, { recursive: true, force: true });
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${cacheDir.replaceAll("'", "''")}' -Force`]);
}

await fs.mkdir(path.dirname(binaryPath), { recursive: true });
await fs.copyFile(path.join(extractedDir, "node.exe"), binaryPath);
await fs.mkdir(path.join(generatedDir, "licenses", "node"), { recursive: true });
await fs.copyFile(path.join(extractedDir, "LICENSE"), path.join(generatedDir, "licenses", "node", "LICENSE"));

const sidecarDir = path.join(root, "video", "sidecar");
if (!await exists(path.join(sidecarDir, "node_modules", "@remotion", "renderer", "package.json"))) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm executable path is unavailable.");
  await run(process.execPath, [npmCli, "ci", "--omit=dev", "--cache", path.join(root, ".cache", "npm")], sidecarDir);
}

await fs.rm(runtimeAppDir, { recursive: true, force: true });
await fs.mkdir(path.join(runtimeAppDir, "video", "sidecar"), { recursive: true });
await fs.mkdir(path.join(runtimeAppDir, "src"), { recursive: true });
await fs.mkdir(path.join(runtimeAppDir, "public", "assets"), { recursive: true });
await fs.writeFile(path.join(runtimeAppDir, "package.json"), JSON.stringify({ private: true, type: "module" }));
await fs.copyFile(path.join(root, "video", "render-service.mjs"), path.join(runtimeAppDir, "video", "render-service.mjs"));
await fs.copyFile(path.join(sidecarDir, "worker.mjs"), path.join(runtimeAppDir, "video", "sidecar", "worker.mjs"));
await fs.cp(path.join(root, "video", "core"), path.join(runtimeAppDir, "video", "core"), { recursive: true });
await fs.cp(path.join(root, "src", "utils"), path.join(runtimeAppDir, "src", "utils"), { recursive: true });
await fs.cp(path.join(root, "public", "assets", "schoolicon"), path.join(runtimeAppDir, "public", "assets", "schoolicon"), { recursive: true });
await fs.cp(path.join(sidecarDir, "node_modules"), path.join(runtimeAppDir, "node_modules"), { recursive: true });

const compositionDir = path.join(generatedDir, "composition");
await fs.rm(compositionDir, { recursive: true, force: true });
await bundle({
  entryPoint: path.join(root, "video", "remotion", "index.jsx"),
  outDir: compositionDir,
  enableCaching: true,
  symlinkPublicDir: false,
  onProgress: progress => process.stdout.write(`\rBundling renderer ${Math.round(progress)}%`),
});

const requiredRuntimeFiles = [
  binaryPath,
  path.join(runtimeAppDir, "package.json"),
  path.join(runtimeAppDir, "video", "sidecar", "worker.mjs"),
  path.join(runtimeAppDir, "video", "render-service.mjs"),
  path.join(runtimeAppDir, "video", "core", "manifest.js"),
  path.join(runtimeAppDir, "video", "core", "renderAssets.js"),
  path.join(runtimeAppDir, "src", "utils", "constants.js"),
  path.join(runtimeAppDir, "src", "utils", "schoolIcons.js"),
  path.join(runtimeAppDir, "src", "utils", "studentDisplay.js"),
  path.join(runtimeAppDir, "public", "assets", "schoolicon", "Millennium.png"),
  path.join(runtimeAppDir, "node_modules", "@remotion", "renderer", "package.json"),
  path.join(runtimeAppDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", "remotion.exe"),
  path.join(compositionDir, "index.html"),
];
const missingRuntimeFiles = [];
for (const file of requiredRuntimeFiles) {
  if (!await exists(file)) missingRuntimeFiles.push(path.relative(root, file));
}
if (missingRuntimeFiles.length) {
  throw new Error(`Renderer runtime is incomplete:\n${missingRuntimeFiles.join("\n")}`);
}
await run(binaryPath, ["--check", path.join(runtimeAppDir, "video", "sidecar", "worker.mjs")], runtimeAppDir);
process.stdout.write("\nRenderer runtime prepared.\n");
