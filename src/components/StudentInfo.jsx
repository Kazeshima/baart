import { useState } from "react";
import {
  TYPE_COLORS, TYPE_LABELS,
  ADAPT_ICON_URL,
  EQUIP_ICONS,
  COVER_ICON, ATTACK_ICON, DEFENSE_ICON, SEASONS,
} from "../utils/constants.js";
import {
  ROLE_LABELS_BY_LOCALE,
  TYPE_LABELS_BY_LOCALE,
  WEAPON_LABELS_BY_LOCALE,
  localeFor,
  t,
  terrainLabel,
} from "../utils/i18n.js";
import { useRatingStore } from "../store/ratingStore.js";

const EQUIP_LABELS = {
  Hat: "帽", Glove: "手", Shoe: "鞋", Shoes: "鞋",
  Hairpin: "发", Badge: "徽", Bag: "包",
  Watch: "表", Necklace: "链", Talisman: "符", Charm: "符",
};

function TypeBadge({ icon, color, label, title }) {
  return (
    <div
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 20,
        background: `${color}22`, border: `1px solid ${color}`,
        fontSize: 11, fontWeight: 700, color,
      }}
    >
      <img src={icon} alt={label}
        style={{ width: 13, height: 13, filter: "brightness(0) invert(1)" }} />
      {label}
    </div>
  );
}

function TerrainBar({ student, activeSeason, uiLanguage }) {
  const terrainMap = {
    Street:  student.streetAdapt,
    Outdoor: student.outdoorAdapt,
    Indoor:  student.indoorAdapt,
  };
  // UE50 upgraded adaptation if available
  const ueTerrainMap = {
    Street:  student.ueStreetAdapt,
    Outdoor: student.ueOutdoorAdapt,
    Indoor:  student.ueIndoorAdapt,
  };

  return (
    <div className="terrain-row">
      {SEASONS.map(s => {
        const base  = terrainMap[s.key] ?? 0;
        const ue    = ueTerrainMap[s.key];
        const level = base;
        const isActive = s.key === activeSeason;
        return (
          <div key={s.key} className={`terrain-item ${isActive ? "active" : ""}`}>
            <img src={s.icon} alt={terrainLabel(uiLanguage, s.key)} style={{ width: 22, height: 22 }} />
            <div className="terrain-adapt" title={`${t(uiLanguage, "level")} ${level}`}>
              <img src={ADAPT_ICON_URL(level)} alt={`level ${level}`} />
              {ue !== undefined && ue !== base && (
                <span className="terrain-ue">
                  → <img src={ADAPT_ICON_URL(ue)} alt={`UE50 level ${ue}`} /> {t(uiLanguage, "ue50")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

  const attackColor  = TYPE_COLORS[student.bulletType]  || "#888";
  const defenseColor = TYPE_COLORS[student.armorType]   || "#888";
  const typeLabels = TYPE_LABELS_BY_LOCALE[locale] || TYPE_LABELS;
  const weaponLabels = WEAPON_LABELS_BY_LOCALE[locale] || {};
  const roleLabels = ROLE_LABELS_BY_LOCALE[locale] || {};
  const attackLabel  = typeLabels[student.bulletType]  || student.bulletType;
  const defenseLabel = typeLabels[student.armorType]   || student.armorType;
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
          <div className="student-card__name">{student.name}</div>
          <div className="student-card__devname">{student.devName} · #{student.id}</div>
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
          <TypeBadge icon={ATTACK_ICON}  color={attackColor}  label={attackLabel}  title={`攻击属性: ${student.bulletType}`} />
          <TypeBadge icon={DEFENSE_ICON} color={defenseColor} label={defenseLabel} title={`防御类型: ${student.armorType}`} />
        </div>

        {/* Terrain */}
        <div className="info-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="info-label" style={{ marginBottom: 4 }}>{t(uiLanguage, "terrainAdapt")}</span>
          <TerrainBar student={student} activeSeason={season} uiLanguage={uiLanguage} />
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
