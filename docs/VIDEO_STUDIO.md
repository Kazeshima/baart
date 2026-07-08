# BAART Video Studio

[README](../README.md) | [简体中文 README](../README.zh-CN.md)

Video Studio renders every rated student as a 16:9 arena guide sequence. It uses the same rating data, score weights, localized student metadata, type/terrain indicators, overall badge data, and radar presentation as the main BAART editor.

## Preview

```powershell
npm run video:preview
```

The preview page loads ratings from BAART local storage or an imported JSON/project manifest. It supports dark/light themes, English/Simplified Chinese UI, 720p/1080p/4K targets, MP4 output, PNG sequences, and JPEG sequences.

## Animation Flow

Each student receives the same frame count. The default is 12 seconds per student at 30 FPS:

1. Background and portrait fade in.
2. Student identity, school icon, type/cover indicators, terrain, and comments enter as separate blocks.
3. Radar axes scan clockwise.
4. Dimension points fade in at their final positions after the scan reaches each axis.
5. S/A dimension points emit ripple emphasis.
6. The polygon and overall rating appear.
7. The scene holds, scrolls long comments if needed, and fades out to a fully dark final frame.

Quality mode uses a two-edge comment mask so scrolling text fades at the top and bottom. Balanced and Fast modes reduce heavier visual effects for better render throughput.

## Ordering

The editor and Video Studio share the same rated-student ordering settings:

- Chronological
- Overall score
- Student ID
- School
- Manual drag order

Video project manifests snapshot the order for reproducible renders.

## Score Weights

BAART defaults to shared weights for all students. Fine percentage mode uses five fixed 0-100 gauges plus an unassigned weight budget. Rendering and exports are blocked until all weight is assigned. Preset mode restores the old none/half/full weight model.

Individual mode remains available for per-student exceptions.

