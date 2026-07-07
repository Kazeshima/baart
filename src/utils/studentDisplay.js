import { localeFor } from "./i18n.js";

export function studentDisplayName(student, language = "zh") {
  const name = String(student?.name || student?.devName || "").trim();
  const familyName = String(student?.familyName || "").trim();
  const personalName = String(student?.personalName || "").trim();
  if (!familyName) return name;

  const separator = localeFor(language) === "en" ? " " : "  ";
  if (name.startsWith(familyName)) return name;
  return `${familyName}${separator}${name || personalName}`;
}
