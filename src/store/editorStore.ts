import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  AudioSettings,
  AspectRatioPreset,
  BackgroundRemovalSettings,
  ColorGrade,
  ColorSettings,
  CropSettings,
  EditCommand,
  EffectInstance,
  EffectParamValue,
  ExportSettings,
  MaskInstance,
  MaskType,
  MediaAsset,
  Project,
  TextAnimation,
  TextAnimationSide,
  TextSettings,
  TimelineClip,
  TransitionInstance,
  VideoAnimationSide,
  VideoClipAnimation,
  TrackType,
  Transform
} from "../types/editor";
import {
  addExtractedAudioClip,
  addClipToTimeline,
  addTimelineMarker,
  addTrack,
  buildExportPlan,
  centerTransform,
  canCreateCompoundClip,
  canExtractAudioFromClip,
  canUncompoundClip,
  createClip,
  createCompoundClipFromSelection,
  createProject,
  defaultAudioSettings,
  defaultTextSettings,
  defaultTransform,
  duplicateSelectedClips,
  evaluateAudioAtTime,
  evaluateColorAtTime,
  evaluateSpeedAtTime,
  evaluateTransformAtTime,
  finalizeProject,
  findClip,
  findTrack,
  getSnapTargets,
  hasKeyframeAtTime,
  migrateProject,
  moveClip,
  normalizeTextSettings,
  parseProject,
  removeClipKeyframe,
  removeClips,
  removeTimelineMarker,
  resetTransformForTimeline,
  serializeProject,
  setSelectedClips,
  setClipSpeed,
  scaleTransformToFit,
  snapTime,
  splitClipInTimeline,
  trackForAsset,
  trimClipInTimeline,
  uncompoundClip,
  updateClip,
  updateTrack,
  upsertAudioKeyframe,
  upsertColorKeyframe,
  upsertSpeedKeyframe,
  upsertTransformKeyframe
} from "../utils/timeline";
import { clamp, framesToSeconds, secondsToFrames } from "../utils/time";
import { normalizeColorSettings } from "../utils/colorGrade";
import type { TextFontOption } from "../utils/textFonts";
import { applyTextFont } from "../utils/textFonts";
import { createEffectFromPreset, normalizeEffect, normalizeEffects } from "../utils/effects";
import { defaultMask, evaluateMaskAtTime, isVisualMaskClip, normalizeMask, normalizeMasks, removeMaskKeyframe, upsertMaskKeyframe, updateMask } from "../utils/masks";
import { applyTextAnimationPreset, defaultTextClipAnimations, inTextAnimationPresets, normalizeTextAnimation, normalizeTextClipAnimations, outTextAnimationPresets } from "../utils/textAnimations";
import { applyVideoAnimationPreset, defaultVideoClipAnimations, inVideoAnimationPresets, normalizeVideoAnimation, normalizeVideoClipAnimations, outVideoAnimationPresets } from "../utils/videoAnimations";
import type { StickerPreset } from "../utils/stickers";
import { filterPresetById } from "../utils/filters";
import { textStylePresetById } from "../utils/textStylePresets";
import { applyModeDefaults, normalizeBackgroundRemovalSettings } from "../utils/backgroundRemoval";
import { createTransition, normalizeTransition, transitionDefinition, transitionDropZone } from "../utils/transitions";

type ToastKind = "info" | "success" | "error";
type MediaFilter = "all" | "video" | "audio" | "image" | "text" | "effects";
type MediaSort = "name" | "date" | "type" | "duration";
type MediaView = "grid" | "list";
export type TimelineTool = "crop";
type TextPreset = "title" | "subtitle" | "lower-third" | "caption";
type TransformAction = "fit" | "fill" | "center" | "reset";
type ExportAspectPreset = AspectRatioPreset;
type ExportResolutionPreset = "720p" | "1080p";
const MIN_MEDIA_TRIM_DURATION = 0.25;
type ClipKeyframeKind = "transform" | "audio" | "speed" | "color";

type ClipPropertyClipboard = Partial<Pick<TimelineClip, "transform" | "audio" | "text" | "textAnimations" | "videoAnimations" | "crop" | "colorAdjustments" | "effects" | "masks" | "backgroundRemoval" | "speed" | "playbackRate" | "keyframes">>;

interface ProbeResult {
  id: string;
  path: string;
  name: string;
  mediaType: "video" | "audio" | "image" | "unknown";
  duration: number;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  thumbnailPath?: string;
  waveform: number[];
}

interface ExtractedAudioResult {
  path: string;
}

function probeResultToAsset(result: ProbeResult): MediaAsset {
  return {
    id: result.id,
    path: result.path,
    name: result.name,
    type: result.mediaType === "audio" ? "audio" : result.mediaType === "image" ? "image" : "video",
    duration: result.duration,
    width: result.width,
    height: result.height,
    fps: result.frameRate,
    sampleRate: result.sampleRate,
    channels: result.channels,
    thumbnailPath: result.thumbnailPath,
    waveformPeaks: result.waveform,
    importedAt: new Date().toISOString()
  };
}

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface EditorStore {
  project: Project;
  activePanel: string;
  selectedAssetId?: string;
  previewAssetId?: string;
  isPlaying: boolean;
  saveStatus: string;
  currentProjectPath?: string;
  lastManualSaveAt?: string;
  lastAutosavedAt?: string;
  exportProgress?: { progress: number; message: string };
  exportWarnings: string[];
  toasts: Toast[];
  history: { past: EditCommand[]; future: EditCommand[] };
  mediaUi: { filter: MediaFilter; sort: MediaSort; view: MediaView };
  timelineUi: { snapping: boolean };
  clipPropertyClipboard?: ClipPropertyClipboard;
  transitionClipboard?: TransitionInstance;
  previewUi: { safeZones: boolean; alignmentGuides: boolean; effectsBypassed: boolean };
  setActivePanel: (panel: string) => void;
  setMediaFilter: (filter: MediaFilter) => void;
  setMediaSort: (sort: MediaSort) => void;
  setMediaView: (view: MediaView) => void;
  toggleTimelineSnapping: () => void;
  addToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
  executeCommand: (label: string, producer: (project: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  setProject: (project: Project) => void;
  updateProjectName: (name: string) => void;
  setCurrentProjectPath: (path?: string) => void;
  markManualSave: (path?: string) => void;
  markAutosaved: () => void;
  loadProjectJson: (json: string) => void;
  projectJson: () => string;
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (assetId: string) => void;
  updateAssetTrim: (assetId: string, trim: { trimIn: number; trimOut: number }) => void;
  selectAsset: (assetId?: string) => void;
  previewAsset: (assetId?: string) => void;
  selectClip: (clipId?: string, append?: boolean) => void;
  selectClips: (clipIds: string[], append?: boolean) => void;
  clearSelection: () => void;
  addAssetToTimeline: (assetId: string, start?: number, trackId?: string) => void;
  addAssetRangeToTimeline: (assetId: string, trimIn: number, trimOut: number, start?: number, trackId?: string) => void;
  addTextClip: () => void;
  addTextClipWithFont: (font: TextFontOption) => void;
  addTextStylePresetToTimeline: (presetId: string, start?: number, trackId?: string) => void;
  addStickerToTimeline: (sticker: StickerPreset, start?: number, trackId?: string) => void;
  moveClip: (clipId: string, start: number, trackId?: string, snap?: boolean) => void;
  trimClipBy: (clipId: string, side: "start" | "end", delta: number) => void;
  splitSelected: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  createCompoundFromSelected: () => void;
  uncompoundClip: (clipId: string) => void;
  extractAudioFromClip: (clipId: string) => Promise<void>;
  copySelectedClipProperties: () => void;
  pasteClipProperties: () => void;
  addTransitionToTimeline: (type: string, trackId?: string, time?: number) => void;
  selectTransition: (transitionId?: string) => void;
  updateSelectedTransition: (patch: Partial<TransitionInstance>) => void;
  removeSelectedTransition: () => void;
  replaceSelectedTransition: (type: string) => void;
  copySelectedTransition: () => void;
  pasteTransitionSettings: () => void;
  addTimelineTrack: (type?: TrackType) => void;
  addTextPreset: (preset: TextPreset) => void;
  applyTransformAction: (action: TransformAction) => void;
  applySpeedPreset: (speed: number) => void;
  addMarker: (time?: number) => void;
  removeMarker: (markerId: string) => void;
  toggleSafeZones: () => void;
  toggleAlignmentGuides: () => void;
  toggleEffectsBypass: () => void;
  applyColorFilterPresetToSelected: (presetId: string, start?: number, trackId?: string) => void;
  addEffectPresetToSelected: (presetId: string, start?: number, trackId?: string) => void;
  removeSelectedEffect: (effectId: string) => void;
  toggleSelectedEffect: (effectId: string) => void;
  resetSelectedEffect: (effectId: string) => void;
  updateSelectedEffect: (effectId: string, patch: Partial<Pick<EffectInstance, "intensity" | "startTime" | "duration">> & { params?: Record<string, EffectParamValue> }) => void;
  moveSelectedEffect: (effectId: string, direction: -1 | 1) => void;
  copySelectedEffects: () => void;
  pasteEffectsToSelected: () => void;
  addMaskToSelected: (type: MaskType) => void;
  updateSelectedMask: (maskId: string, patch: Partial<MaskInstance>) => void;
  removeSelectedMask: (maskId: string) => void;
  duplicateSelectedMask: (maskId: string) => void;
  moveSelectedMask: (maskId: string, direction: -1 | 1) => void;
  copySelectedMasks: () => void;
  pasteMasksToSelected: () => void;
  addSelectedMaskKeyframe: (maskId: string) => void;
  removeSelectedMaskKeyframe: (maskId: string, keyframeId: string) => void;
  setClipMaskTransient: (clipId: string, maskId: string, patch: Partial<MaskInstance>) => void;
  updateSelectedBackgroundRemoval: (patch: Partial<BackgroundRemovalSettings>) => void;
  applyExportAspectPreset: (preset: ExportAspectPreset, dimensions?: { width: number; height: number }) => void;
  applyExportResolutionPreset: (preset: ExportResolutionPreset) => void;
  applyTimelineTool: (tool: TimelineTool) => void;
  toggleTrackHidden: (trackId: string) => void;
  toggleTrackMuted: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
  setPlayhead: (time: number) => void;
  stepPlayhead: (frames: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  updateSelectedTransform: (patch: Partial<Transform>) => void;
  setClipTransformTransient: (clipId: string, patch: Partial<Transform>) => void;
  updateSelectedColor: (patch: Partial<ColorGrade>) => void;
  updateSelectedAudio: (patch: Partial<AudioSettings>) => void;
  addSelectedTransformKeyframe: () => void;
  addSelectedAudioKeyframe: () => void;
  addSelectedSpeedKeyframe: () => void;
  addSelectedColorKeyframe: () => void;
  moveSelectedKeyframe: (kind: ClipKeyframeKind, keyframeId: string, time: number) => void;
  moveSelectedMaskKeyframe: (maskId: string, keyframeId: string, time: number) => void;
  removeSelectedKeyframe: (kind: ClipKeyframeKind, keyframeId: string) => void;
  updateSelectedSpeed: (speed: number) => void;
  updateSelectedText: (patch: Partial<TextSettings>) => void;
  updateSelectedTextAnimation: (side: TextAnimationSide, patch: Partial<TextAnimation>) => void;
  applySelectedTextAnimationPreset: (side: TextAnimationSide, presetId: string) => void;
  resetSelectedTextAnimation: (side: TextAnimationSide) => void;
  updateSelectedVideoAnimation: (side: VideoAnimationSide, patch: Partial<VideoClipAnimation>) => void;
  applySelectedVideoAnimationPreset: (side: VideoAnimationSide, presetId: string) => void;
  resetSelectedVideoAnimation: (side: VideoAnimationSide) => void;
  updateProjectSettings: (patch: Partial<Project["settings"]>) => void;
  updateExportSettings: (patch: Partial<ExportSettings>) => void;
  refreshExportWarnings: () => void;
  setSaveStatus: (status: string) => void;
  setExportProgress: (progress?: { progress: number; message: string }) => void;
  updateSelectedCrop: (patch: Partial<CropSettings> | undefined) => void;
}

const historyLimit = 80;

function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "updatedAt").map(([key, item]) => [key, withoutTimestamps(item)]));
  }
  return value;
}

