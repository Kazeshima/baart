import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { orderedProjectRecords } from "../core/manifest.js";
import { getTimeline } from "../core/config.js";
import StudentScene from "./StudentScene.jsx";

export default function ArenaRatingVideo({ project }) {
  const records = orderedProjectRecords(project);
  const timeline = getTimeline(project.settings);
  return <AbsoluteFill style={{ background: "#06080f" }}>
    {records.map((record, index) => (
      <Sequence key={record.student.id} from={index * timeline.duration} durationInFrames={timeline.duration} premountFor={project.settings.fps}>
        <StudentScene record={record} settings={project.settings} />
      </Sequence>
    ))}
  </AbsoluteFill>;
}
