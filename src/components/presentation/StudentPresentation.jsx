import React from "react";
import {
  ADAPT_ICON_URL,
  ATTACK_ICON,
  COVER_ICON,
  DEFENSE_ICON,
  SEASONS,
  TYPE_COLORS,
} from "../../utils/constants.js";
import {
  ROLE_LABELS_BY_LOCALE,
  TYPE_LABELS_BY_LOCALE,
  WEAPON_LABELS_BY_LOCALE,
  localeFor,
  schoolLabel,
  t,
  terrainLabel,
} from "../../utils/i18n.js";
import { studentDisplayName } from "../../utils/studentDisplay.js";

export function studentPresentation(student, language) {
  const locale = localeFor(language);
  const types = TYPE_LABELS_BY_LOCALE[locale] || TYPE_LABELS_BY_LOCALE.zh;
  const roles = ROLE_LABELS_BY_LOCALE[locale] || ROLE_LABELS_BY_LOCALE.zh;
  const weapons = WEAPON_LABELS_BY_LOCALE[locale] || WEAPON_LABELS_BY_LOCALE.zh;
  return {
    attackLabel: types[student.bulletType] || student.bulletType,
    defenseLabel: types[student.armorType] || student.armorType,
    roleLabel: roles[student.tacticRole] || student.tacticRole,
    squadLabel: student.squadType === "Support" ? roles.SupportSquad : roles.Main,
    weaponLabel: weapons[student.weaponType] || "",
  };
}

export function StudentIdentity({ student, language = "zh", nameClassName, metaClassName, children }) {
  return <>
    <div className={nameClassName} style={{ whiteSpace: "pre-wrap" }}>{studentDisplayName(student, language)}</div>
    <div className={metaClassName}>{student.devName} · #{student.id}{student.school ? ` · ${schoolLabel(language, student.school)}` : ""}</div>
    {children}
  </>;
}

export function StudentFactIndicator({ ImageComponent = "img", icon, label, color, className = "type-badge", title }) {
  const Image = ImageComponent;
  return <div className={className} title={title} style={{ border: `1px solid ${color}`, borderColor: color, color, background: `${color}22` }}>
    <Image src={icon} alt={label} />
    <span>{label}</span>
  </div>;
}

export function StudentTypeIndicators({ student, language, ImageComponent = "img", variant = "editor", mutedColor = "#4a6080" }) {
  const presentation = studentPresentation(student, language);
  const className = variant === "video" ? "video-fact-chip" : "type-badge";
  return <>
    <StudentFactIndicator ImageComponent={ImageComponent} className={className} icon={ATTACK_ICON} label={presentation.attackLabel} color={TYPE_COLORS[student.bulletType] || mutedColor} />
    <StudentFactIndicator ImageComponent={ImageComponent} className={className} icon={DEFENSE_ICON} label={presentation.defenseLabel} color={TYPE_COLORS[student.armorType] || mutedColor} />
    {variant === "video" ? <StudentFactIndicator ImageComponent={ImageComponent} className={className} icon={COVER_ICON} label={student.cover ? t(language, "coverYes") : t(language, "coverNo")} color={student.cover ? "#38bdf8" : mutedColor} /> : null}
  </>;
}

export function StudentTerrainIndicators({ student, activeSeason, language, ImageComponent = "img", variant = "editor" }) {
  const Image = ImageComponent;
  const base = { Street: student.streetAdapt, Outdoor: student.outdoorAdapt, Indoor: student.indoorAdapt };
  const upgraded = { Street: student.ueStreetAdapt, Outdoor: student.ueOutdoorAdapt, Indoor: student.ueIndoorAdapt };
  const rowClass = variant === "video" ? "video-terrain-strip" : "terrain-row";
  const itemClass = variant === "video" ? "video-terrain" : "terrain-item";

  return <div className={rowClass}>{SEASONS.map(terrain => {
    const level = base[terrain.key] ?? 0;
    const ue = upgraded[terrain.key];
    const hasUpgrade = ue !== undefined && ue !== level;
    return <div key={terrain.key} className={`${itemClass} ${activeSeason === terrain.key ? (variant === "video" ? "is-active" : "active") : ""}`} title={terrainLabel(language, terrain.key)}>
      <Image src={terrain.icon} alt={terrainLabel(language, terrain.key)} />
      {variant === "video" ? <>
        <Image className="video-terrain__rank" src={ADAPT_ICON_URL(level)} alt={`${level}`} />
        {hasUpgrade ? <><span>→</span><Image className="video-terrain__rank" src={ADAPT_ICON_URL(ue)} alt={`${ue}`} /></> : null}
      </> : <div className="terrain-adapt" title={`${t(language, "level")} ${level}`}>
        <Image src={ADAPT_ICON_URL(level)} alt={`${t(language, "level")} ${level}`} />
        {hasUpgrade ? <span className="terrain-ue">→ <Image src={ADAPT_ICON_URL(ue)} alt={`UE50 ${ue}`} /> {t(language, "ue50")}</span> : null}
      </div>}
    </div>;
  })}</div>;
}
