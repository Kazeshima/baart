const OUTPUT_THEMES = Object.freeze({
  dark: Object.freeze({
    bg: "#07101d",
    panel: "#0d1727",
    card: "#122033",
    stroke: "#29425f",
    text: "#edf7ff",
    sub: "#9bb2c9",
    muted: "#607b98",
    radarBg: "#0b1625",
    shadow: "#000000",
    portraitShade: "#07101d",
    cyan: "#39c5f3",
    pink: "#ff6b9f",
    gold: "#ffb51f",
    grid: "#25415e",
    panelOpacity: "0.82",
    cardOpacity: "0.78",
    iconChipOpacity: "0.96",
    iconFilter: "url(#darkIconContrast)",
  }),
  light: Object.freeze({
    bg: "#eaf4fb",
    panel: "#fbfdff",
    card: "#eaf2f9",
    stroke: "#aac2d6",
    text: "#172b40",
    sub: "#4e6b86",
    muted: "#718aa2",
    radarBg: "#f7fbff",
    shadow: "#7892aa",
    portraitShade: "#eaf4fb",
    cyan: "#1eb9ed",
    pink: "#ff5e95",
    gold: "#f4a900",
    grid: "#bdd6e7",
    panelOpacity: "0.86",
    cardOpacity: "0.82",
    iconChipOpacity: "1",
    iconFilter: "url(#lightIconContrast)",
  }),
});

export const FULL_OUTPUT_LAYOUT = Object.freeze({
  canvas: Object.freeze({ width: 1920, height: 1080 }),
  portrait: Object.freeze({ x: 500, top: 36, bottom: 36, width: 900 }),
  right: Object.freeze({
    x: 900,
    width: 830,
    overallTop: 48,
    overallHeight: 214,
    radarTop: 278,
    radarHeight: 752,
  }),
  comments: Object.freeze({ x: 74, top: 626, width: 700, height: 352 }),
});

export function scaleFullOutputLayout(width) {
  const scale = width / FULL_OUTPUT_LAYOUT.canvas.width;
  const scaled = value => Math.round(value * scale * 100) / 100;
  return {
    scale,
    portrait: {
      x: scaled(FULL_OUTPUT_LAYOUT.portrait.x),
      top: scaled(FULL_OUTPUT_LAYOUT.portrait.top),
      bottom: scaled(FULL_OUTPUT_LAYOUT.portrait.bottom),
      width: scaled(FULL_OUTPUT_LAYOUT.portrait.width),
    },
    right: {
      x: scaled(FULL_OUTPUT_LAYOUT.right.x),
      width: scaled(FULL_OUTPUT_LAYOUT.right.width),
      overallTop: scaled(FULL_OUTPUT_LAYOUT.right.overallTop),
      overallHeight: scaled(FULL_OUTPUT_LAYOUT.right.overallHeight),
      radarTop: scaled(FULL_OUTPUT_LAYOUT.right.radarTop),
      radarHeight: scaled(FULL_OUTPUT_LAYOUT.right.radarHeight),
    },
    comments: {
      x: scaled(FULL_OUTPUT_LAYOUT.comments.x),
      top: scaled(FULL_OUTPUT_LAYOUT.comments.top),
      width: scaled(FULL_OUTPUT_LAYOUT.comments.width),
      height: scaled(FULL_OUTPUT_LAYOUT.comments.height),
    },
  };
}

export function outputTheme(theme = "dark") {
  return OUTPUT_THEMES[theme] || OUTPUT_THEMES.dark;
}

export function outputThemeCssVariables(theme = "dark") {
  const tokens = outputTheme(theme);
  return {
    "--bg-deep": tokens.bg,
    "--bg-panel": tokens.panel,
    "--bg-card": tokens.card,
    "--border": tokens.stroke,
    "--border-bright": tokens.stroke,
    "--text-primary": tokens.text,
    "--text-secondary": tokens.sub,
    "--text-muted": tokens.muted,
    "--accent-blue": tokens.cyan,
    "--accent-gold": tokens.gold,
    "--output-canvas": tokens.bg,
    "--output-panel": tokens.panel,
    "--output-card": tokens.card,
    "--output-stroke": tokens.stroke,
    "--output-text": tokens.text,
    "--output-sub": tokens.sub,
    "--output-muted": tokens.muted,
    "--output-cyan": tokens.cyan,
    "--output-pink": tokens.pink,
    "--output-gold": tokens.gold,
    "--output-grid": tokens.grid,
  };
}
