# BAART

[English](README.md) | [简体中文](README.zh-CN.md)

**BAART** is the **Blue Archive Arena Rating Tool**, an unofficial desktop application for recording, comparing, and sharing PvP evaluations of Blue Archive students.

It loads student information from [SchaleDB](https://schaledb.com), combines five user-assigned rating dimensions into an overall score, and exports compact or full-size rating cards as SVG and PNG images.

## Features

- Search students using localized SchaleDB data.
- Display role, attack and armor types, weapon, range, cover behavior, equipment, and terrain adaptation.
- Rate five arena-focused dimensions from S to E.
- Calculate or manually override a five-level overall rating, with independent none/half/full weights for every dimension.
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

Video Studio loads ratings from local storage or imported rating JSON. A `.baart-video.json` project manifest snapshots normalized ratings, resolved student metadata, manual ordering, language, theme, timing, effects, resolution, and output settings for reproducible renders. Students can be sorted chronologically, by ID, by school, or by drag-and-drop manual order.

MP4 and lossless PNG sequences support 720p, 1080p, and 4K output. PNG frames are rendered directly from the React composition with Remotion's [`renderFrames()`](https://www.remotion.dev/docs/renderer/render-frames) API and are never extracted from an encoded video. This is the server-side equivalent of Remotion's documented [`--sequence`](https://www.remotion.dev/docs/cli/render#--sequence) CLI mode. MP4 output uses `renderMedia()`. Generated files are written under the ignored `video-output/` directory. The first render may download Remotion's compatible Chrome for Testing build.

Render a saved project without the dashboard:

```powershell
npm run video:render -- path\to\project.baart-video.json
```

The packaged Tauri application can preview and edit Video Studio projects. Node-based rendering requires the localhost development service to be running.

## Rating Data

Ratings are automatically saved to browser/WebView local storage. The JSON controls can save a portable ratings file or import an existing one. Exported cards contain presentation data only and omit editing controls.

## Data and Artwork

Student data, portraits, icons, and game-related UI assets are requested from [SchaleDB](https://schaledb.com). BAART does not redistribute those assets in this repository.

## Disclaimer

BAART is an unofficial fan-made tool. It is not affiliated with or endorsed by Nexon Games, Yostar, or SchaleDB. Blue Archive and its associated assets belong to their respective owners.

## License

The application source code is available under the [MIT License](LICENSE). This license does not apply to third-party game data or artwork.
