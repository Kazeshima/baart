import { useState } from "react";
import {
  EQUIP_ICONS,
  COVER_ICON,
} from "../utils/constants.js";
import {
  ROLE_LABELS_BY_LOCALE,
  WEAPON_LABELS_BY_LOCALE,
  localeFor,
  t,
} from "../utils/i18n.js";
import { useRatingStore } from "../store/ratingStore.js";
import {
  StudentIdentity,
  StudentTerrainIndicators,
  StudentTypeIndicators,
} from "./presentation/StudentPresentation.jsx";

const EQUIP_LABELS = {
  Hat: "帽", Glove: "手", Shoe: "鞋", Shoes: "鞋",
  Hairpin: "发", Badge: "徽", Bag: "包",
  Watch: "表", Necklace: "链", Talisman: "符", Charm: "符",
};

function EquipBadge({ type, isUnique }) {
  const icon = EQUIP_ICONS[type];
  const label = EQUIP_LABELS[type] || type;
  return (
    <div className={`equip-badge ${isUnique ? "unique" : ""}`} title={type}>
      {icon
        ? <img src={icon} alt={type} />
        : <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
      }
      {isUnique && (
        <span className="equip-badge__label" style={{ color: "#f0b429" }}>UE</span>
      )}
    </div>
  );
}

export default function StudentInfo({ student }) {
  const { season, uiLanguage } = useRatingStore();
  const [imgError, setImgError] = useState(false);
  const locale = localeFor(uiLanguage);

  const portraitUrl = `https://schaledb.com/images/student/portrait/${student.id}.webp`;
  const collectionUrl = `https://schaledb.com/images/student/collection/${student.id}.webp`;

  const weaponLabels = WEAPON_LABELS_BY_LOCALE[locale] || {};
  const roleLabels = ROLE_LABELS_BY_LOCALE[locale] || {};
  const squadLabel = student.squadType === "Support"
    ? roleLabels.SupportSquad
    : roleLabels.Main;

  return (
    <div className="student-card">
      {/* Portrait */}
      <div className="student-card__portrait">
        {!imgError ? (
          <img
            src={portraitUrl}
            alt={student.name}
            onError={() => setImgError(true)}
          />
        ) : (
          <img src={collectionUrl} alt={student.name} />
        )}
        <div className="student-card__portrait-overlay">
          <StudentIdentity student={{ ...student, school: "" }} language={uiLanguage} nameClassName="student-card__name" metaClassName="student-card__devname" />
        </div>
      </div>

      {/* Info */}
      <div className="student-card__info">
        {/* Role & squad */}
        <div className="info-row">
          <span className="info-label">{t(uiLanguage, "role")}</span>
          <span style={{ fontSize: 12, color: student.squadType === "Main" ? "var(--accent-blue)" : "var(--accent-purple)", fontWeight: 700 }}>
            {squadLabel || student.squadType}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
            {roleLabels[student.tacticRole] || student.tacticRole}
          </span>
        </div>

        {/* Attack & armor type */}
        <div className="info-row">
          <span className="info-label">{t(uiLanguage, "type")}</span>
          <StudentTypeIndicators student={student} language={uiLanguage} />
        </div>

        {/* Terrain */}
        <div className="info-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="info-label" style={{ marginBottom: 4 }}>{t(uiLanguage, "terrainAdapt")}</span>
          <StudentTerrainIndicators student={student} activeSeason={season} language={uiLanguage} />
        </div>

        {/* Weapon & range */}
        <div className="info-row">
          <span className="info-label">{t(uiLanguage, "weapon")}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
            {student.weaponType}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {weaponLabels[student.weaponType] || ""}
          </span>
          <span style={{ fontSize: 11, color: "var(--accent-blue)", marginLeft: 8, fontFamily: "var(--font-mono)" }}>
            {t(uiLanguage, "range")} {student.range}
          </span>
        </div>

        {/* Cover */}
        <div className="info-row">
          <span className="info-label">{t(uiLanguage, "cover")}</span>
          <div className={`cover-icon ${student.cover ? "" : "inactive"}`} title={student.cover ? t(uiLanguage, "coverYes") : t(uiLanguage, "coverNo")}>
            <img src={COVER_ICON} alt="cover" />
            <span>{student.cover ? t(uiLanguage, "coverYes") : t(uiLanguage, "coverNo")}</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
            {t(uiLanguage, "position")}: {student.position}
          </span>
        </div>

        {/* Equipment */}
        <div className="info-row">
          <span className="info-label">{t(uiLanguage, "equipment")}</span>
          <div className="equip-row">
            {student.equipment.map((eq, i) => (
              <EquipBadge key={i} type={eq} isUnique={i === 3} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
