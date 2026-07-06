import React from "react";
import { Composition } from "remotion";
import ArenaRatingVideo from "./ArenaRatingVideo.jsx";
import { DEFAULT_VIDEO_SETTINGS, totalDurationInFrames } from "../core/config.js";
import { createVideoProject } from "../core/manifest.js";

const defaultProject = createVideoProject({
  settings: DEFAULT_VIDEO_SETTINGS,
  order: undefined,
  records: [{
    legacyOrder: 0,
    student: {
      id: 10000, name: "Sample Student", devName: "Sample", school: "BAART",
      squadType: "Main", tacticRole: "DamageDealer", bulletType: "Explosion", armorType: "LightArmor",
      weaponType: "AR", range: 650, cover: true, streetAdapt: 4, outdoorAdapt: 3, indoorAdapt: 2,
    },
    ratings: {
      blindshot: "S", counter: "A", defense: "B", counterDef: "A", cost: "B",
      overall: 3, overallScore: 3.8, overallAuto: false, notes: "Import ratings in Video Studio to preview the complete arena guide.",
      dimensionWeights: { blindshot: "full", counter: "full", defense: "full", counterDef: "full", cost: "half" },
      costWeight: "half",
    },
  }],
});

export const calculateArenaMetadata = ({ props }) => ({
  durationInFrames: totalDurationInFrames(props.project.records.length, props.project.settings),
  fps: props.project.settings.fps,
  width: 1920,
  height: 1080,
  props,
  defaultCodec: "h264",
  defaultOutName: props.project.settings.outputName,
});

export function RemotionRoot() {
  return <Composition
    id="ArenaRatingVideo"
    component={ArenaRatingVideo}
    durationInFrames={totalDurationInFrames(defaultProject.records.length, defaultProject.settings)}
    fps={defaultProject.settings.fps}
    width={defaultProject.settings.width}
    height={defaultProject.settings.height}
    defaultProps={{ project: defaultProject }}
    calculateMetadata={calculateArenaMetadata}
  />;
}

export { defaultProject };
