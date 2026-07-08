# BAART

[English](README.md) | [简体中文](README.zh-CN.md)

**BAART** is the **Blue Archive Arena Rating Tool**, an unofficial desktop application for recording, comparing, and sharing PvP evaluations of Blue Archive students.

It loads student information from [SchaleDB](https://schaledb.com), combines five user-assigned rating dimensions into an overall score, and exports compact or full-size rating cards as SVG and PNG images.

## Features

- Search students using localized SchaleDB data.
- Display role, attack and armor types, weapon, range, cover behavior, equipment, and terrain adaptation.
- Rate five arena-focused dimensions from S to E.
- Calculate or manually override a five-level overall rating, with shared-by-default normalized percentage weights for every dimension.
- Store ratings locally and import/export them as JSON.
- Export compact and full rating cards as SVG or PNG.
- Batch-export rated students in a ZIP archive.
- English and Simplified Chinese interfaces with dark and light themes.
- Native Windows file dialogs through Tauri.
- A configurable Remotion Video Studio for previewing and rendering every rated student as a 16:9 arena guide.

## Technology

- [React](https://react.dev/) and [Vite](https://vite.dev/)
- [Zustand](https://zustand-demo.pmnd.rs/) for local state
- [Tauri 2](https://tauri.app/) with a Rust backend
- Student data and artwork loaded from [SchaleDB](https://schaledb.com)

## Development

Prerequisites:

- Node.js 18 or newer
- Rust 1.77.2 or newer
- Tauri's Windows build prerequisites

Install dependencies and run the web interface:

```powershell
npm install
npm run dev
```

Run the desktop application:

```powershell
npm run tauri dev
```

On Windows x64, the Tauri command automatically prepares the standalone renderer: it downloads and verifies the pinned Node.js 24.18.0 runtime, installs production-only Remotion dependencies, and prebuilds the composition bundle. Generated runtime files are ignored by Git.

Create a production web build:

```powershell
npm run build
```

Create the standalone executable and installers:

```powershell
npm run tauri build
```

## Video Studio

Open the rating tool with the Video Studio and localhost render API:

```powershell
npm run video:preview
```

The regular `npm run dev` server also exposes the render API. For direct composition inspection in Remotion Studio, run:

```powershell
npm run video:studio
```

Video Studio loads ratings from local storage or imported rating JSON. A `.baart-video.json` project manifest snapshots normalized ratings, resolved student metadata, manual ordering, language, theme, timing, effects, resolution, and output settings for reproducible renders. Students can be sorted chronologically, by overall score, by ID, by school, or by drag-and-drop manual order.

Dimension score weights support two editors. Fine Percentages is the default and uses an explicit unassigned-weight budget: increasing one dimension only consumes unassigned budget, while decreasing a dimension releases weight back to that budget. Other dimensions never move automatically. Typed percentage inputs commit on blur or Enter, so partial values are not applied while typing. Auto overall, card export, and video rendering are blocked until the unassigned budget reaches `0%`; complete fine weights score as `sum(score × percentage) / 100`. Preset Weights restores the old zero/half/full model for users who prefer coarse controls. Shared weights remain the default scope, with Individual mode available for per-student exceptions. Older normalized-share JSON imports as Fine Percentages, while legacy `none`, `half`, or `full` files import as Preset Weights.

Radar timing controls independently configure the mechanical scan, scan trail, point reveal, post-scan polygon reveal, information block entrance, overall reveal, glow, and comment scrolling. The default scan completes in 1.5 seconds. Each dimension result fades in at its final radar position only after the sweep reaches that axis, and high S/A values keep their ripple emphasis. Long comments start scrolling after the comment block enters and are timed to reach the bottom before fade-out in Fit Hold mode; Fixed Speed remains available for manual control.

Light theme applies additional contrast treatment to type, cover, terrain, and adaptability icons so white icon regions remain visible on pale backgrounds in the editor, video, and exported cards.

The render concurrency default is Adaptive. BAART predicts a conservative worker count from the local CPU, and the dashboard includes a benchmark button that renders repeated short image-sequence samples to choose the fastest stable value for the current machine and output target. Benchmark progress is reported as steps: one IO write test, repeated concurrency trials, and a PNG/JPEG format comparison. The best result is applied automatically, while Auto, 100%, and fixed-worker options remain available for manual tuning. Benchmark reports classify bottlenecks; "browser scene rendering or image encoding" means disk write throughput is already much higher than render throughput.

MP4, lossless PNG sequences, and optional lossy JPEG sequences support 720p, 1080p, and 4K output. PNG and JPEG frames are rendered directly from the React composition with Remotion's [`renderFrames()`](https://www.remotion.dev/docs/renderer/render-frames) API and are never extracted from an encoded video. This is the programmatic equivalent of Remotion's documented [`--sequence`](https://www.remotion.dev/docs/cli/render#--sequence) CLI mode. MP4 output uses `renderMedia()`. The render quality setting defaults to Balanced; Quality preserves the heavier comment mask, while Fast reduces expensive shadows/glows for quicker sequence output.

In the Windows x64 desktop application, MP4 uses a native Save As dialog. PNG and JPEG sequence output use a native folder dialog and create a new `<name>-frames` folder without overwriting an existing sequence. Absolute destinations stay local to the machine and are not stored in portable project manifests. The first render downloads Remotion's compatible Chrome for Testing build into BAART's writable application cache under `renderer-runtime/node_modules/.remotion`; later renders reuse it. Portraits and UI icons are also cached locally for rendering so frames do not repeatedly load SchaleDB images from the network. The first render therefore requires internet access but never writes into the installation directory.

Browser development uses the localhost render API and writes to the ignored `video-output/` directory. Both `npm run dev` and `npm run video:preview` expose this API and reject non-JSON responses with a clear transport error.

Render a saved project without the dashboard:

```powershell
npm run video:render -- path\to\project.baart-video.json
```

The packaged Tauri application includes a pinned Node runtime, Remotion renderer modules, platform compositor binaries, and the prebuilt composition. It renders without a separately installed Node.js or localhost service. This standalone renderer currently targets Windows x64 and materially increases executable and installer size.

Renderer failures preserve the underlying Node or Remotion message together with the process exit code. Warnings and browser retry messages are shown in the separate scrollable render log section instead of the progress summary. For a packaged-runtime verification independent of development `node_modules`, run `npm run renderer:smoke`; add `-- --fresh-browser` to verify a clean Chrome download and cache reuse.

On Windows, BAART converts Tauri's verbatim `\\?\` resource paths to conventional drive or UNC paths before invoking Node.js. This avoids Node treating the drive prefix as the script entry point while retaining Unicode and long-path-compatible internal file handling.

To profile rendering with the real test rating data, run:

```powershell
npm run video:profile -- --quick --frames=180
```

The profiler renders bounded 1080p/60 ranges using the native Remotion frame pipeline and writes reports under the ignored `.cache/video-profile/` directory. Reports include render FPS, output bytes, MB/s, an IO-only write benchmark, and a bottleneck classification. Use `--case=full-8,full-12` to compare selected cases, `--case=full-adaptive-jpeg` to diagnose PNG encoding overhead against a lighter image format, `--case=fast-quality-mode-adaptive` to measure the fast quality setting, `--ui-language=en --theme=light` to inspect other layouts, or omit `--quick` for the full block/concurrency sweep. Recent local samples showed IO hundreds of files per second faster than rendering, so current bottlenecks are browser scene rendering and PNG/JPEG encoding rather than file creation.

## Rating Data

Ratings are automatically saved to browser/WebView local storage. The JSON controls can save a portable ratings file or import an existing one. Exported cards contain presentation data only and omit editing controls.

## Data and Artwork

Student data, portraits, icons, and game-related UI assets are requested from [SchaleDB](https://schaledb.com). BAART does not redistribute those assets in this repository.

## Disclaimer

BAART is an unofficial fan-made tool. It is not affiliated with or endorsed by Nexon Games, Yostar, or SchaleDB. Blue Archive and its associated assets belong to their respective owners.

## License

The application source code is available under the [MIT License](LICENSE). This license does not apply to third-party game data or artwork.
