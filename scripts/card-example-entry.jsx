import React from "react";
import { Composition, registerRoot } from "remotion";

function CardExample({ svg }) {
  return <div
    style={{ width: 960, height: 540, background: "#000" }}
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
    defaultProps={{ svg: "" }}
  />;
}

registerRoot(Root);
