export const LANGS = {
  zh: "简中（民译）", cn: "简中（国服）", tw: "繁中", jp: "日本語", en: "English",
};

export const LANG_URLS = {
  zh: "https://schaledb.com/data/zh/students.json",
  cn: "https://schaledb.com/data/cn/students.json",
  tw: "https://schaledb.com/data/tw/students.json",
  jp: "https://schaledb.com/data/jp/students.json",
  en: "https://schaledb.com/data/en/students.json",
};

// Rating tiers
export const TIERS = ["S", "A", "B", "C", "D", "E"];
export const TIER_SCORES = { S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 };
export const SCORE_TIERS = { 5: "S", 4: "A", 3: "B", 2: "C", 1: "D", 0: "E" };

export const TIER_COLORS = {
  S: "#f0b429",
  A: "#ef4444",
  B: "#a855f7",
  C: "#38bdf8",
  D: "#22c55e",
  E: "#64748b",
};

export const DIMENSION_COLORS = {
  blindshot: "#ef4444",
  counter: "#ef4444",
  defense: "#38bdf8",
  counterDef: "#38bdf8",
  cost: "#f0b429",
};

export const OVERALL_LEVELS = [0, 1, 2, 3, 4];
export const OVERALL_COLORS = {
  0: "#64748b",
  1: "#38bdf8",
  2: "#a855f7",
  3: "#ef4444",
  4: "#f0b429",
};

// 5 rating dimensions
export const DIMENSIONS = [
  { key: "blindshot",   labelZh: "盲打威力",    labelEn: "Blindshot Power" },
  { key: "counter",     labelZh: "进攻对策性",   labelEn: "Counter Offense" },
  { key: "defense",     labelZh: "通防强度",     labelEn: "General Defense" },
  { key: "counterDef",  labelZh: "特防对策性",   labelEn: "Counter Defense" },
  { key: "cost",        labelZh: "造价",         labelEn: "Build Cost" },
];

// Bullet / Armor type colors
export const TYPE_COLORS = {
  Explosion:    "#ef4444",
  Pierce:       "#f0b429",
  Mystic:       "#38bdf8",
  Sonic:        "#a855f7",
  Chemical:     "#22c55e",
  LightArmor:   "#ef4444",
  HeavyArmor:   "#f0b429",
  Unarmed:      "#38bdf8",
  ElasticArmor: "#a855f7",
  Composite:    "#22c55e",
};

export const TYPE_LABELS = {
  Explosion:    "爆发",
  Pierce:       "贯通",
  Mystic:       "神秘",
  Sonic:        "振动",
  Chemical:     "腐蚀",
  LightArmor:   "轻装甲",
  HeavyArmor:   "重装甲",
  Unarmed:      "特殊装甲",
  ElasticArmor: "弹力装甲",
  Composite:    "复合装甲",
};

// Terrain adaptations 0-5 map to image index
export const TERRAIN_ICONS = {
  Street:  "https://schaledb.com/images/ui/Terrain_Street.png",
  Outdoor: "https://schaledb.com/images/ui/Terrain_Outdoor.png",
  Indoor:  "https://schaledb.com/images/ui/Terrain_Indoor.png",
};

export const ADAPT_ICON_URL = (level) =>
  `https://schaledb.com/images/ui/Adaptresult${level}.png`;

// Equipment icon map
export const EQUIP_ICONS = {
  Hat:         "https://schaledb.com/images/equipment/Icon_Equip_Hat_.webp",
  Glove:       "https://schaledb.com/images/equipment/Icon_Equip_Glove_.webp",
  Shoe:        "https://schaledb.com/images/equipment/Icon_Equip_Shoe_.webp",
  Shoes:       "https://schaledb.com/images/equipment/Icon_Equip_Shoe_.webp",
  Hairpin:     "https://schaledb.com/images/equipment/Icon_Equip_Hairpin_.webp",
  Badge:       "https://schaledb.com/images/equipment/Icon_Equip_Badge_.webp",
  Bag:         "https://schaledb.com/images/equipment/Icon_Equip_Bag_.webp",
  Watch:       "https://schaledb.com/images/equipment/Icon_Equip_Watch_.webp",
  Necklace:    "https://schaledb.com/images/equipment/Icon_Equip_Necklace_.webp",
  Talisman:    "https://schaledb.com/images/equipment/Icon_Equip_Talisman_.webp",
  Charm:       "https://schaledb.com/images/equipment/Icon_Equip_Talisman_.webp",
};

export const WEAPON_LABELS = {
  SG: "霰弹枪", SMG: "冲锋枪", AR: "突击步枪", SR: "狙击步枪",
  MG: "机枪", RL: "火箭炮", GL: "榴弹炮", HG: "手枪",
  FT: "喷火器", MT: "迫击炮", RG: "铁路炮",
};

export const ROLE_LABELS = {
  DamageDealer: "输出", Tanker: "坦克", Healer: "治愈",
  Support: "辅助", Supporter: "辅助", Vehicle: "T.S",
};

export const SQUAD_LABELS = { Main: "前排 Striker", Support: "后排 Special" };

export const COVER_ICON = "https://schaledb.com/images/ui/Combat_Icon_Cover_Ally.png";
export const ATTACK_ICON  = "https://schaledb.com/images/ui/Type_Attack_s.png";
export const DEFENSE_ICON = "https://schaledb.com/images/ui/Type_Defense_s.png";

export const SEASONS = [
  { key: "Street",  label: "市区", icon: TERRAIN_ICONS.Street  },
  { key: "Outdoor", label: "野外", icon: TERRAIN_ICONS.Outdoor },
  { key: "Indoor",  label: "室内", icon: TERRAIN_ICONS.Indoor  },
];

// Default empty ratings
export const DEFAULT_RATINGS = () => ({
  blindshot:  null,
  counter:    null,
  defense:    null,
  counterDef: null,
  cost:       null,
  overall:    null,
  overallScore: null,
  overallAuto: true,   // if true, overall is computed from dimensions
  dimensionWeights: {
    blindshot: "full",
    counter: "full",
    defense: "full",
    counterDef: "full",
    cost: "half",
  },
  costWeight: "half",
  notes: "",
});
