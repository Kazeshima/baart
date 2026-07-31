# Rendering and Performance

[README](../README.md) | [Video Studio](VIDEO_STUDIO.md)

BAART uses Remotion's native renderer APIs:

- MP4: `renderMedia()`
- PNG sequence: `renderFrames({ imageFormat: "png" })`
- JPEG sequence: `renderFrames({ imageFormat: "jpeg" })`
- Transparent production PNG sequence: `renderFrames({ imageFormat: "png" })`
- Transparent production MOV: `renderMedia({ codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le" })`

PNG and JPEG sequences are rendered directly from the React composition. They are not extracted from encoded video.

Production-assets mode renders a student/layer task matrix through the separate `ArenaProductionAsset` composition. It keeps the full 1920×1080 design canvas transparent and uses the same frame-driven animation settings as the complete guide composition.

## Standalone Windows Renderer

The Windows x64 Tauri app bundles:

- A pinned Node.js runtime
- Remotion renderer modules
- Windows compositor binaries
- A prebuilt composition bundle
- Generated local school-icon assets

The first render downloads Chrome for Testing into BAART's writable application cache. Later renders reuse that browser cache. Student portraits and reusable render assets are cached locally for the renderer to reduce network retries.

## Output

MP4 uses a native Save As dialog. PNG and JPEG sequences use a folder picker and create a unique `<name>-frames` output folder.

Production-assets mode always uses a folder picker and creates a unique `<name>-production-assets` root. Student folders contain one subfolder per selected layer. PNG mode stores native RGBA frames inside those folders; ProRes mode stores one 4444 MOV inside each layer folder. `production-assets.json` records the canvas, FPS, duration, format, students, layers, and relative output paths.

JPEG sequence output is faster and smaller but lossy. PNG sequence output remains the default lossless frame pipeline for editing or downstream encoding.

## Benchmarking

The Video Studio benchmark runs:

- An IO-only write test
- Repeated short render trials for supported concurrency settings
- PNG/JPEG format comparison

If the report says "browser scene rendering or image encoding", disk throughput is already much higher than render throughput. In that case, faster output storage is unlikely to be the main fix; use JPEG sequence or Fast quality mode when lossy/faster output is acceptable.

CLI profiling:

```powershell
npm run video:profile -- --quick --frames=180
```

Reports are written under ignored cache/output folders.

## Generated Assets

School icons are downloaded during asset preparation from SchaleDB paths such as:

```text
https://schaledb.com/images/schoolicon/Millennium.png
```

They are stored under generated local app assets and included in the built app/release payload. Runtime UI and rendering should not need network access for school icons.

