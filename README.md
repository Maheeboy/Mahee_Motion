# Mahee Motion

Mahee Motion is a Windows desktop video editor built with Tauri 2, Rust media commands, React, TypeScript, Vite, and Zustand. The UI follows a dark professional creator-editor layout: top project/export bar, left feature rail, media bin, central preview, right inspector, and bottom multi-track timeline.

## Current MVP Features

- Import local `.mp4`, `.mov`, `.mkv`, `.webm`, `.mp3`, `.wav`, `.aac`, `.flac`, `.png`, `.jpg`, `.jpeg`, and `.webp` files.
- Probe media asynchronously through Rust/Tauri using `ffprobe`.
- Generate cached video/image thumbnails through `ffmpeg`.
- Organize media with search, folders/type filters, sorting, grid/list views, metadata, drag/drop import, and import errors.
- Add media to the timeline by double-click, plus button, or drag/drop onto compatible tracks.
- Versioned non-destructive project schema with project settings, assets, track-owned clips, selected clip ids, and migration from the original v1 JSON shape.
- Multi-track timeline with video, overlay, audio, and text tracks.
- Select, move, trim, split, duplicate, and delete clips.
- Track lock, mute, and visibility controls.
- Command-based undo/redo for editor changes.
- Timeline playhead, ruler, zoom, click/drag seek, keyboard shortcuts, thumbnail strips, and waveform placeholders.
- Preview follows the timeline playhead, honors hidden tracks/clips, shows active video/image media, and renders text overlays.
- Contextual inspector for project settings, transform, audio, speed, and text styling.
- Save and load Mahee Motion project JSON.
- Export an MVP H.264 `.mp4` render plan with preflight warnings for unsupported timeline parts.

## Architecture Overview

- Frontend state lives in a Zustand editor store with project/media/timeline/selection/preview/export/ui/history-style slices.
- Timeline truth is stored in seconds, not pixels. Pixels are only used for rendering.
- Project files use schema version `2`:
  - `Project.settings` stores resolution, FPS, and sample rate.
  - `Timeline.tracks[]` owns ordered `TimelineClip[]` arrays.
  - `Timeline.selectedClipIds` stores clip selection.
  - `MediaAsset` stores paths and metadata, not binary data.
- Timeline logic is centralized in `src/utils/timeline.ts`, including time math, snapping, active clips, compatibility, migration, export planning, and non-destructive edit operations.
- Rust/Tauri commands isolate media probing, thumbnail generation, project file IO, and FFmpeg export.

## System Dependencies

Required on Windows:

- Node.js 20+
- Rust + Cargo
- Microsoft Visual C++ Build Tools
- Microsoft Edge WebView2 Runtime
- FFmpeg and FFprobe on `PATH`

Optional overrides:

```powershell
$env:MAHEE_FFMPEG = "C:\path\to\ffmpeg.exe"
$env:MAHEE_FFPROBE = "C:\path\to\ffprobe.exe"
```

## Development

```powershell
npm install
npm run tauri:dev
```

If the current terminal was open before installing Rust, refresh PATH first:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + (Join-Path $env:USERPROFILE '.cargo\bin')
```

## Verification

```powershell
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## Windows Packaging

Close any running `mahee-motion.exe` before packaging, otherwise Cargo cannot overwrite the release executable.

```powershell
$env:CARGO_HTTP_CHECK_REVOKE='false'
npm run tauri:build
```

The standalone application executable is generated at:

```txt
src-tauri\target\release\mahee-motion.exe
```

The NSIS installer is generated under:

```txt
src-tauri\target\release\bundle\nsis\
```

## Export

The current exporter supports the reliable MVP path:

- Visible sequential video clips.
- Source trimming with `sourceIn` and clip duration.
- H.264 MP4 output at 720p or 1080p.
- Source audio from video clips unless the clip/track is muted.
- Progress events and user-visible errors.

Before export, the app warns about timeline items the MVP renderer does not yet burn in.

## Current MVP Limitations

- Text overlays are visible in preview but are not burned into exported MP4s yet.
- Audio-only tracks are visible and editable but are not mixed into exported MP4s yet.
- Multi-layer compositing, transitions, filters, crop, background removal, motion blur, color match, keyframes, stock media, templates, and AI tools are staged as disabled or structured future features.
- Waveforms use lightweight preview data/placeholders instead of full cached waveform files.
- Very large media libraries are not virtualized yet.

## Keyboard Shortcuts

- `Space`: play/pause
- `Ctrl+Z`: undo
- `Ctrl+Y` or `Ctrl+Shift+Z`: redo
- `S`: split selected clip at playhead
- `Delete` or `Backspace`: delete selected clips
- `Ctrl+D`: duplicate selected clips
- `Ctrl+S`: save project
- `Ctrl+O`: open project
- `Ctrl+E`: export
- `+` / `-`: zoom timeline
- `Arrow Left/Right`: nudge playhead one frame
- `Shift + Arrow Left/Right`: nudge playhead ten frames

## Recommended Next Features

- Rust export compositor for text overlays, image overlays, and multi-track video layers.
- Real audio mixing for audio-only tracks with clip and track volume.
- Cached waveform extraction.
- Track context menus and clip context menus.
- Resizable panels and larger-project virtualization.
- Crop, color, transition, and keyframe editors.
