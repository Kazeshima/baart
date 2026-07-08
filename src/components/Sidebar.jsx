import { useState, useRef, useEffect } from "react";
import { useRatingStore } from "../store/ratingStore.js";
import { OVERALL_COLORS } from "../utils/constants.js";
import { OVERALL_LABELS, localeFor, t } from "../utils/i18n.js";

export default function Sidebar() {
  const {
    students, searchQuery, searchResults,
    setSearchQuery, selectStudent, selectedStudent,
    allRatings, getEffectiveAllRatings, uiLanguage,
  } = useRatingStore();

  const locale = localeFor(uiLanguage);
  const effectiveAllRatings = getEffectiveAllRatings();

  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!showDropdown) return;
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [showDropdown]);

  const handleSelect = (student) => {
    selectStudent(student);
    setSearchQuery("");
    setShowDropdown(false);
  };

  // Show rated students in the list, sorted by id
  const ratedStudentIds = Object.keys(allRatings).map(Number);
  const ratedStudents   = students
    .filter(s => ratedStudentIds.includes(s.id))
    .sort((a, b) => {
      const ra = effectiveAllRatings[a.id]?.overall;
      const rb = effectiveAllRatings[b.id]?.overall;
      return (rb ?? -1) - (ra ?? -1);
    });

  return (
    <div className="sidebar">
      {/* Search */}
      <div className="search-box" ref={searchRef}>
        <input
          className="search-input"
          placeholder={t(uiLanguage, "searchPlaceholder")}
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
        />
        {showDropdown && searchResults.length > 0 && (
          <div className="search-dropdown">
            {searchResults.map(s => (
              <div
                key={s.id}
                className={`search-item ${selectedStudent?.id === s.id ? "active" : ""}`}
                onMouseDown={() => handleSelect(s)}
              >
                <img
                  src={`https://schaledb.com/images/student/collection/${s.id}.webp`}
                  alt={s.name}
                />
                <div className="search-item__info">
                  <div className="search-item__name">{s.name}</div>
                  <div className="search-item__sub">{s.devName} · {s.id}</div>
                </div>
                {effectiveAllRatings[s.id]?.overall !== null && effectiveAllRatings[s.id]?.overall !== undefined && (
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: OVERALL_COLORS[effectiveAllRatings[s.id].overall],
                  }}>
                    {OVERALL_LABELS[locale][effectiveAllRatings[s.id].overall]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rated students list */}
      <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
        {t(uiLanguage, "ratedStudents")} ({ratedStudents.length})
      </div>
      <div className="student-list">
        {ratedStudents.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            {t(uiLanguage, "emptyTitle")}
          </div>
        )}
        {ratedStudents.map(s => {
          const r = effectiveAllRatings[s.id];
          const overall = r?.overall;
          return (
            <div
              key={s.id}
              className={`student-list-item ${selectedStudent?.id === s.id ? "selected" : ""}`}
              onClick={() => selectStudent(s)}
            >
              <img
                src={`https://schaledb.com/images/student/collection/${s.id}.webp`}
                alt={s.name}
              />
              <div>
                <div className="student-list-item__name">{s.name}</div>
                <div className="student-list-item__meta">{s.devName}</div>
              </div>
              {overall !== null && overall !== undefined && (
                <div
                  className="student-list-item__rated"
                  style={{
                    background: `${OVERALL_COLORS[overall]}22`,
                    border: `1.5px solid ${OVERALL_COLORS[overall]}`,
                    color: OVERALL_COLORS[overall],
                  }}
                >
                  {OVERALL_LABELS[locale][overall]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
