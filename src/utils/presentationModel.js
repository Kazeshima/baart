import {
  ADAPT_ICON_URL,
  ATTACK_ICON,
  COVER_ICON,
  DEFENSE_ICON,
  DIMENSIONS,
  OVERALL_COLORS,
  SEASONS,
  TIER_COLORS,
  TIER_SCORES,
  TYPE_COLORS,
} from "./constants.js";
import {
  DIMENSION_LABELS,
  OVERALL_LABELS,
  ROLE_LABELS_BY_LOCALE,
  TYPE_LABELS_BY_LOCALE,
  WEAPON_LABELS_BY_LOCALE,
  localeFor,
  schoolLabel,
  t,
  terrainLabel,
} from "./i18n.js";
import { formatWeightShare } from "./scoring.js";
import { schoolIconPath } from "./schoolIcons.js";
import { studentDisplayName } from "./studentDisplay.js";

export function createStudentRatingPresentation({ student, ratings = {}, language = "zh", activeSeason = "Street" }) {
  const locale = localeFor(language);
  const types = TYPE_LABELS_BY_LOCALE[locale] || TYPE_LABELS_BY_LOCALE.zh;
  const roles = ROLE_LABELS_BY_LOCALE[locale] || ROLE_LABELS_BY_LOCALE.zh;
  const weapons = WEAPON_LABELS_BY_LOCALE[locale] || WEAPON_LABELS_BY_LOCALE.zh;
  const dimensionLabels = DIMENSION_LABELS[locale] || DIMENSION_LABELS.zh;
  const school = schoolLabel(language, student.school);
  const overall = ratings.overall;
  const squadLabel = student.squadType === "Support" ? roles.SupportSquad : roles.Main;
  const tacticLabel = roles[student.tacticRole] || student.tacticRole;
  const weaponLabel = weapons[student.weaponType] || "";

  const terrainLevels = {
    Street: [student.streetAdapt, student.ueStreetAdapt],
    Outdoor: [student.outdoorAdapt, student.ueOutdoorAdapt],
    Indoor: [student.indoorAdapt, student.ueIndoorAdapt],
  };

  const terrains = SEASONS.map(terrain => {
    const [rawLevel, rawUpgrade] = terrainLevels[terrain.key];
    const level = Number(rawLevel ?? 0);
    const upgradedLevel = rawUpgrade === undefined || rawUpgrade === null ? level : Number(rawUpgrade);
    return {
      key: terrain.key,
      label: terrainLabel(language, terrain.key),
      icon: terrain.icon,
      level,
      rankIcon: ADAPT_ICON_URL(level),
      upgradedLevel,
      upgradedRankIcon: ADAPT_ICON_URL(upgradedLevel),
      hasUpgrade: upgradedLevel !== level,
      active: activeSeason === terrain.key,
    };
  });
  const dimensions = DIMENSIONS.map(({ key }) => {
    const tier = ratings[key] ?? null;
    return {
      key,
      label: dimensionLabels[key][0],
      description: dimensionLabels[key][1],
      tier,
      score: tier === null ? 0 : TIER_SCORES[tier] ?? 0,
      tierColor: TIER_COLORS[tier] || "#4a6080",
      weightShare: Number(ratings.dimensionWeightShares?.[key] ?? 0),
      weightLabel: formatWeightShare(ratings.dimensionWeightShares?.[key]),
    };
  });
  const overallColor = overall === null || overall === undefined ? "#4a6080" : OVERALL_COLORS[overall];

  return {
    locale,
    labels: {
      level: t(language, "level"),
      ue50: t(language, "ue50"),
      comments: t(language, "comments"),
      weightsUsed: t(language, "weightsUsed"),
      overall: t(language, "overall"),
      range: t(language, "range"),
    },
    identity: {
      id: Number(student.id),
      displayName: studentDisplayName(student, language),
      developerName: student.devName || "",
      schoolKey: student.school || "ETC",
      schoolLabel: school,
      schoolIcon: schoolIconPath(student.school),
      portraitUrl: `https://schaledb.com/images/student/portrait/${student.id}.webp`,
      avatarUrl: `https://schaledb.com/images/student/icon/${student.id}.webp`,
    },
    role: {
      squadLabel,
      tacticLabel,
      summary: `${squadLabel || student.squadType} / ${tacticLabel}`,
    },
    facts: {
      attack: {
        key: student.bulletType,
        label: types[student.bulletType] || student.bulletType,
        icon: ATTACK_ICON,
        color: TYPE_COLORS[student.bulletType] || "#4a6080",
      },
      defense: {
        key: student.armorType,
        label: types[student.armorType] || student.armorType,
        icon: DEFENSE_ICON,
        color: TYPE_COLORS[student.armorType] || "#4a6080",
      },
      cover: {
        active: Boolean(student.cover),
        label: student.cover ? t(language, "coverYes") : t(language, "coverNo"),
        icon: COVER_ICON,
      },
    },
    weapon: {
      key: student.weaponType || "",
      label: weaponLabel,
      range: student.range,
      summary: `${student.weaponType || ""}${weaponLabel ? ` ${weaponLabel}` : ""} / ${t(language, "range")} ${student.range}`,
    },
    terrains,
    dimensions,
    radar: {
      dimensions,
      fillColor: overallColor,
    },
    weights: {
      label: t(language, "weightsUsed"),
      dimensions: dimensions.map(({ key, label, weightShare, weightLabel }) => ({ key, label, weightShare, weightLabel })),
    },
    overall: {
      level: overall ?? null,
      label: overall === null || overall === undefined ? "?" : OVERALL_LABELS[locale][overall],
      score: ratings.overallScore ?? null,
      color: overallColor,
    },
    notes: ratings.notes || "",
  };
}