function projectsEqual(left: Project, right: Project): boolean {
  return JSON.stringify(withoutTimestamps(left)) === JSON.stringify(withoutTimestamps(right));
}

function selectedIds(project: Project): string[] {
  return project.timeline.selectedClipIds;
}

function firstSelectedClip(project: Project): TimelineClip | undefined {
  const [id] = selectedIds(project);
  return id ? findClip(project.timeline, id) : undefined;
}

function withSelectedClip(project: Project, updater: (clip: TimelineClip) => Partial<TimelineClip>): Project {
  const clip = firstSelectedClip(project);
  if (!clip) return project;
  return {
    ...project,
    timeline: updateClip(project.timeline, clip.id, updater(clip))
  };
}

const maskAnimationFields = new Set<keyof MaskInstance>([
  "position",
  "width",
  "height",
  "scale",
  "rotation",
  "feather",
  "expansion",
  "opacity",
  "cornerRadius",
  "points"
]);

function patchTouchesMaskAnimation(patch: Partial<MaskInstance>): boolean {
  return Object.keys(patch).some((key) => maskAnimationFields.has(key as keyof MaskInstance));
}

function updateMaskForPlayhead(mask: MaskInstance, clip: TimelineClip, patch: Partial<MaskInstance>, project: Project): MaskInstance {
  const base = updateMask(mask, patch, project.timeline);
  if (!mask.keyframes.length || !patchTouchesMaskAnimation(patch)) return base;
  const evaluated = evaluateMaskAtTime(mask, clip, project.timeline.playhead);
  const animated = updateMask({ ...evaluated, keyframes: mask.keyframes }, patch, project.timeline);
  return upsertMaskKeyframe({ ...animated, keyframes: mask.keyframes }, clip, project.timeline.playhead, project.timeline);
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameTransitionAttachment(left: TransitionInstance, right: TransitionInstance): boolean {
  return left.placement === right.placement
    && left.leftClipId === right.leftClipId
    && left.rightClipId === right.rightClipId;
}

function mergeColorGrade(base: ColorSettings | undefined, patch: Partial<ColorGrade>): ColorGrade {
  const current = normalizeColorSettings(base);
  return normalizeColorSettings({
    ...current,
    ...patch,
    basic: patch.basic ? { ...current.basic, ...patch.basic } : current.basic,
    lut: patch.lut ? { ...current.lut, ...patch.lut } : current.lut,
    hsl: patch.hsl ? { ...current.hsl, ...patch.hsl, ranges: patch.hsl.ranges ? { ...current.hsl.ranges, ...patch.hsl.ranges } : current.hsl.ranges } : current.hsl,
    curves: patch.curves ? { ...current.curves, ...patch.curves } : current.curves,
    wheels: patch.wheels ? { ...current.wheels, ...patch.wheels } : current.wheels
  });
}

function scaleCanvasCoordinate(value: number, scale: number): number {
  return Number((value * scale).toFixed(3));
}

const aspectRatios: Partial<Record<ExportAspectPreset, number>> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "2.35:1": 2.35,
  "2:1": 2,
  "1.85:1": 1.85,
  "9:16": 9 / 16,
  "3:4": 3 / 4,
  "5.8-inch": 9 / 19.5,
  "1:1": 1
};

function evenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(Number.isFinite(value) ? value : 2));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function dimensionsForAspect(preset: ExportAspectPreset, height: number, current: { width: number; height: number }, explicit?: { width: number; height: number }) {
  if (explicit) return { width: evenDimension(explicit.width), height: evenDimension(explicit.height) };
  const ratio = aspectRatios[preset] ?? current.width / Math.max(1, current.height);
  return ratio < 1
    ? { width: evenDimension(height), height: evenDimension(height / ratio) }
    : { width: evenDimension(height * ratio), height: evenDimension(height) };
}

