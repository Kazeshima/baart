import { useMemo, useState } from "react";
import { DIMENSIONS } from "../utils/constants.js";
import { DIMENSION_LABELS, localeFor, t } from "../utils/i18n.js";
import { buildDimensionReportSvg, dimensionReportRows } from "../utils/dimensionReport.js";
import { useRatingStore } from "../store/ratingStore.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function inlineSvgImages(svg) {
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

async function svgToPngBytes(svg) {
  const width = Number(svg.match(/width="(\d+)"/)?.[1] || 960);
  const height = Number(svg.match(/height="(\d+)"/)?.[1] || 720);
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

export default function DimensionReport({ open, onClose }) {
  const {
    students, allRatings, getEffectiveAllRatings, uiLanguage, arenaSeason, theme, downloadFile,
  } = useRatingStore();
  const [dimension, setDimension] = useState(DIMENSIONS[0].key);
  const [direction, setDirection] = useState("desc");
  const [status, setStatus] = useState("");
  const locale = localeFor(uiLanguage);
  const dimensionLabels = DIMENSION_LABELS[locale] || DIMENSION_LABELS.zh;
  const effectiveAllRatings = getEffectiveAllRatings();
  const ratedStudents = useMemo(() => students.filter(student => Object.hasOwn(allRatings, student.id)), [allRatings, students]);
  const rows = useMemo(() => dimensionReportRows({
    students: ratedStudents,
    ratingsById: effectiveAllRatings,
    dimension,
    direction,
    language: uiLanguage,
  }), [dimension, direction, effectiveAllRatings, ratedStudents, uiLanguage]);

  if (!open) return null;

  const exportPng = async () => {
    try {
      setStatus("");
      const svg = await inlineSvgImages(buildDimensionReportSvg({ rows, dimension, direction, language: uiLanguage, arenaSeason, theme }));
      const bytes = await svgToPngBytes(svg);
      const path = await downloadFile(`baart_${dimension}_${direction}_rank_report.png`, bytes, "image/png");
      if (path) setStatus(`${t(uiLanguage, "savedTo")}: ${path}`);
    } catch (error) {
      setStatus(`${t(uiLanguage, "exportFailed")}: ${error?.message || error}`);
    }
  };

  return (
    <div className="report-overlay">
      <section className="report-panel">
        <header className="report-header">
          <div>
            <h2>{t(uiLanguage, "dimensionRankReport")}</h2>
            <p>{t(uiLanguage, "dimensionRankHint")}</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose}>{t(uiLanguage, "close")}</button>
        </header>
        <div className="report-controls">
          <label>
            <span>{t(uiLanguage, "dimensions")}</span>
            <select value={dimension} onChange={event => setDimension(event.target.value)}>
              {DIMENSIONS.map(({ key }) => <option key={key} value={key}>{dimensionLabels[key][0]}</option>)}
            </select>
          </label>
          <label>
            <span>{t(uiLanguage, "direction")}</span>
            <select value={direction} onChange={event => setDirection(event.target.value)}>
              <option value="desc">{t(uiLanguage, "topToBottom")}</option>
              <option value="asc">{t(uiLanguage, "bottomToTop")}</option>
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={!rows.length} onClick={exportPng}>{t(uiLanguage, "exportPng")}</button>
        </div>
        {status ? <div className="report-status">{status}</div> : null}
        <div className="report-list">
          {rows.length === 0 ? <div className="report-empty">{t(uiLanguage, "rankReportEmpty")}</div> : rows.map(row => {
            const { identity, overall } = row.presentation;
            const rankedDimension = row.presentation.dimensions.find(item => item.key === dimension);
            return (
              <div className="report-row" key={row.student.id}>
                <span className="report-rank">#{row.rank}</span>
                <img src={identity.avatarUrl} alt={identity.displayName} />
                <div className="report-student">
                  <strong>{identity.displayName}</strong>
                  <small>#{identity.id} · {identity.schoolIcon ? <img className="report-school-icon" src={identity.schoolIcon} alt="" /> : null}{identity.schoolLabel}</small>
                </div>
                <span className="report-tier" style={{ color: rankedDimension.tierColor, borderColor: rankedDimension.tierColor, background: `${rankedDimension.tierColor}22` }}>{row.tier}</span>
                <span className="report-overall" style={{ color: overall.color }}>{overall.level !== null ? `${overall.label} ${Number(overall.score ?? 0).toFixed(1)}` : "--"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
