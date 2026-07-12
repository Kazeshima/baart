import { useState } from "react";
import { t } from "../utils/i18n.js";
import { useRatingStore } from "../store/ratingStore.js";
import {
  CARD_DIMENSIONS,
  exportFilenamePart,
  hasIncompleteExportWeights,
  inlineSvgImages,
  loadExportFontCss,
  makeStoredZip,
  normalizeExportRatings,
  svgToPngBytes,
} from "./exportPipeline.js";

export function useCardExport(buildExportSvg) {
  const [exportPreview, setExportPreview] = useState(null);
  const {
    selectedStudent,
    students,
    allRatings,
    getEffectiveAllRatings,
    getCurrentRatings,
    season,
    arenaSeason,
    uiLanguage,
    theme,
    downloadFile,
  } = useRatingStore();

  const closeExportPreview = () => setExportPreview(null);

  const saveExportPreview = async () => {
    if (!exportPreview) return;
    try {
      if (exportPreview.format === "png") {
        const bytes = await svgToPngBytes(exportPreview.svg, exportPreview.width, exportPreview.height);
        const path = await downloadFile(exportPreview.filename, bytes, "image/png");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      } else {
        const path = await downloadFile(exportPreview.filename, exportPreview.svg, "image/svg+xml;charset=utf-8");
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      }
      setExportPreview(null);
    } catch (error) {
      alert(`${t(uiLanguage, "exportFailed")}: ${error?.message || error}`);
    }
  };

  const exportCard = async (mode = "compact", format = "svg") => {
    const effectiveAllRatings = getEffectiveAllRatings();
    if (mode === "batch") {
      try {
        const rated = students.filter(student => allRatings[student.id]);
        const incomplete = rated.find(student => hasIncompleteExportWeights(effectiveAllRatings[student.id]));
        if (incomplete) {
          alert(t(uiLanguage, "incompleteWeights"));
          return;
        }
        const files = [];
        const encoder = new TextEncoder();
        const pngFailures = [];
        const fontCss = await loadExportFontCss();
        for (const student of rated) {
          const ratings = normalizeExportRatings(effectiveAllRatings[student.id]);
          const compactSvg = await inlineSvgImages(buildExportSvg(student, ratings, { season, arenaSeason, uiLanguage, theme, mode: "compact", fontCss }));
          const fullSvg = await inlineSvgImages(buildExportSvg(student, ratings, { season, arenaSeason, uiLanguage, theme, mode: "full", fontCss }));
          const base = `${exportFilenamePart(student.id)}_${exportFilenamePart(student.devName || student.name)}`;
          files.push({ name: `compact_card_svg/${base}_compact.svg`, data: encoder.encode(compactSvg) });
          files.push({ name: `full_card_svg/${base}_full.svg`, data: encoder.encode(fullSvg) });
          try {
            files.push({ name: `compact_png/${base}_compact.png`, data: await svgToPngBytes(compactSvg, CARD_DIMENSIONS.compact.width, CARD_DIMENSIONS.compact.height) });
          } catch (error) {
            pngFailures.push(`${base}_compact: ${error?.message || error}`);
          }
          try {
            files.push({ name: `full_png/${base}_full.png`, data: await svgToPngBytes(fullSvg, CARD_DIMENSIONS.full.width, CARD_DIMENSIONS.full.height) });
          } catch (error) {
            pngFailures.push(`${base}_full: ${error?.message || error}`);
          }
        }
        if (pngFailures.length) {
          throw new Error(`PNG export failed for ${pngFailures.length} card(s): ${pngFailures.slice(0, 3).join("; ")}`);
        }
        const path = await downloadFile(
          `ba_pvp_cards_${exportFilenamePart(arenaSeason)}.zip`,
          makeStoredZip(files),
          "application/zip",
        );
        if (path) alert(`${t(uiLanguage, "savedTo")}: ${path}`);
      } catch (error) {
        alert(`${t(uiLanguage, "exportFailed")}: ${error?.message || error}`);
      }
      return;
    }

    if (!selectedStudent) return;
    const ratings = getCurrentRatings();
    if (hasIncompleteExportWeights(ratings)) {
      alert(t(uiLanguage, "incompleteWeights"));
      return;
    }
    try {
      const fontCss = await loadExportFontCss();
      const rawSvg = buildExportSvg(selectedStudent, ratings, { season, arenaSeason, uiLanguage, theme, mode, fontCss });
      const suffix = mode === "full" ? "full" : "compact";
      const baseName = `${exportFilenamePart(selectedStudent.id)}_${exportFilenamePart(selectedStudent.devName || selectedStudent.name)}_${suffix}`;
      const { width, height } = CARD_DIMENSIONS[mode];
      const svg = await inlineSvgImages(rawSvg);
      setExportPreview({ svg, width, height, mode, format, filename: `${baseName}.${format}` });
    } catch (error) {
      alert(`${t(uiLanguage, "exportFailed")}: ${error?.message || error}`);
    }
  };

  return { exportCard, exportPreview, saveExportPreview, closeExportPreview };
}
