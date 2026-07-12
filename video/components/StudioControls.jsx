import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { schoolLabel } from "../../src/utils/i18n.js";
import { schoolIconPath } from "../../src/utils/schoolIcons.js";
import { studentDisplayName } from "../../src/utils/studentDisplay.js";

export function NumberControl({ label, value, onChange, min = 0, max, step = 0.1 }) {
  return <label className="studio-control"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></label>;
}

export function SortableStudent({ record, language }) {
  const id = String(record.student.id);
  const sortable = useSortable({ id });
  const schoolIcon = schoolIconPath(record.student.school);
  return <div ref={sortable.setNodeRef} className="studio-order-item" style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} {...sortable.attributes} {...sortable.listeners}>
    <span className="studio-order-handle">⋮⋮</span><span>{studentDisplayName(record.student, language)}</span><small>#{record.student.id} · {schoolIcon ? <img className="studio-school-icon" src={schoolIcon} alt="" /> : null}{schoolLabel(language, record.student.school)}</small>
  </div>;
}
