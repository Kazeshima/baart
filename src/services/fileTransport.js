import { invoke, isTauri } from "@tauri-apps/api/core";

export function isDesktopRuntime() {
  return isTauri();
}

export function downloadBrowserBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadBrowserText(filename, contents, type = "application/json;charset=utf-8") {
  downloadBrowserBlob(filename, new Blob([contents], { type }));
}

export async function saveTextAs({ filename, contents, filters, type = "application/json;charset=utf-8" }) {
  if (isDesktopRuntime()) {
    return invoke("save_text_as", { defaultName: filename, contents, filters });
  }
  downloadBrowserText(filename, contents, type);
  return filename;
}

export async function saveBytesAs({ filename, bytes, filters, type = "application/octet-stream" }) {
  if (isDesktopRuntime()) {
    return invoke("save_bytes_as", { defaultName: filename, bytes: Array.from(bytes), filters });
  }
  downloadBrowserBlob(filename, new Blob([bytes], { type }));
  return filename;
}

export async function saveDownload({ filename, contents, type }) {
  const extension = filename.split(".").pop()?.toLowerCase() || "txt";
  const filters = [{ name: extension.toUpperCase(), extensions: [extension] }];
  return contents instanceof Uint8Array
    ? saveBytesAs({ filename, bytes: contents, filters, type })
    : saveTextAs({ filename, contents, filters, type });
}

export async function openTextFile(filters) {
  if (!isDesktopRuntime()) return null;
  return invoke("open_text_file", { filters });
}
