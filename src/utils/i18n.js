export const UI_LANGS = {
  zh: "简体中文",
  en: "English",
};

export const UI_TEXT = {
  zh: {
    title: "BAART · 竞技场评级",
    arenaSeason: "竞技场赛季",
    arenaSeasonPlaceholder: "S9",
    terrain: "赛季地形",
    dataLanguage: "学生数据",
    uiLanguage: "界面",
    compactCard: "小卡片",
    fullCard: "大卡片",
    compactPng: "小卡片PNG",
    fullPng: "大卡片PNG",
    batchExport: "批量导出ZIP",
    theme: "主题",
    darkTheme: "夜间",
    lightTheme: "白底",
    saveJson: "保存JSON",
    loadJson: "读取JSON",
    downloadJson: "导入JSON",
    searchPlaceholder: "搜索学生姓名或ID...",
    ratedStudents: "已评级学生",
    emptyTitle: "从左侧搜索并选择学生开始评级",
    autosaveHint: "评级自动保存到本地，同时可写入JSON文件",
    loading: "LOADING STUDENT DATA...",
    loadFailed: "数据加载失败",
    checkNetwork: "请检查网络连接后刷新",
    role: "职责",
    type: "属性",
    terrainAdapt: "地形适应",
    weapon: "武器",
    range: "射程",
    cover: "掩体",
    coverYes: "掩体",
    coverNo: "非掩体",
    position: "站位",
    equipment: "装备",
    dimensions: "各维度评分",
    overall: "综合评级",
    overallScore: "综合分",
    auto: "自动",
    manual: "手动",
    scoreWeight: "造价权重",
    dimensionWeight: "权重",
    weightsUsed: "计分权重",
    costNone: "不计",
    costHalf: "半权重",
    costFull: "全权重",
    notes: "备注 Notes",
    notesPlaceholder: "输入该学生的评级备注、特殊说明等...",
    autoExplain: "根据五维评分和各维度权重自动生成",
    manualExplain: "手动模式会保留你选择的综合评级",
    savedTo: "已保存到",
    loadedFrom: "已读取",
    saveFailed: "保存失败",
    loadFailedShort: "读取失败",
    exportFailed: "导出失败",
    noSavedFile: "还没有保存过评级文件",
    level: "等级",
    ue50: "UE50",
  },
  en: {
    title: "BAART · Arena Rating",
    arenaSeason: "Arena Season",
    arenaSeasonPlaceholder: "S9",
    terrain: "Terrain",
    dataLanguage: "Student Data",
    uiLanguage: "UI",
    compactCard: "Compact Card",
    fullCard: "Full Card",
    compactPng: "Compact PNG",
    fullPng: "Full PNG",
    batchExport: "Batch ZIP",
    theme: "Theme",
    darkTheme: "Night",
    lightTheme: "Day",
    saveJson: "Save JSON",
    loadJson: "Load JSON",
    downloadJson: "Import JSON",
    searchPlaceholder: "Search student name or ID...",
    ratedStudents: "Rated Students",
    emptyTitle: "Search and select a student from the left",
    autosaveHint: "Ratings autosave locally and can be written to JSON",
    loading: "LOADING STUDENT DATA...",
    loadFailed: "Failed to load data",
    checkNetwork: "Check network connection and refresh",
    role: "Role",
    type: "Type",
    terrainAdapt: "Terrain",
    weapon: "Weapon",
    range: "Range",
    cover: "Cover",
    coverYes: "Uses cover",
    coverNo: "No cover",
    position: "Position",
    equipment: "Equipment",
    dimensions: "Dimension Ratings",
    overall: "Overall",
    overallScore: "Score",
    auto: "Auto",
    manual: "Manual",
    scoreWeight: "Cost Weight",
    dimensionWeight: "Weight",
    weightsUsed: "Score Weights",
    costNone: "Exclude",
    costHalf: "Half",
    costFull: "Full",
    notes: "Notes",
    notesPlaceholder: "Add PvP notes, caveats, or usage details...",
    autoExplain: "Generated from dimension scores and their selected weights",
    manualExplain: "Manual mode keeps your selected overall rating",
    savedTo: "Saved to",
    loadedFrom: "Loaded from",
    saveFailed: "Save failed",
    loadFailedShort: "Load failed",
    exportFailed: "Export failed",
    noSavedFile: "No saved ratings file yet",
    level: "Level",
    ue50: "UE50",
  },
};

