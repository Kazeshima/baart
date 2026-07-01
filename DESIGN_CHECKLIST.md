# BA PvP Rating Tool Design Checklist

This document tracks the requested feature targets and the current implementation status.

## Student Search And Data

- Search students by localized name, dev name, or unique ID.
- Load student records from SchaleDB language data.
- Show selected student identity: name, dev name, unique ID, school-derived data when available.

## Basic Student Info

- Show large student portrait in the main editor without cropping the tall portrait into a tiny box.
- Show attack type and armor type with color-coded badges.
- Show squad/role, weapon type, shooting range, position, and cover usage.
- Show equipment slots, including unique equipment when present.
- Show Street/Outdoor/Indoor terrain icons with adaptation level icons and numeric level.
- Highlight the selected arena terrain.
- Preserve UE50 terrain upgrade information from SchaleDB `Weapon.AdaptationType` and `Weapon.AdaptationValue`, showing base level and upgraded level when different.
- Allow user-editable arena season label such as `S9`; include it in the title and exports.

## PvP Ratings

- Rate five dimensions: 盲打威力, 进攻对策性, 通防强度, 特防对策性, 造价.
- Use S/A/B/C/D/E only for dimension ratings, mapped internally to 5/4/3/2/1/0.
- Render a radar chart with enough padding for Chinese labels.
- Autosave rating changes to localStorage.

## Overall Rating

- Overall rating uses five labels, not S/A/B/C/D/E.
- Chinese labels: 拉完了, NPC, 人上人, 顶级, 夯.
- English labels: Loser, NPC, Normie+, Alpha, Gigachad.
- Automatic overall rating averages dimensions into five score intervals: 0-1, 1-2, 2-3, 3-4, 4-5.
- Cost weighting options: exclude 造价, half weight, full weight.
- Manual overall override remains available.

## Localization

- UI localization is separated into `src/utils/i18n.js`.
- Student data language and UI language are separate controls.
- Type, role, weapon, and app UI labels avoid hardcoded Japanese defaults.

## Save, Import, Export

- Ratings can be saved to a JSON file in the app data directory through Tauri.
- Ratings can be loaded back from the saved JSON file.
- Browser/Vite mode keeps a download fallback for JSON.
- Compact SVG export uses the square student icon, includes arena season in the title, and keeps a dense PvP summary layout.
- Full SVG export uses the tall student portrait, includes a prominent overall rating block, and uses the remaining space for radar/info.
- Exported cards contain reader-facing results only; editor controls are not included.
