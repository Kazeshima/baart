import { t } from "../utils/i18n.js";
import { useRatingStore } from "../store/ratingStore.js";
import { buildExportSVG } from "../export/cardSvg.js";
import { useCardExport } from "../export/useCardExport.js";

export { buildExportSVG };

export function useExport() {
  return useCardExport(buildExportSVG);
}

export function ExportPreviewModal({ preview, onSave, onClose }) {
  const { uiLanguage } = useRatingStore();
  if (!preview) return null;
  const saveLabel = preview.format === "png" ? t(uiLanguage, "savePng") : t(uiLanguage, "saveSvg");
  return (
    <div className="export-preview-overlay" role="dialog" aria-modal="true" aria-label={t(uiLanguage, "exportPreview")}>
      <div className="export-preview-panel">
        <div className="export-preview-header">
          <div>
            <h2>{t(uiLanguage, "exportPreview")}</h2>
            <p>{preview.filename}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t(uiLanguage, "close")}</button>
        </div>
        <div className="export-preview-canvas" style={{ aspectRatio: `${preview.width} / ${preview.height}` }} dangerouslySetInnerHTML={{ __html: preview.svg }} />
        <div className="export-preview-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t(uiLanguage, "cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