export const DIMENSION_LABELS = {
  zh: {
    blindshot: ["盲打威力", "Blindshot Power"],
    counter: ["进攻对策性", "Counter Offense"],
    defense: ["通防强度", "General Defense"],
    counterDef: ["特防对策性", "Counter Defense"],
    cost: ["造价", "Build Cost"],
  },
  en: {
    blindshot: ["Blindshot", "Blindshot Power"],
    counter: ["Counter", "Counter Offense"],
    defense: ["Defense", "General Defense"],
    counterDef: ["Anti-counter", "Counter Defense"],
    cost: ["Cost", "Build Cost"],
  },
};

export const TYPE_LABELS_BY_LOCALE = {
  zh: {
    Explosion: "爆发", Pierce: "贯通", Mystic: "神秘", Sonic: "振动", Chemical: "腐蚀",
    LightArmor: "轻装甲", HeavyArmor: "重装甲", Unarmed: "特殊装甲", ElasticArmor: "弹力装甲", Composite: "复合装甲",
  },
  en: {
    Explosion: "Explosive", Pierce: "Piercing", Mystic: "Mystic", Sonic: "Sonic", Chemical: "Chemical",
    LightArmor: "Light", HeavyArmor: "Heavy", Unarmed: "Special", ElasticArmor: "Elastic", Composite: "Composite",
  },
};

export const ROLE_LABELS_BY_LOCALE = {
  zh: {
    DamageDealer: "输出", Tanker: "坦克", Healer: "治疗", Support: "辅助", Supporter: "辅助", Vehicle: "T.S",
    Main: "前排 Striker", SupportSquad: "后排 Special",
  },
  en: {
    DamageDealer: "Dealer", Tanker: "Tank", Healer: "Healer", Support: "Support", Supporter: "Support", Vehicle: "T.S",
    Main: "Striker", SupportSquad: "Special",
  },
};

export const WEAPON_LABELS_BY_LOCALE = {
  zh: {
    SG: "霰弹枪", SMG: "冲锋枪", AR: "突击步枪", SR: "狙击步枪",
    MG: "机枪", RL: "火箭炮", GL: "榴弹炮", HG: "手枪",
    FT: "喷火器", MT: "迫击炮", RG: "铁路炮",
  },
  en: {
    SG: "Shotgun", SMG: "SMG", AR: "Assault Rifle", SR: "Sniper Rifle",
    MG: "Machine Gun", RL: "Rocket Launcher", GL: "Grenade Launcher", HG: "Handgun",
    FT: "Flamethrower", MT: "Mortar", RG: "Railgun",
  },
};

export const TERRAIN_LABELS_BY_LOCALE = {
  zh: {
    Street: "市区",
    Outdoor: "野外",
    Indoor: "室内",
  },
  en: {
    Street: "Street",
    Outdoor: "Outdoor",
    Indoor: "Indoor",
  },
};

export const OVERALL_LABELS = {
  zh: ["拉完了", "NPC", "人上人", "顶级", "夯"],
  en: ["Loser", "NPC", "Normie+", "Alpha", "Gigachad"],
};

export function localeFor(language) {
  return language === "en" ? "en" : "zh";
}

export function t(language, key) {
  const locale = localeFor(language);
  return UI_TEXT[locale][key] || UI_TEXT.zh[key] || key;
}

export function terrainLabel(language, terrainKey) {
  const locale = localeFor(language);
  return TERRAIN_LABELS_BY_LOCALE[locale]?.[terrainKey] || TERRAIN_LABELS_BY_LOCALE.zh[terrainKey] || terrainKey;
}
