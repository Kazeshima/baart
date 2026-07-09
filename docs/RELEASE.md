# Release Workflow

[README](../README.md)

BAART releases are built from `main` after CI passes.

## Local Release Checks

```powershell
npm test
npm run build
npm run video:compositions
npm run video:smoke
npm run renderer:smoke
cargo test
cargo check
npm run tauri build
git diff --check
```

Visual checks before tagging:

- Render the first and final video frames.
- Confirm final video frame is fully dark.
- Confirm quality-mode comment scrolling fades at both top and bottom.
- Export English and Chinese cards using the Hoshino rating from `test_data/ba_pvp_ratings_jiugu.json`.
- Inspect compact/full PNG/SVG cards for clipping, overlap, school icons, and portrait/avatar scaling.

## GitHub Release

The release workflow runs on `v*` tags and manual dispatch. It builds Windows x64 Tauri artifacts and uploads them to GitHub Releases.

Portable downloads must be ZIP bundles, not a raw copied `baart.exe`. The compact portable ZIP should expose `baart.exe`, `baart-node.exe`, and `renderer-runtime.zip`; Video Studio extracts the renderer archive to the app cache on first render. Do not expose the full `renderer/` tree in the portable download unless debugging a packaging failure.

For a new patch release:

```powershell
git checkout main
git tag v1.1.x
git push origin v1.1.x
```

The workflow prepares school icons and renderer runtime assets before building. The generated assets are included in the release artifacts, but generated caches and local test data remain untracked.

## Attribution

BAART source code is MIT licensed. Third-party Blue Archive and SchaleDB data/artwork included in generated examples or release assets remains owned by its respective owners.
