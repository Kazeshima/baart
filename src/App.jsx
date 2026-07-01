import { useEffect, useRef } from "react";
import { useRatingStore } from "./store/ratingStore.js";
import { LANGS, LANG_URLS, SEASONS } from "./utils/constants.js";
import { UI_LANGS, t, terrainLabel } from "./utils/i18n.js";
import { useExport } from "./components/ExportCard.jsx";
import Sidebar from "./components/Sidebar.jsx";
import StudentInfo from "./components/StudentInfo.jsx";
import RatingPanel from "./components/RatingPanel.jsx";
import OverallRating from "./components/OverallRating.jsx";

function parseStudents(raw) {
  const applyWeaponAdaptation = (student, terrainKey, baseValue) => {
    const weapon = student.Weapon || {};
    if (weapon.AdaptationType !== terrainKey || typeof weapon.AdaptationValue !== "number") {
      return undefined;
    }
    return Math.min(5, (baseValue ?? 0) + weapon.AdaptationValue);
  };

  return Object.values(raw)
    .filter(s => s.IsReleased?.[0] === true)
    .map(s => ({
      id:           s.Id,
      name:         s.Name || s.DevName,
      devName:      s.DevName,
      school:       s.School,
      squadType:    s.SquadType,
      tacticRole:   s.TacticRole,
      position:     s.Position,
      bulletType:   s.BulletType,
      armorType:    s.ArmorType,
      weaponType:   s.WeaponType,
      range:        s.Range,
      cover:        s.Cover,
      equipment:    s.Equipment || [],
      streetAdapt:  s.StreetBattleAdaptation,
      outdoorAdapt: s.OutdoorBattleAdaptation,
      indoorAdapt:  s.IndoorBattleAdaptation,
      // UE50 terrain upgrade is stored in SchaleDB's Weapon.AdaptationType/Value.
      ueStreetAdapt:  s.StreetBattleAdaptationAfterUG ?? applyWeaponAdaptation(s, "Street", s.StreetBattleAdaptation),
      ueOutdoorAdapt: s.OutdoorBattleAdaptationAfterUG ?? applyWeaponAdaptation(s, "Outdoor", s.OutdoorBattleAdaptation),
      ueIndoorAdapt:  s.IndoorBattleAdaptationAfterUG ?? applyWeaponAdaptation(s, "Indoor", s.IndoorBattleAdaptation),
      weaponAdaptationType: s.Weapon?.AdaptationType,
      weaponAdaptationValue: s.Weapon?.AdaptationValue,
      starGrade:    s.StarGrade,
    }))
    .sort((a, b) => a.id - b.id);
}

