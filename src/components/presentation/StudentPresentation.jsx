import React from "react";
import { createStudentRatingPresentation } from "../../utils/presentationModel.js";

export function StudentIdentity({ student, language = "zh", presentation, nameClassName, metaClassName, nameStyle, children, ImageComponent = "img", showSchool = true }) {
  const model = presentation || createStudentRatingPresentation({ student, language });
  const Image = ImageComponent;
  return <>
    <div className={nameClassName} style={{ whiteSpace: "pre-wrap", ...nameStyle }}>{model.identity.displayName}</div>
    <div className={metaClassName}>
      <span>{model.identity.developerName}</span><span> · </span><span>#{model.identity.id}</span>
      {showSchool ? <><span> · </span><span className="student-school-meta">{model.identity.schoolIcon ? <Image className="student-school-icon" src={model.identity.schoolIcon} alt="" /> : null}<span className="student-school-name">{model.identity.schoolLabel}</span></span></> : null}
    </div>
    {children}
  </>;
}

export function StudentFactIndicator({ ImageComponent = "img", icon, label, color, className = "type-badge", title, output = false }) {
  const Image = ImageComponent;
  const style = output
    ? { "--fact-color": color, borderColor: color, color }
    : { border: `1px solid ${color}`, borderColor: color, color, background: `${color}22` };
  return <div className={className} title={title} style={style}>
    <Image className="student-fact-icon" src={icon} alt={label} />
    <span>{label}</span>
  </div>;
}

export function StudentTypeIndicators({ student, language, presentation, ImageComponent = "img", variant = "editor", mutedColor = "#4a6080" }) {
  const model = presentation || createStudentRatingPresentation({ student, language });
  const className = variant === "video" ? "video-fact-chip" : "type-badge";
  return <>
    <StudentFactIndicator ImageComponent={ImageComponent} className={className} output={variant === "video"} {...model.facts.attack} />
    <StudentFactIndicator ImageComponent={ImageComponent} className={className} output={variant === "video"} {...model.facts.defense} />
    {variant === "video" ? <StudentFactIndicator ImageComponent={ImageComponent} className={className} output icon={model.facts.cover.icon} label={model.facts.cover.label} color={model.facts.cover.active ? "#38bdf8" : mutedColor} /> : null}
  </>;
}

export function StudentTerrainIndicators({ student, activeSeason, language, presentation, ImageComponent = "img", variant = "editor" }) {
  const Image = ImageComponent;
  const model = presentation || createStudentRatingPresentation({ student, language, activeSeason });
  const rowClass = variant === "video" ? "video-terrain-strip" : "terrain-row";
  const itemClass = variant === "video" ? "video-terrain" : "terrain-item";

  return <div className={rowClass}>{model.terrains.map(terrain => (
    <div key={terrain.key} className={`${itemClass} ${terrain.active ? (variant === "video" ? "is-active" : "active") : ""}`} title={terrain.label}>
      <Image className="student-terrain-icon" src={terrain.icon} alt={terrain.label} />
      {variant === "video" ? <>
        <Image className="video-terrain__rank" src={terrain.rankIcon} alt={`${terrain.level}`} />
        {terrain.hasUpgrade ? <><span>→</span><Image className="video-terrain__rank" src={terrain.upgradedRankIcon} alt={`${terrain.upgradedLevel}`} /></> : null}
      </> : <div className="terrain-adapt" title={`${model.labels.level} ${terrain.level}`}>
        <Image src={terrain.rankIcon} alt={`${model.labels.level} ${terrain.level}`} />
        {terrain.hasUpgrade ? <span className="terrain-ue">→ <Image src={terrain.upgradedRankIcon} alt={`${model.labels.ue50} ${terrain.upgradedLevel}`} /> {model.labels.ue50}</span> : null}
      </div>}
    </div>
  ))}</div>;
}
