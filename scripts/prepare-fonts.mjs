import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public", "assets", "fonts");
const cssTarget = path.join(outputDir, "fonts.css");
const manifestTarget = path.join(outputDir, "manifest.json");
const displayText = "夯顶级人上NPC拉完了GOATAlphaNormie+Loser0123456789.?";
const sourceUrls = [
  "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap",
  `https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Long+Cang&display=swap&text=${encodeURIComponent(displayText)}`,
];
const retries = 3;

async function fetchResponse(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } catch (error) {
    if (attempt >= retries) throw error;
    await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    return fetchResponse(url, attempt + 1);
  }
}

async function cacheIsComplete() {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestTarget, "utf8"));
    if (JSON.stringify(manifest.sourceUrls) !== JSON.stringify(sourceUrls)) return false;
    await fs.access(cssTarget);
    await Promise.all(manifest.files.map(file => fs.access(path.join(outputDir, file))));
    return true;
  } catch {
    return false;
  }
}

if (!await cacheIsComplete()) {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const cssParts = [];
  for (const url of sourceUrls) cssParts.push(await (await fetchResponse(url)).text());
  let css = cssParts.join("\n");
  const fontUrls = Array.from(new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(match => match[1])));
  const files = [];

  for (const [index, url] of fontUrls.entries()) {
    const filename = `font-${String(index + 1).padStart(2, "0")}.woff2`;
    const fontResponse = await fetchResponse(url);
    const contentType = fontResponse.headers.get("content-type") || "";
    if (!/font\/woff2|application\/font-woff2|application\/octet-stream/i.test(contentType)) {
      throw new Error(`unexpected font content-type ${contentType || "unknown"}`);
    }
    await fs.writeFile(path.join(outputDir, filename), Buffer.from(await fontResponse.arrayBuffer()));
    css = css.split(url).join(`./${filename}`);
    files.push(filename);
  }

  await fs.writeFile(cssTarget, `/* Generated local BAART font bundle. Do not edit. */\n${css.trim()}\n`);
  await fs.writeFile(manifestTarget, `${JSON.stringify({ sourceUrls, files }, null, 2)}\n`);
}

console.log(`Prepared local UI fonts in ${path.relative(root, outputDir)}.`);
