import { DEFAULT_RATINGS } from "../utils/constants.js";
import { WEIGHT_EDITOR_MODES, recalculateRatings } from "../utils/scoring.js";

export const CARD_DIMENSIONS = Object.freeze({
  compact: Object.freeze({ width: 960, height: 540, avatar: 148, radar: 330 }),
  full: Object.freeze({ width: 1280, height: 720, portrait: 310, radar: 420 }),
});

export function exportFilenamePart(value) {
  return String(value || "student").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

export function normalizeExportRatings(raw) {
  const ratings = { ...DEFAULT_RATINGS(), ...raw };
  if (typeof ratings.overall === "string") {
    ratings.overall = { E: 0, D: 0, C: 1, B: 2, A: 3, S: 4 }[ratings.overall] ?? null;
  }
  return recalculateRatings(ratings, {
    weightMode: "individual",
    weightEditorMode: ratings.weightEditorMode || WEIGHT_EDITOR_MODES.preset,
  });
}

export function hasIncompleteExportWeights(ratings) {
  return ratings?.weightEditorMode === WEIGHT_EDITOR_MODES.fine && Number(ratings.unassignedWeightShare || 0) > 0;
}

export async function svgToPngBytes(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("SVG could not be rendered as PNG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function inlineSvgImages(svg) {
  const urls = Array.from(new Set([...svg.matchAll(/href="((?:https:\/\/|\/assets\/)[^"]+)"/g)].map(match => match[1])));
  let inlined = svg;
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to fetch image ${url}: HTTP ${response.status}`);
    const dataUrl = await blobToDataUrl(await response.blob());
    inlined = inlined.split(url).join(dataUrl);
  }
  return inlined;
}

let exportFontCssPromise = null;

export async function loadExportFontCss() {
  if (!exportFontCssPromise) {
    exportFontCssPromise = (async () => {
      try {
        const cssUrl = "/assets/fonts/fonts.css";
        const response = await fetch(cssUrl);
        if (!response.ok) throw new Error(`font css HTTP ${response.status}`);
        let css = await response.text();
        const references = Array.from(new Set([...css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(match => match[1])));
        for (const reference of references) {
          const fontUrl = new URL(reference, new URL(cssUrl, window.location.href)).href;
          const fontResponse = await fetch(fontUrl);
          if (!fontResponse.ok) throw new Error(`font file HTTP ${fontResponse.status}`);
          const dataUrl = await blobToDataUrl(await fontResponse.blob());
          css = css.split(reference).join(dataUrl);
        }
        return css;
      } catch {
        return "";
      }
    })();
  }
  return exportFontCssPromise;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function makeStoredZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ]);
    chunks.push(local, name, data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name);
    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  ]);
  return new Uint8Array([...chunks, ...central, end].flatMap(chunk => Array.from(chunk)));
}
