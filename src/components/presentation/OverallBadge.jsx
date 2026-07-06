import { OVERALL_COLORS } from "../../utils/constants.js";
import { OVERALL_LABELS, localeFor, t } from "../../utils/i18n.js";

export default function OverallBadge({ overall, overallScore, language = "zh", className = "", style }) {
  const locale = localeFor(language);
  const color = overall !== null && overall !== undefined ? OVERALL_COLORS[overall] : "var(--text-muted)";
  const label = overall !== null && overall !== undefined ? OVERALL_LABELS[locale][overall] : "?";

  return (
    <div
      className={`overall-badge ${locale === "en" ? "overall-badge--latin" : ""} ${className}`.trim()}
      style={{ color, ...style }}
      title={`${t(language, "overall")}: ${label}`}
    >
      {label}
      <span className="overall-score">{overallScore !== null && overallScore !== undefined ? overallScore.toFixed(1) : "--"}</span>
    </div>
  );
}