export default function App() {
  const {
    loading, error, language,
    uiLanguage, theme, setStudents, setError, setLanguage, setUiLanguage, setTheme,
    selectedStudent,
    season, setSeason, arenaSeason, setArenaSeason,
    exportRatingsJSON, importRatingsJSON, loadRatingsFromFile,
  } = useRatingStore();

  const { exportCard } = useExport();
  const importRef = useRef(null);

  useEffect(() => {
    const url = LANG_URLS[language] || LANG_URLS.zh;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setStudents(parseStudents(data)))
      .catch(e => setError(e.message));
  }, [language]);

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ok = importRatingsJSON(ev.target.result);
      if (!ok) alert("导入失败：文件格式不正确");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveJson = async () => {
    try {
      const path = await exportRatingsJSON();
      alert(`${t(uiLanguage, "savedTo")}: ${path}`);
    } catch (err) {
      alert(`${t(uiLanguage, "saveFailed")}: ${err}`);
    }
  };

  const handleLoadJson = async () => {
    try {
      const data = await loadRatingsFromFile();
      if (!data) {
        importRef.current?.click();
        return;
      }
      alert(`${t(uiLanguage, "loadedFrom")}: ratings/ba_pvp_ratings.json`);
    } catch (err) {
      alert(`${t(uiLanguage, "loadFailedShort")}: ${err}`);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", letterSpacing: "0.12em" }}>
        {t(uiLanguage, "loading")}
      </div>
    </div>
  );

  if (error) return (
    <div className="loading-screen">
      <div style={{ color: "var(--accent-red)", fontSize: 14 }}>{t(uiLanguage, "loadFailed")}：{error}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{t(uiLanguage, "checkNetwork")}</div>
    </div>
  );

  return (
    <div className="app-root" data-theme={theme}>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__logo">
          {t(uiLanguage, "title")} <span>·</span> {arenaSeason || "S?"}
        </div>

        <label className="header-field">
          <span>{t(uiLanguage, "arenaSeason")}</span>
          <input
            className="season-code-input"
            value={arenaSeason}
            placeholder={t(uiLanguage, "arenaSeasonPlaceholder")}
            onChange={e => setArenaSeason(e.target.value)}
          />
        </label>

        {/* Season selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {t(uiLanguage, "terrain")}
          </span>
          <div className="season-selector">
            {SEASONS.map(s => (
              <button
                key={s.key}
                className={`season-btn ${season === s.key ? "active" : ""}`}
                onClick={() => setSeason(s.key)}
              >
                <img src={s.icon} alt={terrainLabel(uiLanguage, s.key)} />
                {terrainLabel(uiLanguage, s.key)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>{t(uiLanguage, "theme")}</span>
          <select
            className="styled-select"
            value={theme}
            onChange={e => setTheme(e.target.value)}
          >
            <option value="dark">{t(uiLanguage, "darkTheme")}</option>
            <option value="light">{t(uiLanguage, "lightTheme")}</option>
          </select>
        </div>

        {/* Language selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>{t(uiLanguage, "dataLanguage")}</span>
          <select
            className="styled-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            {Object.entries(LANGS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>{t(uiLanguage, "uiLanguage")}</span>
          <select
            className="styled-select"
            value={uiLanguage}
            onChange={e => setUiLanguage(e.target.value)}
          >
            {Object.entries(UI_LANGS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {selectedStudent && (
            <>
            <button className="btn btn-gold" onClick={() => exportCard("compact", "svg")} title={t(uiLanguage, "compactCard")}>
              {t(uiLanguage, "compactCard")}
            </button>
            <button className="btn btn-gold" onClick={() => exportCard("full", "svg")} title={t(uiLanguage, "fullCard")}>
              {t(uiLanguage, "fullCard")}
            </button>
            <button className="btn btn-gold" onClick={() => exportCard("compact", "png")} title={t(uiLanguage, "compactPng")}>
              {t(uiLanguage, "compactPng")}
            </button>
            <button className="btn btn-gold" onClick={() => exportCard("full", "png")} title={t(uiLanguage, "fullPng")}>
              {t(uiLanguage, "fullPng")}
            </button>
            <button className="btn btn-primary" onClick={() => exportCard("batch", "zip")} title={t(uiLanguage, "batchExport")}>
              {t(uiLanguage, "batchExport")}
            </button>
            </>
          )}
          <button className="btn btn-primary" onClick={handleSaveJson} title={t(uiLanguage, "saveJson")}>
            {t(uiLanguage, "saveJson")}
          </button>
          <button className="btn btn-ghost" onClick={handleLoadJson} title={t(uiLanguage, "loadJson")}>
            {t(uiLanguage, "loadJson")}
          </button>
          <button className="btn btn-ghost" onClick={() => importRef.current?.click()} title={t(uiLanguage, "downloadJson")}>
            {t(uiLanguage, "downloadJson")}
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
        </div>
      </header>

      {/* ── Sidebar ── */}
      <Sidebar />

      {/* ── Main panel ── */}
      <div className="main-panel">
        {!selectedStudent ? (
          <div className="empty-state">
            <div className="empty-state__icon">⭐</div>
            <div className="empty-state__text">{t(uiLanguage, "emptyTitle")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {t(uiLanguage, "autosaveHint")}
            </div>
          </div>
        ) : (
          <>
            <StudentInfo student={selectedStudent} />
            <RatingPanel />
            <OverallRating />
          </>
        )}
      </div>
    </div>
  );
}
