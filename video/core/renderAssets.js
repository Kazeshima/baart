import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ADAPT_ICON_URL, ATTACK_ICON, COVER_ICON, DEFENSE_ICON, TERRAIN_ICONS } from "../../src/utils/constants.js";
import { schoolIconPath } from "../../src/utils/schoolIcons.js";

const ASSET_TIMEOUT_MS = 20_000;
const RETRIES = 3;
const CACHE_CONCURRENCY = 8;

export function studentPortraitUrl(id) {
  return `https://schaledb.com/images/student/portrait/${id}.webp`;
}

export function renderAssetCacheKey(url) {
  const parsed = new URL(url, "http://baart.local");
  const extension = path.extname(parsed.pathname) || ".asset";
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
  return `${hash}${extension}`;
}

export function collectRenderAssetUrls(project) {
  const urls = new Set([
    ATTACK_ICON,
    DEFENSE_ICON,
    COVER_ICON,
    ...Object.values(TERRAIN_ICONS),
    ...[1, 2, 3, 4, 5].map(ADAPT_ICON_URL),
  ]);
  for (const record of project.records || []) {
    if (record?.student?.id) urls.add(studentPortraitUrl(record.student.id));
    const schoolIcon = schoolIconPath(record?.student?.school);
    if (schoolIcon) urls.add(schoolIcon);
  }
  return [...urls].filter(Boolean);
}

function isLocalPublicAsset(url) {
  return String(url || "").startsWith("/assets/");
}

function localPublicAssetPath(url, publicDir) {
  const parsed = new URL(url, "http://baart.local");
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  if (relative.includes("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid local asset path ${url}`);
  }
  return path.join(publicDir, relative);
}

async function fetchBytes(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt >= RETRIES) throw error;
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    return fetchBytes(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function cacheOneAsset(url, cacheDir, options = {}) {
  const key = renderAssetCacheKey(url);
  const target = path.join(cacheDir, key);
  try {
    await fs.access(target);
  } catch {
    const bytes = isLocalPublicAsset(url)
      ? await fs.readFile(localPublicAssetPath(url, options.publicDir))
      : await fetchBytes(url);
    await fs.writeFile(target, bytes);
  }
  return { key, fileUrl: pathToFileURL(target).href };
}

export async function prepareRenderAssetMap(project, options = {}) {
  const cacheDir = options.cacheDir || path.join(process.cwd(), ".cache", "render-assets");
  const publicDir = options.publicDir || path.join(process.cwd(), "public");
  await fs.mkdir(cacheDir, { recursive: true });
  const assetMap = {};
  const failures = [];
  const urls = collectRenderAssetUrls(project);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      try {
        const cached = await cacheOneAsset(url, cacheDir, { publicDir });
        assetMap[url] = options.baseUrl ? `${options.baseUrl}/${cached.key}` : cached.fileUrl;
      } catch (error) {
        const message = `${url}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        if (/\/student\/portrait\//.test(url)) {
          throw new Error(`Failed to cache required portrait asset. ${message}`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CACHE_CONCURRENCY, urls.length) }, () => worker()));
  return { assetMap, failures, cacheDir };
}

export async function createRenderAssetServer(cacheDir) {
  await fs.mkdir(cacheDir, { recursive: true });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const key = path.basename(decodeURIComponent(url.pathname));
      if (!/^[a-f0-9]{24}\.[a-z0-9]+$/i.test(key)) {
        response.writeHead(404).end();
        return;
      }
      const file = path.join(cacheDir, key);
      const bytes = await fs.readFile(file);
      response.writeHead(200, {
        "content-type": key.endsWith(".webp") ? "image/webp" : key.endsWith(".png") ? "image/png" : "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
