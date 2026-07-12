import { useEffect, useRef, useState } from "react";
import { estimatePreviewFps } from "../core/config.js";

export function usePreviewTelemetry({ playerRef, recordsLength, targetFps, durationInFrames }) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [previewFps, setPreviewFps] = useState(0);
  const previewEventsRef = useRef(0);
  const lastFrameUiUpdateRef = useRef(0);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const listener = event => {
      const frame = event.detail.frame;
      previewEventsRef.current += 1;
      const now = performance.now();
      if (now - lastFrameUiUpdateRef.current >= 100) {
        lastFrameUiUpdateRef.current = now;
        setCurrentFrame(frame);
      }
    };
    player.addEventListener("frameupdate", listener);
    return () => player.removeEventListener("frameupdate", listener);
  }, [playerRef, recordsLength]);

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();
    let lastEvents = previewEventsRef.current;
    const tick = now => {
      if (now - lastTime >= 1000) {
        const events = previewEventsRef.current - lastEvents;
        setPreviewFps(estimatePreviewFps(events, now - lastTime));
        lastEvents = previewEventsRef.current;
        lastTime = now;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [recordsLength, targetFps]);

  useEffect(() => {
    const lastFrame = Math.max(0, durationInFrames - 1);
    if (currentFrame > lastFrame) {
      playerRef.current?.seekTo(lastFrame);
      setCurrentFrame(lastFrame);
    }
  }, [currentFrame, durationInFrames, playerRef]);

  return { currentFrame, setCurrentFrame, previewFps };
}
