# Mahee Motion Agent Rules

## Product Goal

Build Mahee Motion as a performant Windows desktop video editor with a Tauri 2 native shell, Rust media backend, and React + TypeScript frontend. The MVP must be functional, visually close to the supplied dark editor reference, and structured for future AI tools, templates, transitions, background removal, motion blur, color tools, and stock media.

## Architecture Conventions

- Keep the app performant on mid-range Windows PCs.
- Never block the UI thread with media processing.
- Use typed data models for project, track, clip, asset, timeline, and export state.
- Keep UI components modular and scoped to clear feature areas.
- Keep FFmpeg operations isolated in backend/service modules.
- Frontend UI must call typed Tauri commands instead of shelling out directly.
- Keep timeline math in testable utilities/services.
- Keep large binary data out of React state; store paths, metadata, thumbnails, waveform summaries, and object URLs only when needed.
- Prefer incremental functionality over giant untested rewrites.

## UI Rules

- Match the provided Mahee Motion reference as closely as practical: dark panels, blue accent, top bar, left sidebar, media panel, central preview, right inspector, and bottom multi-track timeline.
- Every visible MVP feature must either work or be clearly disabled with a "Coming soon" tooltip.
- Do not leave broken buttons or dead UI.
- Use clear loading, empty, disabled, error, and save/export states.

## Performance Requirements

- Run FFmpeg, ffprobe, thumbnail generation, waveform extraction, and export in Rust/Tauri commands.
- Use async commands and progress events for long-running work.
- Cache thumbnails and waveform data in app cache paths.
- Debounce expensive timeline updates.
- Use requestAnimationFrame for playback/playhead movement.
- Memoize timeline clip rendering and avoid unnecessary React re-renders.
- Release video object URLs when no longer needed.
- Keep preview resolution adaptive and structure the renderer for future proxy media.

## Testing Requirements

- Add tests for time conversion, clip split/trim, project serialization, and timeline math where practical.
- Run these checks before final response:
  - `npm install`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
  - `npm run tauri build`
- If a command fails because of an environment limitation, fix it if feasible. Otherwise document the exact reason and the remaining local command.

## Acceptance Criteria

- The app launches successfully in development mode.
- The UI closely follows the reference image and uses the Mahee Motion brand.
- Import supports common video, audio, and image files.
- Imported media appears with metadata and thumbnails where possible.
- Media can be added to a multi-track timeline.
- Clips can be selected, moved, trimmed, split, and deleted.
- The playhead, ruler, zoom, and basic preview playback work.
- Inspector values update selected clip state.
- Text clips can be added and previewed.
- Project JSON save, open, and autosave work.
- Export to `.mp4` works for a basic sequential timeline.
- The UI remains responsive during import/export.
- README documents setup, development, build, packaging, dependencies, and MVP limitations.
