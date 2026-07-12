import { useEffect, useState } from "react";
import { formatWeightShare } from "../../utils/scoring.js";

export function WeightNumberInput({ value, onCommit, className }) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [draft, setDraft] = useState(safeValue.toFixed(1));

  useEffect(() => {
    setDraft(safeValue.toFixed(1));
  }, [safeValue]);

  const reset = () => setDraft(safeValue.toFixed(1));
  const commit = () => {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric)) {
      reset();
      return;
    }
    const committed = onCommit(numeric);
    setDraft(Number(committed ?? safeValue).toFixed(1));
  };

  return <input
    className={className}
    type="number"
    min="0"
    max="100"
    step="0.1"
    value={draft}
    onChange={event => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        reset();
        event.currentTarget.blur();
      }
    }}
  />;
}

export function WeightShareControl({ label, value, onChange, onCommit = onChange, className, numberClassName }) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return <label className={className}>
    <span>{label}</span>
    <input type="range" min="0" max="100" step="0.1" value={safeValue} onChange={event => onChange(Number(event.target.value))} />
    <WeightNumberInput className={numberClassName} value={safeValue} onCommit={onCommit} />
    <strong>{formatWeightShare(safeValue)}</strong>
  </label>;
}
