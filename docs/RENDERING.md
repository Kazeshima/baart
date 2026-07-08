# Rendering and Performance

[README](../README.md) | [Video Studio](VIDEO_STUDIO.md)

BAART uses Remotion's native renderer APIs:

- MP4: `renderMedia()`
- PNG sequence: `renderFrames({ imageFormat: "png" })`
- JPEG sequence: `renderFrames({ imageFormat: "jpeg" })`

PNG and JPEG sequences are rendered directly from the React composition. They are not extracted from encoded video.

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

