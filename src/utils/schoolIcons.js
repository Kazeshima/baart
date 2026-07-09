import { SCHOOL_LABELS_BY_LOCALE } from "./i18n.js";

export const SCHOOL_ICON_BASE_PATH = "/assets/schoolicon";
export const SCHOOL_ICON_REMOTE_BASE = "https://schaledb.com/images/schoolicon";

export const SCHOOL_KEYS = Object.freeze(
  Object.keys(SCHOOL_LABELS_BY_LOCALE.zh).sort((a, b) => a.localeCompare(b)),
);

export const FALLBACK_SCHOOL_ICON_KEY = "ETC";
export const FALLBACK_SCHOOL_ICON_PATH = `${SCHOOL_ICON_BASE_PATH}/${FALLBACK_SCHOOL_ICON_KEY}.png`;

export const SCHOOL_ICON_KEYS = Object.freeze(SCHOOL_KEYS.filter(key => key !== "Sakugawa"));

export function hasSchoolIcon(schoolKey) {
  return SCHOOL_ICON_KEYS.includes(String(schoolKey || ""));
}

export function schoolIconPath(schoolKey) {
  const key = String(schoolKey || "");
  return hasSchoolIcon(key) ? `${SCHOOL_ICON_BASE_PATH}/${key}.png` : FALLBACK_SCHOOL_ICON_PATH;
}

export function schoolIconRemoteUrl(schoolKey) {
  const key = String(schoolKey || "");
  return hasSchoolIcon(key) ? `${SCHOOL_ICON_REMOTE_BASE}/${key}.png` : `${SCHOOL_ICON_REMOTE_BASE}/${FALLBACK_SCHOOL_ICON_KEY}.png`;
}
