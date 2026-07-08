import { useState, useRef, useEffect } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRatingStore } from "../store/ratingStore.js";
import { OVERALL_COLORS } from "../utils/constants.js";
import { OVERALL_LABELS, localeFor, schoolLabel, t } from "../utils/i18n.js";
import { ratingRecordsFromStudents, sortRatingRecords } from "../utils/ratingSorting.js";
import { studentDisplayName } from "../utils/studentDisplay.js";

function SortableRatedStudent({ record, selected, onSelect, overallLabel, overallColor, language, manual }) {
  const id = String(record.student.id);
  const sortable = useSortable({ id, disabled: !manual });
  const style = manual ? {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  } : undefined;
  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`student-list-item ${selected ? "selected" : ""} ${manual ? "is-draggable" : ""}`}
      onClick={() => onSelect(record.student)}
      {...(manual ? sortable.attributes : {})}
      {...(manual ? sortable.listeners : {})}
    >
      {manual ? <span className="student-list-item__handle">⋮⋮</span> : null}
      <img
        src={`https://schaledb.com/images/student/collection/${record.student.id}.webp`}
        alt={record.student.name}
      />
      <div className="student-list-item__body">
        <div className="student-list-item__name">{studentDisplayName(record.student, language)}</div>
        <div className="student-list-item__meta">#{record.student.id} · {schoolLabel(language, record.student.school)}</div>
      </div>
      {overallLabel && (
        <div
          className="student-list-item__rated"
          style={{
            background: `${overallColor}22`,
            border: `1.5px solid ${overallColor}`,
            color: overallColor,
          }}
        >
          {overallLabel}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const {
    students, searchQuery, searchResults,
    setSearchQuery, selectStudent, selectedStudent,
    allRatings, getEffectiveAllRatings, uiLanguage,
    ratingOrder, setRatingOrder,
  } = useRatingStore();

  const locale = localeFor(uiLanguage);
  const effectiveAllRatings = getEffectiveAllRatings();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  const ratedRecords = sortRatingRecords(
    ratingRecordsFromStudents(students, allRatings, effectiveAllRatings),
    ratingOrder,
  );
  const manualMode = ratingOrder.mode === "manual";

  const handleDragEnd = event => {
    if (!event.over || event.active.id === event.over.id) return;
    const ids = ratedRecords.map(record => String(record.student.id));
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    setRatingOrder({ mode: "manual", direction: "asc", manualIds: arrayMove(ids, from, to).map(Number) });
  };

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
        {t(uiLanguage, "ratedStudents")} ({ratedRecords.length})
      </div>
      <div className="student-sort-controls">
        <select value={ratingOrder.mode} onChange={event => {
          const mode = event.target.value;
          setRatingOrder({ ...ratingOrder, mode, direction: mode === "score" ? "desc" : ratingOrder.direction });
        }}>
          <option value="chronological">{t(uiLanguage, "sortChronological")}</option>
          <option value="score">{t(uiLanguage, "overallScore")}</option>
          <option value="id">{t(uiLanguage, "studentId")}</option>
          <option value="school">{t(uiLanguage, "school")}</option>
          <option value="manual">{t(uiLanguage, "manual")}</option>
        </select>
        <select value={ratingOrder.direction} disabled={manualMode} onChange={event => setRatingOrder({ ...ratingOrder, direction: event.target.value })}>
          <option value="asc">{t(uiLanguage, "ascending")}</option>
          <option value="desc">{t(uiLanguage, "descending")}</option>
        </select>
      </div>
      <div className="student-list">
        {ratedRecords.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            {t(uiLanguage, "emptyTitle")}
          </div>
        )}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={ratedRecords.map(record => String(record.student.id))} strategy={verticalListSortingStrategy}>
            {ratedRecords.map(record => {
              const overall = record.ratings?.overall;
              return <SortableRatedStudent
                key={record.student.id}
                record={record}
                selected={selectedStudent?.id === record.student.id}
                onSelect={selectStudent}
                overallLabel={overall !== null && overall !== undefined ? OVERALL_LABELS[locale][overall] : ""}
                overallColor={overall !== null && overall !== undefined ? OVERALL_COLORS[overall] : ""}
                language={uiLanguage}
                manual={manualMode}
              />;
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