function resizeProjectCanvas(project: Project, dimensions: { width: number; height: number }): Project {
  const oldWidth = project.timeline.width || project.settings.width || dimensions.width;
  const oldHeight = project.timeline.height || project.settings.height || dimensions.height;
  if (oldWidth === dimensions.width && oldHeight === dimensions.height) {
    return {
      ...project,
      settings: { ...project.settings, ...dimensions },
      timeline: { ...project.timeline, ...dimensions }
    };
  }

  const scaleX = dimensions.width / oldWidth;
  const scaleY = dimensions.height / oldHeight;
  return {
    ...project,
    settings: { ...project.settings, ...dimensions },
    timeline: {
      ...project.timeline,
      ...dimensions,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.type === "audio") return clip;
          return {
            ...clip,
            transform: clip.transform ? {
              ...clip.transform,
              x: scaleCanvasCoordinate(clip.transform.x, scaleX),
              y: scaleCanvasCoordinate(clip.transform.y, scaleY)
            } : clip.transform,
            keyframes: clip.keyframes?.transform ? {
              ...clip.keyframes,
              transform: clip.keyframes.transform.map((keyframe) => ({
                ...keyframe,
                x: scaleCanvasCoordinate(keyframe.x, scaleX),
                y: scaleCanvasCoordinate(keyframe.y, scaleY)
              }))
            } : clip.keyframes,
            masks: clip.masks ? normalizeMasks(clip.masks, project.timeline).map((mask) => normalizeMask({
              ...mask,
              position: {
                x: scaleCanvasCoordinate(mask.position.x, scaleX),
                y: scaleCanvasCoordinate(mask.position.y, scaleY)
              },
              width: scaleCanvasCoordinate(mask.width, scaleX),
              height: scaleCanvasCoordinate(mask.height, scaleY),
              feather: scaleCanvasCoordinate(mask.feather, Math.max(scaleX, scaleY)),
              expansion: scaleCanvasCoordinate(mask.expansion, Math.max(scaleX, scaleY)),
              points: mask.points?.map((point) => ({
                ...point,
                x: scaleCanvasCoordinate(point.x, scaleX),
                y: scaleCanvasCoordinate(point.y, scaleY)
              })),
              keyframes: mask.keyframes.map((keyframe) => ({
                ...keyframe,
                position: {
                  x: scaleCanvasCoordinate(keyframe.position.x, scaleX),
                  y: scaleCanvasCoordinate(keyframe.position.y, scaleY)
                },
                width: scaleCanvasCoordinate(keyframe.width, scaleX),
                height: scaleCanvasCoordinate(keyframe.height, scaleY),
                feather: scaleCanvasCoordinate(keyframe.feather, Math.max(scaleX, scaleY)),
                expansion: scaleCanvasCoordinate(keyframe.expansion, Math.max(scaleX, scaleY)),
                points: keyframe.points?.map((point) => ({
                  ...point,
                  x: scaleCanvasCoordinate(point.x, scaleX),
                  y: scaleCanvasCoordinate(point.y, scaleY)
                }))
              }))
            }, dimensions)) : clip.masks
          };
        })
      }))
    }
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: createProject(),
  activePanel: "Media",
  isPlaying: false,
  saveStatus: "Saved just now",
  exportWarnings: [],
  toasts: [],
  history: { past: [], future: [] },
  mediaUi: { filter: "all", sort: "name", view: "grid" },
  timelineUi: { snapping: true },
  previewUi: { safeZones: false, alignmentGuides: false, effectsBypassed: false },

  setActivePanel: (activePanel) => set({ activePanel }),
  setMediaFilter: (filter) => set((state) => ({ mediaUi: { ...state.mediaUi, filter } })),
  setMediaSort: (sort) => set((state) => ({ mediaUi: { ...state.mediaUi, sort } })),
  setMediaView: (view) => set((state) => ({ mediaUi: { ...state.mediaUi, view } })),
  toggleTimelineSnapping: () => set((state) => ({ timelineUi: { ...state.timelineUi, snapping: !state.timelineUi.snapping } })),
  addToast: (kind, message) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    if (typeof window !== "undefined") window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  executeCommand: (label, producer) => {
    const before = get().project;
    const after = finalizeProject(producer(before));
    if (projectsEqual(before, after)) return;
    const command: EditCommand = {
      id: crypto.randomUUID(),
      label,
      before,
      after
    };
    set((state) => ({
      project: after,
      saveStatus: "Unsaved changes",
      history: { past: [...state.history.past.slice(-historyLimit + 1), command], future: [] }
    }));
  },
  undo: () => {
    const { history } = get();
    const command = history.past.at(-1);
    if (!command) return;
    set({
      project: command.before,
      history: { past: history.past.slice(0, -1), future: [command, ...history.future] },
      saveStatus: "Unsaved changes"
    });
  },
  redo: () => {
    const { history } = get();
    const command = history.future[0];
    if (!command) return;
    set({
      project: command.after,
      history: { past: [...history.past, command], future: history.future.slice(1) },
      saveStatus: "Unsaved changes"
    });
  },
  setProject: (project) => {
    const next = finalizeProject(migrateProject(project));
    set({ project: next, selectedAssetId: undefined, previewAssetId: undefined, history: { past: [], future: [] }, saveStatus: "Saved just now", exportWarnings: buildExportPlan(next).warnings });
  },
  updateProjectName: (name) => get().executeCommand("Rename project", (project) => ({
    ...project,
    name: name.trim() || "Unknown"
  })),
  setCurrentProjectPath: (currentProjectPath) => set({ currentProjectPath }),
  markManualSave: (currentProjectPath) => set({ currentProjectPath, lastManualSaveAt: new Date().toISOString(), saveStatus: "Saved just now" }),
  markAutosaved: () => set({ lastAutosavedAt: new Date().toISOString() }),
  loadProjectJson: (json) => get().setProject(parseProject(json)),
  projectJson: () => serializeProject(get().project),
  addAsset: (asset) => get().executeCommand("Import media", (project) => ({
    ...project,
    assets: { ...project.assets, [asset.id]: asset }
  })),
  removeAsset: (assetId) => {
    const project = get().project;
    const asset = project.assets[assetId];
    if (!asset) return;
    const inUse = project.timeline.tracks.some((track) => track.clips.some((clip) => clip.assetId === assetId));
    if (inUse) {
      get().addToast("error", "Remove this asset from the timeline before deleting it from Project Media.");
      return;
    }
    get().executeCommand("Delete imported asset", (draft) => {
      const assets = Object.fromEntries(Object.entries(draft.assets).filter(([id]) => id !== assetId));
      return { ...draft, assets };
    });
    set((state) => ({
      selectedAssetId: state.selectedAssetId === assetId ? undefined : state.selectedAssetId,
      previewAssetId: state.previewAssetId === assetId ? undefined : state.previewAssetId
    }));
  },
  updateAssetTrim: (assetId, trim) => {
    const asset = get().project.assets[assetId];
    if (!asset || asset.type === "image") return;
    const duration = Math.max(MIN_MEDIA_TRIM_DURATION, asset.duration ?? 0);
    const trimIn = clamp(Math.min(trim.trimIn, duration - MIN_MEDIA_TRIM_DURATION), 0, duration - MIN_MEDIA_TRIM_DURATION);
    const trimOut = clamp(Math.max(trim.trimOut, trimIn + MIN_MEDIA_TRIM_DURATION), trimIn + MIN_MEDIA_TRIM_DURATION, duration);
    get().executeCommand("Trim imported asset", (project) => ({
      ...project,
      assets: {
        ...project.assets,
        [assetId]: { ...asset, trimIn, trimOut }
      }
    }));
  },
  selectAsset: (selectedAssetId) => set((state) => ({
    selectedAssetId,
    previewAssetId: selectedAssetId,
    project: { ...state.project, timeline: setSelectedClips(state.project.timeline, []) }
  })),
  previewAsset: (previewAssetId) => set({ previewAssetId }),
  selectClip: (clipId, append = false) => set((state) => {
    const current = state.project.timeline.selectedClipIds;
    const nextIds = !clipId
      ? []
      : append
        ? current.includes(clipId) ? current.filter((id) => id !== clipId) : [...current, clipId]
        : [clipId];
    return {
      selectedAssetId: undefined,
      previewAssetId: undefined,
      project: { ...state.project, timeline: setSelectedClips(state.project.timeline, nextIds) }
    };
  }),
  selectClips: (clipIds, append = false) => set((state) => {
    const nextIds = append ? [...new Set([...state.project.timeline.selectedClipIds, ...clipIds])] : clipIds;
    return {
      selectedAssetId: undefined,
      previewAssetId: undefined,
      project: { ...state.project, timeline: setSelectedClips(state.project.timeline, nextIds) }
    };
  }),
  clearSelection: () => set((state) => ({ project: { ...state.project, timeline: setSelectedClips(state.project.timeline, []) }, selectedAssetId: undefined })),
  addAssetToTimeline: (assetId, start, trackId) => {
    const project = get().project;
    const asset = project.assets[assetId];
    if (!asset) return;
    const track = trackId ? findTrack(project.timeline, trackId) : trackForAsset(project.timeline, asset);
    if (!track || track.locked) {
      get().addToast("error", "That track is locked or unavailable.");
      return;
    }
    const type = asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";
    const hasMediaClips = project.timeline.tracks.some((timelineTrack) => timelineTrack.clips.some((clip) => clip.assetId));
    const timelineStart = start ?? (hasMediaClips ? project.timeline.playhead : 0);
    const mediaDuration = Math.max(0, asset.duration ?? 0);
    const trimIn = type === "image" ? 0 : clamp(asset.trimIn ?? 0, 0, Math.max(0, mediaDuration - MIN_MEDIA_TRIM_DURATION));
    const trimOut = type === "image" ? 0 : clamp(asset.trimOut ?? mediaDuration, trimIn + MIN_MEDIA_TRIM_DURATION, Math.max(trimIn + MIN_MEDIA_TRIM_DURATION, mediaDuration));
    const assetRangeDuration = type === "image" ? Math.min(asset.duration || 5, 8) : Math.max(MIN_MEDIA_TRIM_DURATION, trimOut - trimIn);
    const duration = type === "image" ? assetRangeDuration : assetRangeDuration;
    const clip = createClip({
      trackId: track.id,
      assetId,
      type,
      name: asset.name,
      timelineStart,
      duration,
      sourceIn: type === "image" ? 0 : trimIn,
      sourceOut: type === "image" ? duration : trimOut,
      transform: type !== "audio" ? defaultTransform(project.timeline) : undefined,
      audio: type === "audio" || type === "video" ? defaultAudioSettings() : undefined,
      color: type === "audio" ? "#067b78" : type === "image" ? "#245f82" : "#0d6c83"
    });
    get().executeCommand("Add clip", (draft) => ({
      ...draft,
      timeline: addClipToTimeline({ ...draft.timeline, playhead: timelineStart }, clip)
    }));
    set({ selectedAssetId: assetId });
  },
  addAssetRangeToTimeline: (assetId, trimIn, trimOut, start, trackId) => {
    const project = get().project;
    const asset = project.assets[assetId];
    if (!asset) return;
    const track = trackId ? findTrack(project.timeline, trackId) : trackForAsset(project.timeline, asset);
    if (!track || track.locked) {
      get().addToast("error", "That track is locked or unavailable.");
      return;
    }
    const type = asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";
    const hasMediaClips = project.timeline.tracks.some((timelineTrack) => timelineTrack.clips.some((clip) => clip.assetId));
    const timelineStart = start ?? (hasMediaClips ? project.timeline.playhead : 0);
    const mediaDuration = Math.max(0.1, asset.duration ?? 5);
    const sourceIn = type === "image" ? 0 : clamp(trimIn, 0, Math.max(0, mediaDuration - MIN_MEDIA_TRIM_DURATION));
    const sourceOut = type === "image" ? Math.max(MIN_MEDIA_TRIM_DURATION, trimOut) : clamp(trimOut, sourceIn + MIN_MEDIA_TRIM_DURATION, mediaDuration);
    const duration = type === "image" ? sourceOut : Math.max(MIN_MEDIA_TRIM_DURATION, sourceOut - sourceIn);
    const clip = createClip({
      trackId: track.id,
      assetId,
      type,
      name: asset.name,
      timelineStart,
      duration,
      sourceIn,
      sourceOut,
      transform: type !== "audio" ? defaultTransform(project.timeline) : undefined,
      audio: type === "audio" || type === "video" ? defaultAudioSettings() : undefined,
      color: type === "audio" ? "#067b78" : type === "image" ? "#245f82" : "#0d6c83"
    });
    get().executeCommand("Add trimmed clip", (draft) => ({
      ...draft,
      timeline: addClipToTimeline({ ...draft.timeline, playhead: timelineStart }, clip)
    }));
    set({ selectedAssetId: assetId });
  },
  addTextClip: () => {
    const project = get().project;
    const track = project.timeline.tracks.find((item) => !item.locked);
    if (!track) {
      get().addToast("error", "No editable layer is available.");
      return;
    }
    const clip = createClip({
      trackId: track.id,
      type: "text",
      name: "Text",
      timelineStart: project.timeline.playhead,
      duration: 5,
      color: "#9b6a2f",
      text: defaultTextSettings(),
      transform: defaultTransform(project.timeline)
    });
    get().executeCommand("Add text clip", (draft) => ({ ...draft, timeline: addClipToTimeline(draft.timeline, clip) }));
  },
  addTextClipWithFont: (font) => {
    const project = get().project;
    const track = project.timeline.tracks.find((item) => !item.locked);
    if (!track) {
      get().addToast("error", "No editable layer is available.");
      return;
    }
    const text = applyTextFont({ ...defaultTextSettings(), text: font.label }, font);
    const clip = createClip({
      trackId: track.id,
      type: "text",
      name: font.label,
      timelineStart: project.timeline.playhead,
      duration: 5,
      color: "#9b6a2f",
      text,
      transform: defaultTransform(project.timeline)
    });
    get().executeCommand("Add text clip", (draft) => ({ ...draft, timeline: addClipToTimeline(draft.timeline, clip) }));
  },
  addTextStylePresetToTimeline: (presetId, start, trackId) => {
    const preset = textStylePresetById(presetId);
    const project = get().project;
    const track = trackId ? findTrack(project.timeline, trackId) : project.timeline.tracks.find((item) => !item.locked);
    if (!preset) {
      get().addToast("error", "Text preset was not found.");
      return;
    }
    if (!track) {
      get().addToast("error", "No editable layer is available.");
      return;
    }
    const clip = createClip({
      trackId: track.id,
      type: "text",
      name: preset.name,
      timelineStart: start ?? project.timeline.playhead,
      duration: 5,
      color: preset.color,
      text: preset.text,
      transform: preset.transform(project.timeline)
    });
    get().executeCommand(`Add ${preset.name}`, (draft) => ({ ...draft, timeline: addClipToTimeline(draft.timeline, clip) }));
  },
  addStickerToTimeline: (sticker, start, trackId) => {
    const project = get().project;
    const track = trackId ? findTrack(project.timeline, trackId) : project.timeline.tracks.find((item) => !item.locked);
    if (!track) {
      get().addToast("error", "No editable layer is available.");
      return;
    }
    const assetId = `sticker-${sticker.category}-${sticker.id}`;
    const duration = 5;
    const asset: MediaAsset = {
      id: assetId,
      path: sticker.path,
      name: sticker.label,
      type: "image",
      duration,
      width: sticker.width,
      height: sticker.height,
      thumbnailPath: sticker.path,
      importedAt: new Date().toISOString()
    };
    const clip = createClip({
      trackId: track.id,
      assetId,
      type: "image",
      name: sticker.label,
      timelineStart: start ?? project.timeline.playhead,
      duration,
      sourceOut: duration,
      color: "#247a7d",
      stickerAnimation: sticker.animation,
      transform: { ...defaultTransform(project.timeline), scale: 1 }
    });
    get().executeCommand("Add sticker", (draft) => ({
      ...draft,
      assets: { ...draft.assets, [assetId]: draft.assets[assetId] ?? asset },
      timeline: addClipToTimeline(draft.timeline, clip)
    }));
  },
  moveClip: (clipId, start, trackId, useSnap = true) => get().executeCommand("Move clip", (project) => {
    const snapped = useSnap ? snapTime(start, getSnapTargets(project.timeline, clipId)) : Math.max(0, start);
    return { ...project, timeline: moveClip(project.timeline, clipId, snapped, trackId) };
  }),
  trimClipBy: (clipId, side, delta) => get().executeCommand("Trim clip", (project) => ({ ...project, timeline: trimClipInTimeline(project.timeline, clipId, side, delta) })),
  splitSelected: () => {
    const project = get().project;
    const clipId = project.timeline.selectedClipIds[0];
    if (!clipId) return;
    const nextTimeline = splitClipInTimeline(project.timeline, clipId, project.timeline.playhead);
    if (!nextTimeline) {
      get().addToast("info", "Move the playhead inside the selected clip to split.");
      return;
    }
    get().executeCommand("Split clip", (draft) => ({ ...draft, timeline: nextTimeline }));
  },
  deleteSelected: () => {
    const transitionId = get().project.timeline.selectedTransitionId;
    if (transitionId) {
      get().executeCommand("Delete transition", (project) => ({
        ...project,
        timeline: {
          ...project.timeline,
          transitions: (project.timeline.transitions ?? []).filter((transition) => transition.id !== transitionId),
          selectedTransitionId: undefined
        }
      }));
      return;
    }
    const ids = get().project.timeline.selectedClipIds;
    if (!ids.length) return;
    get().executeCommand("Delete clip", (project) => ({ ...project, timeline: removeClips(project.timeline, ids) }));
  },
  duplicateSelected: () => {
    if (!get().project.timeline.selectedClipIds.length) return;
    get().executeCommand("Duplicate clip", (project) => ({ ...project, timeline: duplicateSelectedClips(project.timeline) }));
  },
  createCompoundFromSelected: () => {
    const timeline = get().project.timeline;
    if (!canCreateCompoundClip(timeline)) {
      get().addToast("info", "Select at least two unlocked, non-compound clips.");
      return;
    }
    get().executeCommand("Create compound clip", (project) => ({
      ...project,
      timeline: createCompoundClipFromSelection(project.timeline)
    }));
  },
  uncompoundClip: (clipId) => {
    const timeline = get().project.timeline;
    if (!canUncompoundClip(timeline, clipId)) return;
    get().executeCommand("Uncompound clip", (project) => ({
      ...project,
      timeline: uncompoundClip(project.timeline, clipId)
    }));
  },
  extractAudioFromClip: async (clipId) => {
    const { project } = get();
    const clip = findClip(project.timeline, clipId);
    const asset = clip?.assetId ? project.assets[clip.assetId] : undefined;
    if (!clip || !asset || !canExtractAudioFromClip(project.timeline, project.assets, clipId)) {
      get().addToast("error", "Select an unlocked video clip with audio.");
      return;
    }

    get().addToast("info", "Extracting audio...");
    try {
      const extracted = await invoke<ExtractedAudioResult>("extract_audio_from_video", { path: asset.path, clipName: clip.name });
      const probed = await invoke<ProbeResult>("probe_media", { path: extracted.path });
      if (probed.mediaType !== "audio") throw new Error("The extracted file was not recognized as audio.");
      const audioAsset = probeResultToAsset(probed);
      get().executeCommand("Extract audio", (draft) => ({
        ...draft,
        assets: { ...draft.assets, [audioAsset.id]: audioAsset },
        timeline: addExtractedAudioClip(draft.timeline, draft.assets, clipId, audioAsset)
      }));
      get().addToast("success", "Audio extracted to a separate clip.");
    } catch (error) {
      get().addToast("error", `Audio extraction failed: ${String(error)}`);
    }
  },
  copySelectedClipProperties: () => {
    const clip = firstSelectedClip(get().project);
    if (!clip) {
      get().addToast("error", "Select a clip to copy properties.");
      return;
    }
    set({
      clipPropertyClipboard: {
        transform: clip.transform ? { ...clip.transform } : undefined,
        audio: clip.audio ? { ...clip.audio } : undefined,
        text: clip.text ? { ...clip.text } : undefined,
        textAnimations: clip.textAnimations ? cloneData(normalizeTextClipAnimations(clip.textAnimations)) : undefined,
        videoAnimations: clip.videoAnimations ? cloneData(normalizeVideoClipAnimations(clip.videoAnimations)) : undefined,
        crop: clip.crop ? { ...clip.crop } : undefined,
        colorAdjustments: clip.colorAdjustments ? { ...clip.colorAdjustments } : undefined,
        effects: clip.effects ? cloneData(clip.effects) : undefined,
        masks: clip.masks ? cloneData(clip.masks) : undefined,
        backgroundRemoval: clip.backgroundRemoval ? cloneData(normalizeBackgroundRemovalSettings(clip.backgroundRemoval)) : undefined,
        speed: clip.speed,
        playbackRate: clip.playbackRate,
        keyframes: clip.keyframes ? cloneData(clip.keyframes) : undefined
      }
    });
    get().addToast("success", "Clip properties copied.");
  },
  pasteClipProperties: () => {
    const copied = get().clipPropertyClipboard;
    if (!copied) {
      get().addToast("error", "Copy clip properties first.");
      return;
    }
    get().executeCommand("Paste clip properties", (project) => withSelectedClip(project, (clip) => ({
      transform: clip.type === "audio" ? clip.transform : copied.transform ? { ...copied.transform } : clip.transform,
      audio: clip.type === "audio" || clip.type === "video" ? copied.audio ? { ...defaultAudioSettings(), ...copied.audio } : clip.audio : clip.audio,
      text: clip.type === "text" ? copied.text ? normalizeTextSettings(copied.text) : clip.text : clip.text,
      textAnimations: clip.type === "text" ? copied.textAnimations ? normalizeTextClipAnimations(copied.textAnimations) : clip.textAnimations : clip.textAnimations,
      videoAnimations: clip.type === "video" || clip.type === "image" ? copied.videoAnimations ? normalizeVideoClipAnimations(copied.videoAnimations) : clip.videoAnimations : clip.videoAnimations,
      crop: clip.type === "video" || clip.type === "image" ? copied.crop ? { ...copied.crop } : clip.crop : clip.crop,
      colorAdjustments: clip.type === "video" || clip.type === "image" ? copied.colorAdjustments ? normalizeColorSettings(copied.colorAdjustments) : clip.colorAdjustments : clip.colorAdjustments,
      effects: copied.effects ? cloneData(copied.effects) : clip.effects,
      masks: isVisualMaskClip(clip) && copied.masks ? normalizeMasks(cloneData(copied.masks), project.timeline) : clip.masks,
      backgroundRemoval: (clip.type === "video" || clip.type === "image") && copied.backgroundRemoval ? normalizeBackgroundRemovalSettings(copied.backgroundRemoval) : clip.backgroundRemoval,
      speed: copied.speed ?? clip.speed,
      playbackRate: copied.playbackRate ?? clip.playbackRate,
      keyframes: copied.keyframes ? cloneData(copied.keyframes) : clip.keyframes
    })));
  },
  addTransitionToTimeline: (type, trackId, time) => {
    const project = get().project;
    const definition = transitionDefinition(type);
    const zone = transitionDropZone(project.timeline, trackId, time ?? project.timeline.playhead, definition.defaultDuration);
    if (!zone.valid) {
      get().addToast("error", zone.reason ?? "Drop transitions on a visual cut or clip edge.");
      return;
    }
    const transition = createTransition(type, zone);
    get().executeCommand(`Add ${definition.name}`, (draft) => ({
      ...draft,
      timeline: {
        ...draft.timeline,
        transitions: [...(draft.timeline.transitions ?? []).filter((item) => !sameTransitionAttachment(item, transition)), transition],
        selectedClipIds: [],
        selectedTransitionId: transition.id,
        playhead: zone.time
      }
    }));
  },
  selectTransition: (transitionId) => set((state) => ({
    selectedAssetId: undefined,
    previewAssetId: undefined,
    project: {
      ...state.project,
      timeline: {
        ...state.project.timeline,
        selectedClipIds: [],
        selectedTransitionId: transitionId && (state.project.timeline.transitions ?? []).some((transition) => transition.id === transitionId) ? transitionId : undefined
      }
    }
  })),
  updateSelectedTransition: (patch) => {
    const transitionId = get().project.timeline.selectedTransitionId;
    if (!transitionId) return;
    get().executeCommand("Edit transition", (project) => ({
      ...project,
      timeline: {
        ...project.timeline,
        transitions: (project.timeline.transitions ?? []).map((transition) => transition.id === transitionId ? normalizeTransition({ ...transition, ...patch }) : transition)
      }
    }));
  },
  removeSelectedTransition: () => {
    const transitionId = get().project.timeline.selectedTransitionId;
    if (!transitionId) return;
    get().executeCommand("Remove transition", (project) => ({
      ...project,
      timeline: {
        ...project.timeline,
        transitions: (project.timeline.transitions ?? []).filter((transition) => transition.id !== transitionId),
        selectedTransitionId: undefined
      }
    }));
  },
  replaceSelectedTransition: (type) => {
    const transitionId = get().project.timeline.selectedTransitionId;
    if (!transitionId) return;
    const definition = transitionDefinition(type);
    get().executeCommand(`Replace with ${definition.name}`, (project) => ({
      ...project,
      timeline: {
        ...project.timeline,
        transitions: (project.timeline.transitions ?? []).map((transition) => transition.id === transitionId ? normalizeTransition({
          ...transition,
          type,
          direction: definition.defaultDirection,
          intensity: definition.defaultIntensity ?? transition.intensity,
          softness: definition.defaultSoftness ?? transition.softness,
          blurAmount: definition.defaultBlurAmount ?? transition.blurAmount,
          zoomAmount: definition.defaultZoomAmount ?? transition.zoomAmount,
          rotation: definition.defaultRotation ?? transition.rotation,
          color: definition.defaultColor ?? transition.color
        }) : transition)
      }
    }));
  },
  copySelectedTransition: () => {
    const transitionId = get().project.timeline.selectedTransitionId;
    const transition = (get().project.timeline.transitions ?? []).find((item) => item.id === transitionId);
    if (!transition) {
      get().addToast("error", "Select a transition first.");
      return;
    }
    set({ transitionClipboard: cloneData(transition) });
    get().addToast("success", "Transition settings copied.");
  },
  pasteTransitionSettings: () => {
    const transitionId = get().project.timeline.selectedTransitionId;
    const copied = get().transitionClipboard;
    if (!transitionId || !copied) {
      get().addToast("error", "Copy and select a transition first.");
      return;
    }
    get().executeCommand("Paste transition settings", (project) => ({
      ...project,
      timeline: {
        ...project.timeline,
        transitions: (project.timeline.transitions ?? []).map((transition) => transition.id === transitionId ? normalizeTransition({
          ...copied,
          id: transition.id,
          leftClipId: transition.leftClipId,
          rightClipId: transition.rightClipId,
          placement: transition.placement
        }) : transition)
      }
    }));
  },
  addTimelineTrack: (type = "overlay") => get().executeCommand("Add layer", (project) => ({ ...project, timeline: addTrack(project.timeline, type) })),
  addTextPreset: (preset) => {
    const project = get().project;
    const track = project.timeline.tracks.find((item) => !item.locked);
    if (!track) {
      get().addToast("error", "No editable layer is available.");
      return;
    }
    const base = defaultTextSettings();
    const presets: Record<TextPreset, { name: string; color: string; text: TextSettings; transform: Transform; duration: number }> = {
      title: { name: "Title", color: "#9b6a2f", duration: 5, text: { ...base, text: "Add a Title", fontSize: 86, fontWeight: 900, align: "center", background: "transparent" }, transform: { ...defaultTransform(project.timeline), y: project.timeline.height * 0.42 } },
      subtitle: { name: "Subtitle", color: "#805f2c", duration: 5, text: { ...base, text: "Subtitle text", fontSize: 44, fontWeight: 750, align: "center", background: "transparent" }, transform: { ...defaultTransform(project.timeline), y: project.timeline.height * 0.72 } },
      "lower-third": { name: "Lower Third", color: "#7b5528", duration: 5, text: { ...base, text: "Name / Detail", fontSize: 38, fontWeight: 800, align: "left", background: "#000000" }, transform: { ...defaultTransform(project.timeline), x: project.timeline.width * 0.32, y: project.timeline.height * 0.78 } },
      caption: { name: "Caption", color: "#6d542e", duration: 4, text: { ...base, text: "Caption text", fontSize: 34, fontWeight: 700, align: "center", background: "#000000" }, transform: { ...defaultTransform(project.timeline), y: project.timeline.height * 0.88 } }
    };
    const selected = presets[preset];
    const clip = createClip({
      trackId: track.id,
      type: "text",
      name: selected.name,
      timelineStart: project.timeline.playhead,
      duration: selected.duration,
      color: selected.color,
      text: selected.text,
      transform: selected.transform
    });
    get().executeCommand(`Add ${selected.name}`, (draft) => ({ ...draft, timeline: addClipToTimeline(draft.timeline, clip) }));
  },
  applyTransformAction: (action) => get().executeCommand("Transform action", (project) => withSelectedClip(project, (clip) => {
    if (clip.type === "audio") return {};
    const current = clip.transform ?? defaultTransform(project.timeline);
    const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
    if (action === "reset") return { transform: resetTransformForTimeline(project.timeline), keyframes: { ...clip.keyframes, transform: [] } };
    if (action === "center") return { transform: centerTransform(current, project.timeline) };
    return { transform: scaleTransformToFit(current, project.timeline, asset, action) };
  })),
  applySpeedPreset: (speed) => get().updateSelectedSpeed(speed),
  addMarker: (time) => get().executeCommand("Add marker", (project) => ({ ...project, timeline: addTimelineMarker(project.timeline, time ?? project.timeline.playhead) })),
  removeMarker: (markerId) => get().executeCommand("Remove marker", (project) => ({ ...project, timeline: removeTimelineMarker(project.timeline, markerId) })),
  toggleSafeZones: () => set((state) => ({ previewUi: { ...state.previewUi, safeZones: !state.previewUi.safeZones } })),
  toggleAlignmentGuides: () => set((state) => ({ previewUi: { ...state.previewUi, alignmentGuides: !state.previewUi.alignmentGuides } })),
  toggleEffectsBypass: () => set((state) => ({ previewUi: { ...state.previewUi, effectsBypassed: !state.previewUi.effectsBypassed } })),
  applyColorFilterPresetToSelected: (presetId, start, trackId) => {
    const preset = filterPresetById(presetId);
    if (!preset) {
      get().addToast("error", "Filter preset was not found.");
      return;
    }
    get().executeCommand("Add color filter", (project) => {
      const selectedClip = firstSelectedClip(project);
      const selectedTrack = selectedClip ? findTrack(project.timeline, selectedClip.trackId) : undefined;
      const targetTrack = trackId ? findTrack(project.timeline, trackId) : selectedTrack
        ? project.timeline.tracks.find((track) => !track.locked && track.order < selectedTrack.order) ?? selectedTrack
        : project.timeline.tracks.find((track) => !track.locked);
      if (!targetTrack || targetTrack.locked) return project;
      const duration = 5;
      const timelineStart = start ?? project.timeline.playhead;
      const filterClip = createClip({
        trackId: targetTrack.id,
        type: "filter",
        name: preset.name,
        timelineStart,
        duration,
        sourceOut: duration,
        colorAdjustments: normalizeColorSettings(preset.grade),
        color: "#287c8f"
      });
      return { ...project, timeline: addClipToTimeline(project.timeline, filterClip) };
    });
    get().addToast("success", `${preset.name} added as a filter layer.`);
  },
  addEffectPresetToSelected: (presetId, start, trackId) => get().executeCommand("Add effect", (project) => {
    const selectedClip = firstSelectedClip(project);
    const selectedTrack = selectedClip ? findTrack(project.timeline, selectedClip.trackId) : undefined;
    const targetTrack = trackId ? findTrack(project.timeline, trackId) : selectedTrack
      ? project.timeline.tracks.find((track) => !track.locked && track.order < selectedTrack.order) ?? selectedTrack
      : project.timeline.tracks.find((track) => !track.locked);
    if (!targetTrack || targetTrack.locked) return project;
    const duration = 5;
    const timelineStart = start ?? project.timeline.playhead;
    const effect = createEffectFromPreset(presetId, { effects: [], duration });
    const effectClip = createClip({
      trackId: targetTrack.id,
      type: "effect",
      name: effect.name,
      timelineStart,
      duration,
      sourceOut: duration,
      effects: [effect],
      color: "#2a6f84"
    });
    return { ...project, timeline: addClipToTimeline(project.timeline, effectClip) };
  }),
  removeSelectedEffect: (effectId) => get().executeCommand("Remove effect", (project) => withSelectedClip(project, (clip) => ({
    effects: normalizeEffects(clip.effects, clip.duration).filter((effect) => effect.id !== effectId).map((effect, order) => ({ ...effect, order }))
  }))),
  toggleSelectedEffect: (effectId) => get().executeCommand("Toggle effect", (project) => withSelectedClip(project, (clip) => ({
    effects: normalizeEffects(clip.effects, clip.duration).map((effect) => effect.id === effectId ? { ...effect, enabled: !effect.enabled } : effect)
  }))),
  resetSelectedEffect: (effectId) => get().executeCommand("Reset effect", (project) => withSelectedClip(project, (clip) => {
    const effects = normalizeEffects(clip.effects, clip.duration);
    const target = effects.find((effect) => effect.id === effectId);
    if (!target?.presetId) return {};
    return {
      effects: effects.map((effect) => effect.id === effectId
        ? { ...createEffectFromPreset(target.presetId ?? "", { effects: [], duration: clip.duration }), id: effect.id, order: effect.order, startTime: effect.startTime, duration: effect.duration, seed: effect.seed }
        : effect)
    };
  })),
  updateSelectedEffect: (effectId, patch) => get().executeCommand("Change effect", (project) => withSelectedClip(project, (clip) => {
    const nextClipDuration = clip.type === "effect" && typeof patch.duration === "number"
      ? clamp(patch.duration, 0.25, 60)
      : clip.duration;
    return {
      ...(clip.type === "effect" ? { duration: nextClipDuration, sourceOut: nextClipDuration } : {}),
      effects: normalizeEffects(clip.effects, nextClipDuration).map((effect) => effect.id === effectId
        ? normalizeEffect({
          ...effect,
          ...patch,
          duration: typeof patch.duration === "number" ? nextClipDuration : effect.duration,
          params: patch.params ? { ...effect.params, ...patch.params } : effect.params
        }, nextClipDuration, effect.order)
        : effect)
    };
  })),
  moveSelectedEffect: (effectId, direction) => get().executeCommand("Reorder effect", (project) => withSelectedClip(project, (clip) => {
    const effects = normalizeEffects(clip.effects, clip.duration);
    const index = effects.findIndex((effect) => effect.id === effectId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= effects.length) return {};
    const next = [...effects];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    return { effects: next.map((effect, order) => ({ ...effect, order })) };
  })),
  copySelectedEffects: () => {
    const clip = firstSelectedClip(get().project);
    if (!clip) {
      get().addToast("error", "Select a clip to copy effects.");
      return;
    }
    set({
      clipPropertyClipboard: {
        transform: clip.transform ? { ...clip.transform } : undefined,
        audio: clip.audio ? { ...clip.audio } : undefined,
        text: clip.text ? { ...clip.text } : undefined,
        crop: clip.crop ? { ...clip.crop } : undefined,
        colorAdjustments: clip.colorAdjustments ? { ...clip.colorAdjustments } : undefined,
        effects: normalizeEffects(clip.effects, clip.duration),
        masks: clip.masks ? cloneData(clip.masks) : undefined,
        speed: clip.speed,
        playbackRate: clip.playbackRate,
        keyframes: clip.keyframes ? cloneData(clip.keyframes) : undefined
      }
    });
    get().addToast("success", "Clip effects copied.");
  },
  pasteEffectsToSelected: () => {
    const effects = get().clipPropertyClipboard?.effects;
    if (!effects) {
      get().addToast("error", "Copy effects first.");
      return;
    }
    get().executeCommand("Paste effects", (project) => withSelectedClip(project, (clip) => {
      if (clip.type !== "video" && clip.type !== "image" && clip.type !== "effect") return {};
      return { effects: normalizeEffects(cloneData(effects), clip.duration) };
    }));
  },
  addMaskToSelected: (type) => get().executeCommand("Add mask", (project) => withSelectedClip(project, (clip) => {
    if (!isVisualMaskClip(clip)) return {};
    const masks = normalizeMasks(clip.masks, project.timeline);
    return { masks: [...masks, { ...defaultMask(type, project.timeline), name: `${type.replace("-", " ")} ${masks.length + 1}` }] };
  })),
  updateSelectedMask: (maskId, patch) => get().executeCommand("Change mask", (project) => withSelectedClip(project, (clip) => {
    if (!isVisualMaskClip(clip)) return {};
    const masks = normalizeMasks(clip.masks, project.timeline);
    return { masks: masks.map((mask) => mask.id === maskId ? updateMaskForPlayhead(mask, clip, patch, project) : mask) };
  })),
  removeSelectedMask: (maskId) => get().executeCommand("Remove mask", (project) => withSelectedClip(project, (clip) => ({
    masks: normalizeMasks(clip.masks, project.timeline).filter((mask) => mask.id !== maskId)
  }))),
  duplicateSelectedMask: (maskId) => get().executeCommand("Duplicate mask", (project) => withSelectedClip(project, (clip) => {
    const masks = normalizeMasks(clip.masks, project.timeline);
    const source = masks.find((mask) => mask.id === maskId);
    if (!source) return {};
    return {
      masks: [...masks, {
        ...cloneData(source),
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
        position: { x: source.position.x + 24, y: source.position.y + 24 },
        keyframes: source.keyframes.map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() }))
      }]
    };
  })),
  moveSelectedMask: (maskId, direction) => get().executeCommand("Reorder mask", (project) => withSelectedClip(project, (clip) => {
    const masks = normalizeMasks(clip.masks, project.timeline);
    const index = masks.findIndex((mask) => mask.id === maskId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= masks.length) return {};
    const next = [...masks];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    return { masks: next };
  })),
  copySelectedMasks: () => {
    const clip = firstSelectedClip(get().project);
    if (!clip || !isVisualMaskClip(clip)) {
      get().addToast("error", "Select a visual clip to copy masks.");
      return;
    }
    set({ clipPropertyClipboard: { masks: normalizeMasks(clip.masks, get().project.timeline) } });
    get().addToast("success", "Clip masks copied.");
  },
  pasteMasksToSelected: () => {
    const masks = get().clipPropertyClipboard?.masks;
    if (!masks) {
      get().addToast("error", "Copy masks first.");
      return;
    }
    get().executeCommand("Paste masks", (project) => withSelectedClip(project, (clip) => (
      isVisualMaskClip(clip) ? { masks: normalizeMasks(cloneData(masks), project.timeline) } : {}
    )));
  },
  addSelectedMaskKeyframe: (maskId) => get().executeCommand("Add mask keyframe", (project) => withSelectedClip(project, (clip) => {
    const masks = normalizeMasks(clip.masks, project.timeline);
    return { masks: masks.map((mask) => mask.id === maskId ? upsertMaskKeyframe(evaluateMaskAtTime(mask, clip, project.timeline.playhead), clip, project.timeline.playhead, project.timeline) : mask) };
  })),
  removeSelectedMaskKeyframe: (maskId, keyframeId) => get().executeCommand("Remove mask keyframe", (project) => withSelectedClip(project, (clip) => ({
    masks: normalizeMasks(clip.masks, project.timeline).map((mask) => mask.id === maskId ? removeMaskKeyframe(mask, keyframeId) : mask)
  }))),
  moveSelectedMaskKeyframe: (maskId, keyframeId, time) => get().executeCommand("Move mask keyframe", (project) => withSelectedClip(project, (clip) => ({
    masks: normalizeMasks(clip.masks, project.timeline).map((mask) => mask.id === maskId ? {
      ...mask,
      keyframes: mask.keyframes
        .map((keyframe) => keyframe.id === keyframeId ? {
          ...keyframe,
          time: clamp(framesToSeconds(secondsToFrames(time, project.timeline.fps), project.timeline.fps), 0, clip.duration)
        } : keyframe)
        .sort((a, b) => a.time - b.time)
    } : mask)
  }))),
  setClipMaskTransient: (clipId, maskId, patch) => set((state) => {
    const clip = findClip(state.project.timeline, clipId);
    if (!clip) return {};
    return {
      saveStatus: "Unsaved changes",
      project: {
        ...state.project,
        timeline: updateClip(state.project.timeline, clipId, {
          masks: normalizeMasks(clip.masks, state.project.timeline).map((mask) => mask.id === maskId ? updateMaskForPlayhead(mask, clip, patch, state.project) : mask)
        })
      }
    };
  }),
  updateSelectedBackgroundRemoval: (patch) => get().executeCommand("Change background removal", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image") return {};
    const current = normalizeBackgroundRemovalSettings(clip.backgroundRemoval);
    const next = patch.mode ? applyModeDefaults(current, patch.mode) : current;
    return { backgroundRemoval: normalizeBackgroundRemovalSettings({ ...next, ...patch }) };
  })),
  applyExportAspectPreset: (preset, explicitDimensions) => get().executeCommand("Apply aspect preset", (project) => {
    const height = project.exportSettings.resolution === "720p" ? 720 : 1080;
    const dimensions = dimensionsForAspect(preset, height, project.timeline, explicitDimensions);
    const resized = resizeProjectCanvas(project, dimensions);
    return {
      ...resized,
      exportSettings: { ...resized.exportSettings, aspectRatio: preset }
    };
  }),
  applyExportResolutionPreset: (preset) => get().executeCommand("Apply resolution preset", (project) => {
    const aspect = project.exportSettings.aspectRatio ?? "16:9";
    const height = preset === "720p" ? 720 : 1080;
    const dimensions = dimensionsForAspect(aspect, height, project.timeline);
    const resized = resizeProjectCanvas(project, dimensions);
    return {
      ...resized,
      exportSettings: { ...resized.exportSettings, resolution: preset }
    };
  }),
  applyTimelineTool: (tool) => {
    const project = get().project;
    const clip = firstSelectedClip(project);
    if (!clip) {
      get().addToast("error", "Select a clip first.");
      return;
    }
    if (tool === "crop") {
      if (clip.type === "audio") {
        get().addToast("error", "Crop works on video, image, and text clips.");
        return;
      }
      get().executeCommand("Enable crop", (draft) => withSelectedClip(draft, (item) => ({
        crop: item.crop ?? { left: 0, top: 0, right: 0, bottom: 0 }
      })));
    }
  },
  toggleTrackHidden: (trackId) => get().executeCommand("Toggle track visibility", (project) => {
    const track = findTrack(project.timeline, trackId);
    return track ? { ...project, timeline: updateTrack(project.timeline, trackId, { hidden: !track.hidden }) } : project;
  }),
  toggleTrackMuted: (trackId) => get().executeCommand("Toggle track mute", (project) => {
    const track = findTrack(project.timeline, trackId);
    return track ? { ...project, timeline: updateTrack(project.timeline, trackId, { muted: !track.muted }) } : project;
  }),
  toggleTrackLocked: (trackId) => get().executeCommand("Toggle track lock", (project) => {
    const track = findTrack(project.timeline, trackId);
    return track ? { ...project, timeline: updateTrack(project.timeline, trackId, { locked: !track.locked }) } : project;
  }),
  setPlayhead: (time) => set((state) => ({ project: { ...state.project, timeline: { ...state.project.timeline, playhead: clamp(time, 0, state.project.timeline.duration) } } })),
  stepPlayhead: (frames) => set((state) => {
    const delta = frames / state.project.timeline.fps;
    return { project: { ...state.project, timeline: { ...state.project.timeline, playhead: clamp(state.project.timeline.playhead + delta, 0, state.project.timeline.duration) } } };
  }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setZoom: (zoom) => set((state) => ({ project: { ...state.project, timeline: { ...state.project.timeline, zoom: clamp(zoom, 5, 28) } } })),
  updateSelectedTransform: (patch) => get().executeCommand("Change transform", (project) => withSelectedClip(project, (clip) => {
    if (clip.type === "audio") return {};
    const base = { ...evaluateTransformAtTime(clip, project.timeline.playhead, defaultTransform(project.timeline)), ...patch };
    if (hasKeyframeAtTime(clip, "transform", project.timeline.playhead) || (clip.keyframes?.transform?.length ?? 0) > 0) {
      return upsertTransformKeyframe(clip, project.timeline.playhead, base);
    }
    return { transform: { ...(clip.transform ?? defaultTransform(project.timeline)), ...patch } };
  })),
  setClipTransformTransient: (clipId, patch) => set((state) => ({
    saveStatus: "Unsaved changes",
    project: (() => {
      const clip = findClip(state.project.timeline, clipId);
      if (!clip) return state.project;
      const transform = { ...evaluateTransformAtTime(clip, state.project.timeline.playhead, defaultTransform(state.project.timeline)), ...patch };
      if ((clip.keyframes?.transform?.length ?? 0) > 0) {
        const updated = upsertTransformKeyframe(clip, state.project.timeline.playhead, transform);
        return {
          ...state.project,
          timeline: updateClip(state.project.timeline, clipId, {
            keyframes: updated.keyframes,
            transform: updated.transform
          })
        };
      }
      return {
        ...state.project,
        timeline: updateClip(state.project.timeline, clipId, {
          transform: { ...(clip.transform ?? defaultTransform(state.project.timeline)), ...patch }
        })
      };
    })()
  })),
  updateSelectedCrop: (patch) => get().executeCommand("Change crop", (project) => withSelectedClip(project, (clip) => {
    if (patch === undefined) return { crop: undefined };
    const current = clip.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const next = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, clamp(Number(value), 0, 45)]))
    };
    const horizontal = next.left + next.right;
    const vertical = next.top + next.bottom;
    if (horizontal > 90) next.right = Math.max(0, 90 - next.left);
    if (vertical > 90) next.bottom = Math.max(0, 90 - next.top);
    return { crop: next };
  })),
  updateSelectedColor: (patch) => get().executeCommand("Change color", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image" && clip.type !== "filter") return {};
    const base = mergeColorGrade(evaluateColorAtTime(clip, project.timeline.playhead), patch);
    if (hasKeyframeAtTime(clip, "color", project.timeline.playhead) || (clip.keyframes?.color?.length ?? 0) > 0) {
      return upsertColorKeyframe({ ...clip, colorAdjustments: mergeColorGrade(clip.colorAdjustments, patch) }, project.timeline.playhead, base);
    }
    return { colorAdjustments: base };
  })),
  updateSelectedAudio: (patch) => get().executeCommand("Change audio", (project) => withSelectedClip(project, (clip) => {
    const base = { ...evaluateAudioAtTime(clip, project.timeline.playhead), ...patch };
    if (patch.volume !== undefined && (hasKeyframeAtTime(clip, "audio", project.timeline.playhead) || (clip.keyframes?.audio?.length ?? 0) > 0)) {
      return upsertAudioKeyframe({ ...clip, audio: { ...(clip.audio ?? defaultAudioSettings()), ...patch } }, project.timeline.playhead, base);
    }
    return { audio: { ...(clip.audio ?? defaultAudioSettings()), ...patch } };
  })),
  addSelectedTransformKeyframe: () => get().executeCommand("Add transform keyframe", (project) => withSelectedClip(project, (clip) => {
    if (clip.type === "audio") return {};
    return upsertTransformKeyframe(clip, project.timeline.playhead, evaluateTransformAtTime(clip, project.timeline.playhead, defaultTransform(project.timeline)));
  })),
  addSelectedAudioKeyframe: () => get().executeCommand("Add volume keyframe", (project) => withSelectedClip(project, (clip) => (
    upsertAudioKeyframe(clip, project.timeline.playhead, evaluateAudioAtTime(clip, project.timeline.playhead))
  ))),
  moveSelectedKeyframe: (kind, keyframeId, time) => get().executeCommand("Move keyframe", (project) => withSelectedClip(project, (clip) => {
    const nextTime = clamp(framesToSeconds(secondsToFrames(time, project.timeline.fps), project.timeline.fps), 0, clip.duration);
    const keyframes = clip.keyframes ?? {};
    if (kind === "transform") {
      return {
        keyframes: {
          ...keyframes,
          transform: keyframes.transform?.map((keyframe) => keyframe.id === keyframeId ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time)
        }
      };
    }
    if (kind === "speed") {
      return {
        keyframes: {
          ...keyframes,
          speed: keyframes.speed?.map((keyframe) => keyframe.id === keyframeId ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time)
        }
      };
    }
    if (kind === "color") {
      return {
        keyframes: {
          ...keyframes,
          color: keyframes.color?.map((keyframe) => keyframe.id === keyframeId ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time)
        }
      };
    }
    return {
      keyframes: {
        ...keyframes,
        audio: keyframes.audio?.map((keyframe) => keyframe.id === keyframeId ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time)
      }
    };
  })),
  removeSelectedKeyframe: (kind, keyframeId) => get().executeCommand("Remove keyframe", (project) => withSelectedClip(project, (clip) => removeClipKeyframe(clip, kind, keyframeId))),
  addSelectedSpeedKeyframe: () => get().executeCommand("Add speed keyframe", (project) => withSelectedClip(project, (clip) => (
    upsertSpeedKeyframe(clip, project.timeline.playhead, evaluateSpeedAtTime(clip, project.timeline.playhead))
  ))),
  addSelectedColorKeyframe: () => get().executeCommand("Add color keyframe", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image" && clip.type !== "filter") return {};
    return upsertColorKeyframe(clip, project.timeline.playhead, evaluateColorAtTime(clip, project.timeline.playhead));
  })),
  updateSelectedSpeed: (speed) => get().executeCommand("Change speed", (project) => withSelectedClip(project, (clip) => {
    const nextSpeed = clamp(speed, 0.25, 4);
    if (hasKeyframeAtTime(clip, "speed", project.timeline.playhead) || (clip.keyframes?.speed?.length ?? 0) > 0) {
      return upsertSpeedKeyframe(clip, project.timeline.playhead, nextSpeed);
    }
    return setClipSpeed(clip, nextSpeed);
  })),
  updateSelectedText: (patch) => get().executeCommand("Change text", (project) => withSelectedClip(project, (clip) => ({ text: normalizeTextSettings({ ...(clip.text ?? defaultTextSettings()), ...patch }) }))),
  updateSelectedTextAnimation: (side, patch) => get().executeCommand("Change text animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "text") return {};
    const current = normalizeTextClipAnimations(clip.textAnimations);
    return {
      textAnimations: {
        ...current,
        [side]: normalizeTextAnimation({ ...current[side], ...patch }, side)
      }
    };
  })),
  applySelectedTextAnimationPreset: (side, presetId) => get().executeCommand("Apply text animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "text") return {};
    const current = normalizeTextClipAnimations(clip.textAnimations);
    const preset = (side === "in" ? inTextAnimationPresets : outTextAnimationPresets).find((item) => item.id === presetId);
    if (!preset) return {};
    return {
      textAnimations: {
        ...current,
        [side]: applyTextAnimationPreset(current[side], preset)
      }
    };
  })),
  resetSelectedTextAnimation: (side) => get().executeCommand("Reset text animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "text") return {};
    const current = normalizeTextClipAnimations(clip.textAnimations);
    const defaults = defaultTextClipAnimations();
    return { textAnimations: { ...current, [side]: defaults[side] } };
  })),
  updateSelectedVideoAnimation: (side, patch) => get().executeCommand("Change video animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image") return {};
    const current = normalizeVideoClipAnimations(clip.videoAnimations);
    return {
      videoAnimations: {
        ...current,
        [side]: normalizeVideoAnimation({ ...current[side], ...patch }, side)
      }
    };
  })),
  applySelectedVideoAnimationPreset: (side, presetId) => get().executeCommand("Apply video animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image") return {};
    const current = normalizeVideoClipAnimations(clip.videoAnimations);
    const preset = (side === "in" ? inVideoAnimationPresets : outVideoAnimationPresets).find((item) => item.id === presetId);
    if (!preset) return {};
    return {
      videoAnimations: {
        ...current,
        [side]: applyVideoAnimationPreset(current[side], preset)
      }
    };
  })),
  resetSelectedVideoAnimation: (side) => get().executeCommand("Reset video animation", (project) => withSelectedClip(project, (clip) => {
    if (clip.type !== "video" && clip.type !== "image") return {};
    const current = normalizeVideoClipAnimations(clip.videoAnimations);
    const defaults = defaultVideoClipAnimations();
    return { videoAnimations: { ...current, [side]: defaults[side] } };
  })),
  updateProjectSettings: (patch) => get().executeCommand("Change project settings", (project) => {
    const settings = { ...project.settings, ...patch };
    const resized = (patch.width !== undefined || patch.height !== undefined)
      ? resizeProjectCanvas(project, { width: settings.width, height: settings.height })
      : { ...project, settings };
    return {
      ...resized,
      settings,
      timeline: {
        ...resized.timeline,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        sampleRate: settings.sampleRate
      }
    };
  }),
  updateExportSettings: (patch) => get().executeCommand("Change export settings", (project) => ({ ...project, exportSettings: { ...project.exportSettings, ...patch } })),
  refreshExportWarnings: () => set((state) => ({ exportWarnings: buildExportPlan(state.project).warnings })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setExportProgress: (exportProgress) => set({ exportProgress })
}));
