import React from "react";
import { Composition, registerRoot } from "remotion";

function CardExample({ svg, width, height }) {
  return <div
    style={{ width, height, background: "#000" }}
    dangerouslySetInnerHTML={{ __html: svg }}
  />;
}

function Root() {
  return <Composition
    id="CardExample"
    component={CardExample}
    durationInFrames={1}
    fps={30}
    width={960}
    height={540}
    defaultProps={{ svg: "", width: 960, height: 540 }}
    calculateMetadata={({ props }) => ({ width: props.width, height: props.height })}
  />;
}

registerRoot(Root);
