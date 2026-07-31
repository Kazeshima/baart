# BAART Video Studio

[README](../README.md) | [简体中文 README](../README.zh-CN.md)

Video Studio renders every rated student as a 16:9 arena guide sequence. It uses the same rating data, score weights, localized student metadata, type/terrain indicators, overall badge data, and radar presentation as the main BAART editor.

## Preview

```powershell
npm run video:preview
```

The preview page loads ratings from BAART local storage or an imported JSON/project manifest. It supports dark/light themes, English/Simplified Chinese UI, 720p/1080p/4K targets, MP4 output, PNG sequences, JPEG sequences, and modular transparent production assets.

## Production Assets

Switch **Render mode** to **Production assets** when BAART graphics will be composited with gameplay in DaVinci Resolve, Blender, or another editor. This mode reuses the same deterministic student timeline but renders one student and one visual layer at a time on a transparent canvas.

Available layers are:

- Background decorations
- Student portrait
- Student identity and specs
- Scrolling comments
- Animated radar plot and score-weight footnote
- Overall rating

Use the student and layer checkboxes to choose the render matrix. Preview student/layer selectors inspect one isolated module before rendering. Every layer also has independent X/Y offset, scale, and opacity controls; the normal timing, radar, comment, theme, language, FPS, resolution, and quality controls remain active.

All selected outputs have identical canvas dimensions, FPS, and per-student duration, so they align when placed at the same timeline origin. The output tree contains one folder per student and one subfolder per layer, plus `production-assets.json` with relative paths and synchronization metadata.

Choose **Transparent PNG sequence** for lossless RGBA frames and broad editor compatibility. Choose **Transparent ProRes 4444 MOV** for one alpha-video file per layer. H.264 MP4 and JPEG are intentionally unavailable in this mode because they do not preserve the required alpha channel.

## Animation Flow

Each student receives the same frame count. The default is 12 seconds per student at 30 FPS:

1. Background and portrait fade in.
2. Student identity, school icon, type/cover indicators, terrain, and comments enter as separate blocks.
3. Radar axes scan clockwise.
4. Dimension points fade in at their final positions after the scan reaches each axis.
5. S/A/B/C/D dimension points emit tier-scaled ripple emphasis; S is strongest, D is deliberately subtle, and E has no ripple.
6. The polygon and overall rating appear.
7. The scene holds, scrolls long comments if needed, and fades out to a fully dark final frame.

Quality mode uses a two-edge comment mask so scrolling text fades at the top and bottom. Balanced and Fast modes reduce heavier visual effects for better render throughput.

### Radar controls

The radar sweep is deterministic and frame-driven. Video Studio exposes the sweep duration, post-scan decay duration, beam color, beam intensity, afterglow opacity and angular trail, plus the tapered beam's center and edge widths. The scan remains at its final angle while the beam and afterglow ease out, then the result polygon appears.

Ripple count, duration, scale, and opacity are global maximums. BAART applies a tier profile to those maximums so S, A, B, C, and D remain visually ordered without requiring separate controls for every tier.

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

