import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHOOL_ICON_KEYS, SCHOOL_ICON_REMOTE_BASE, schoolIconRemoteUrl } from "../src/utils/schoolIcons.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public", "assets", "schoolicon");
const retries = 3;

async function fetchBytes(url, attempt = 1) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("image/png")) throw new Error(`unexpected content-type ${contentType || "unknown"}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt >= retries) throw error;
    await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    return fetchBytes(url, attempt + 1);
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

await fs.mkdir(outputDir, { recursive: true });

const manifest = {};
for (const key of SCHOOL_ICON_KEYS) {
  const url = schoolIconRemoteUrl(key);
  const target = path.join(outputDir, `${key}.png`);
  if (!await exists(target)) {
    const bytes = await fetchBytes(url);
    await fs.writeFile(target, bytes);
  }
  manifest[key] = {
    source: url,
    file: `${key}.png`,
  };
}

await fs.writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify({ generatedFrom: SCHOOL_ICON_REMOTE_BASE, schools: manifest }, null, 2)}\n`,
);

console.log(`Prepared ${SCHOOL_ICON_KEYS.length} school icons in ${path.relative(root, outputDir)}.`);
