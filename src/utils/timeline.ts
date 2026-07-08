import type {
  AudioKeyframe,
  AudioSettings,
  ClipType,
  ColorGrade,
  ColorKeyframe,
  ColorSettings,
  ExportAudioClip,
  ExportRenderClip,
  ExportRenderTransition,
  MediaAsset,
  Project,
  ProjectSettings,
  SpeedKeyframe,
  TextSettings,
  Timeline,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TrackType,
  TransformKeyframe,
  Transform
} from "../types/editor";
import { clamp } from "./time";
import { exportFilterForEffect, normalizeEffects, unsupportedExportEffects } from "./effects";
import { defaultColorGrade, exportColorGrade, normalizeColorSettings } from "./colorGrade";
import { normalizeBackgroundRemovalSettings } from "./backgroundRemoval";
import { normalizeMasks } from "./masks";
import { defaultTextClipAnimations, normalizeTextClipAnimations } from "./textAnimations";
import { defaultVideoClipAnimations, normalizeVideoClipAnimations } from "./videoAnimations";
import { cleanupTransitions, transitionExportMapping, transitionTimeRange } from "./transitions";

export const PROJECT_SCHEMA_VERSION = 2;
export const MIN_CLIP_DURATION = 0.25;

export const defaultProjectSettings = (): ProjectSettings => ({
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000
});

export const defaultTransform = (size = defaultProjectSettings()): Transform => ({
  x: size.width / 2,
  y: size.height / 2,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blendMode: "normal"
});

export const defaultAudioSettings = (): AudioSettings => ({
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0
});

export const defaultColorSettings = (): ColorSettings => ({
  ...defaultColorGrade()
});

export const defaultTextSettings = (): TextSettings => ({
  text: "Live the Journey.",
  fontFamily: "Satoshi",
  fontSize: 48,
  fontWeight: 700,
  color: "#ffffff",
  background: "transparent",
  align: "center",
  stroke: {
    enabled: false,
    color: "#000000",
    width: 2
  },
  glow: {
    enabled: false,
    color: "#31b3ff",
    size: 14,
    opacity: 0.55
  },
  shadow: {
    enabled: false,
    color: "#000000",
    x: 0,
    y: 8,
    blur: 16,
    opacity: 0.5
  },
  curve: {
    enabled: false,
    amount: 0
  }
});

export function normalizeTextSettings(settings?: Partial<TextSettings>): TextSettings {
  const base = defaultTextSettings();
  return {
    ...base,
    ...settings,
    stroke: { ...base.stroke, ...(settings?.stroke ?? {}) },
    glow: { ...base.glow, ...(settings?.glow ?? {}) },
    shadow: { ...base.shadow, ...(settings?.shadow ?? {}) },
    curve: { ...base.curve, ...(settings?.curve ?? {}) }
  };
}

export function textClipPreviewLabel(clip: Pick<TimelineClip, "type" | "text">): string {
  if (clip.type !== "text") return "";
  const value = (clip.text?.text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "Text";
  return Array.from(value.replace(/\s/g, "")).slice(0, 5).join("") || "Text";
}

export function createTracks(): TimelineTrack[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `layer-${index + 1}`,
    name: `Layer ${index + 1}`,
    type: "overlay" as TrackType,
    order: index,
    locked: false,
    muted: false,
    hidden: false,
    height: 58,
    clips: []
  }));
}

export function createTimeline(settings = defaultProjectSettings()): Timeline {
  return {
    duration: 60,
    fps: settings.fps,
    width: settings.width,
    height: settings.height,
    sampleRate: settings.sampleRate,
    tracks: createTracks(),
    markers: [],
    transitions: [],
    playhead: 0,
    zoom: 10,
    selectedClipIds: [],
    selectedTransitionId: undefined
  };
}

export function createProject(name = "Unknown"): Project {
  const settings = defaultProjectSettings();
  const createdAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    version: PROJECT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    settings,
    assets: {},
    timeline: createTimeline(settings),
    exportSettings: {
      outputPath: "",
      resolution: "1080p",
      aspectRatio: "16:9",
      frameRate: 30,
      videoBitrate: "8M",
      audioBitrate: "192k"
    },
    cache: {}
  };
}

export function createClip(input: Partial<TimelineClip> & Pick<TimelineClip, "trackId" | "type" | "name">): TimelineClip {
  const now = new Date().toISOString();
  const duration = Math.max(MIN_CLIP_DURATION, input.duration ?? 5);
  const type = input.type;
  return {
    id: input.id ?? crypto.randomUUID(),
    type,
    trackId: input.trackId,
    assetId: input.assetId,
    timelineStart: Math.max(0, input.timelineStart ?? 0),
    duration,
    sourceIn: Math.max(0, input.sourceIn ?? 0),
    sourceOut: Math.max(input.sourceOut ?? duration, MIN_CLIP_DURATION),
    speed: input.speed ?? 1,
    playbackRate: input.playbackRate,
    name: input.name,
    selected: input.selected ?? false,
    locked: input.locked ?? false,
    muted: input.muted ?? false,
    hidden: input.hidden ?? false,
    transform: type !== "audio" ? (input.transform ?? defaultTransform()) : input.transform,
    colorAdjustments: type === "video" || type === "image" || type === "filter" ? normalizeColorSettings(input.colorAdjustments ?? defaultColorSettings()) : input.colorAdjustments,
    keyframes: input.keyframes,
    crop: input.crop,
    audio: type === "audio" || type === "video" ? (input.audio ?? defaultAudioSettings()) : input.audio,
    text: type === "text" ? normalizeTextSettings(input.text ?? defaultTextSettings()) : input.text,
    textAnimations: type === "text" ? normalizeTextClipAnimations(input.textAnimations ?? defaultTextClipAnimations()) : input.textAnimations,
    videoAnimations: type === "video" || type === "image" ? normalizeVideoClipAnimations(input.videoAnimations ?? defaultVideoClipAnimations()) : input.videoAnimations,
    stickerAnimation: input.stickerAnimation,
    effects: input.effects ?? [],
    masks: isMaskCompatible(type) ? normalizeMasks(input.masks, defaultProjectSettings()) : input.masks,
    backgroundRemoval: type === "video" || type === "image" ? normalizeBackgroundRemovalSettings(input.backgroundRemoval) : input.backgroundRemoval,
    transition: input.transition,
    compound: input.compound,
    color: input.color,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

function isMaskCompatible(type: ClipType): boolean {
  return type !== "audio" && type !== "compound";
}

export function allClips(timeline: Timeline): TimelineClip[] {
  return timeline.tracks.flatMap((track) => track.clips);
}

function expandCompoundClip(parent: TimelineClip, parentTrack: TimelineTrack): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  if (parent.type !== "compound" || !parent.compound) return [{ track: parentTrack, clip: parent }];
  const parentSpeed = clamp(parent.speed || 1, 0.25, 4);
  const windowStart = Math.max(0, parent.sourceIn);
  const windowEnd = windowStart + parent.duration * parentSpeed;
  return parent.compound.clips.flatMap((item) => {
    const childStart = item.clip.timelineStart;
    const childEnd = getClipEnd(item.clip);
    const visibleStart = Math.max(childStart, windowStart);
    const visibleEnd = Math.min(childEnd, windowEnd);
    if (visibleEnd - visibleStart < 0.001) return [];
    const childSpeed = clamp(item.clip.speed || 1, 0.25, 4);
    const sourceOffset = Math.max(0, visibleStart - childStart) * childSpeed;
    const duration = (visibleEnd - visibleStart) / parentSpeed;
    const clip = {
      ...item.clip,
      compoundParentId: parent.id,
      timelineStart: parent.timelineStart + (visibleStart - windowStart) / parentSpeed,
      duration,
      sourceIn: item.clip.sourceIn + sourceOffset,
      sourceOut: item.clip.sourceIn + sourceOffset + duration * childSpeed,
      hidden: parent.hidden || item.clip.hidden,
      muted: parent.muted || item.clip.muted
    };
    const track = {
      ...parentTrack,
      id: `${parent.id}:${item.clip.trackId}`,
      order: item.trackOrder,
      hidden: parentTrack.hidden || item.trackHidden,
      muted: parentTrack.muted || item.trackMuted
    };
    return clip.type === "compound" ? expandCompoundClip(clip, track) : [{ track, clip }];
  });
}

export function playbackClips(timeline: Timeline): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  return timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => expandCompoundClip(clip, track)));
}

export function findTrack(timeline: Timeline, trackId: string): TimelineTrack | undefined {
  return timeline.tracks.find((track) => track.id === trackId);
}

export function findClip(timeline: Timeline, clipId: string): TimelineClip | undefined {
  return allClips(timeline).find((clip) => clip.id === clipId);
}

export function getClipEnd(clip: Pick<TimelineClip, "timelineStart" | "duration">): number {
  return clip.timelineStart + clip.duration;
}

export function timelineDuration(timeline: Timeline, minimum = 60): number {
  const end = allClips(timeline).reduce((max, clip) => Math.max(max, getClipEnd(clip) + 2), minimum);
  return Math.max(minimum, end);
}

export function timelineContentDuration(timeline: Timeline, minimum = 0): number {
  const end = playbackClips(timeline)
    .filter(({ track, clip }) => !track.hidden && !clip.hidden)
    .reduce((max, { clip }) => Math.max(max, getClipEnd(clip)), minimum);
  return Math.max(minimum, end);
}

export function snapTime(time: number, snapTargets: number[], threshold = 0.12): number {
  const safe = Math.max(0, time);
  const nearest = snapTargets.reduce<{ time: number; distance: number } | null>((best, target) => {
    const distance = Math.abs(target - safe);
    if (distance > threshold) return best;
    if (!best || distance < best.distance) return { time: target, distance };
    return best;
  }, null);
  return nearest ? Math.max(0, nearest.time) : safe;
}

export interface TimelineSnapTarget {
  time: number;
  kind: "start" | "playhead" | "clip-start" | "clip-end" | "marker";
  clipId?: string;
  markerId?: string;
}

export interface TimelineSnapResult {
  start: number;
  snapped: boolean;
  guideTime?: number;
  edge?: "start" | "end";
  target?: TimelineSnapTarget;
}

export function getSnapTargets(timeline: Timeline, excludeClipId?: string): number[] {
  const targets = [0, timeline.playhead];
  for (const clip of allClips(timeline)) {
    if (clip.id === excludeClipId) continue;
    targets.push(clip.timelineStart, getClipEnd(clip));
  }
  return targets;
}

export function getMagneticSnapTargets(timeline: Timeline, excludeClipId?: string): TimelineSnapTarget[] {
  const targets: TimelineSnapTarget[] = [
    { time: 0, kind: "start" },
    { time: timeline.playhead, kind: "playhead" },
    ...(timeline.markers ?? []).map((marker) => ({ time: marker.time, kind: "marker" as const, markerId: marker.id }))
  ];
  for (const clip of allClips(timeline)) {
    if (clip.id === excludeClipId) continue;
    targets.push(
      { time: clip.timelineStart, kind: "clip-start", clipId: clip.id },
      { time: getClipEnd(clip), kind: "clip-end", clipId: clip.id }
    );
  }
  return targets;
}

export function resolveMagneticSnap(
  start: number,
  duration: number,
  targets: TimelineSnapTarget[],
  thresholdSeconds: number
): TimelineSnapResult {
  const safeStart = Math.max(0, start);
  const end = safeStart + duration;
  const nearest = targets.reduce<({ target: TimelineSnapTarget; edge: "start" | "end"; distance: number; start: number }) | null>((best, target) => {
    const startDistance = Math.abs(target.time - safeStart);
    const endDistance = Math.abs(target.time - end);
    const candidate = startDistance <= endDistance
      ? { target, edge: "start" as const, distance: startDistance, start: target.time }
      : { target, edge: "end" as const, distance: endDistance, start: target.time - duration };
    if (candidate.distance > thresholdSeconds) return best;
    if (!best || candidate.distance < best.distance) return candidate;
    return best;
  }, null);
  if (!nearest) return { start: safeStart, snapped: false };
  return {
    start: Math.max(0, nearest.start),
    snapped: true,
    guideTime: nearest.target.time,
    edge: nearest.edge,
    target: nearest.target
  };
}

export function addTimelineMarker(timeline: Timeline, time: number, label = "Marker"): Timeline {
  const marker: TimelineMarker = {
    id: crypto.randomUUID(),
    time: clamp(time, 0, timeline.duration),
    label,
    color: "#f7d36b"
  };
  return {
    ...timeline,
    markers: [...(timeline.markers ?? []), marker].sort((a, b) => a.time - b.time)
  };
}

export function removeTimelineMarker(timeline: Timeline, markerId: string): Timeline {
  return {
    ...timeline,
    markers: (timeline.markers ?? []).filter((marker) => marker.id !== markerId)
  };
}

export function updateTimelineMarker(timeline: Timeline, markerId: string, patch: Partial<TimelineMarker>): Timeline {
  return {
    ...timeline,
    markers: (timeline.markers ?? []).map((marker) => marker.id === markerId
      ? { ...marker, ...patch, time: clamp(patch.time ?? marker.time, 0, timeline.duration) }
      : marker).sort((a, b) => a.time - b.time)
  };
}

export function getClipAtTime(track: TimelineTrack, time: number): TimelineClip | undefined {
  return track.clips.find((clip) => !clip.hidden && time >= clip.timelineStart && time < getClipEnd(clip));
}

function visualWeight(track: TimelineTrack): number {
  return 1000 - track.order;
}

export function getVisibleClipsAtTime(timeline: Timeline, time: number): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  return playbackClips(timeline)
    .filter(({ track, clip }) => !track.hidden && !clip.hidden && clip.type !== "audio" && clip.type !== "compound" && time >= clip.timelineStart && time < getClipEnd(clip))
    .sort((a, b) => visualWeight(a.track) - visualWeight(b.track));
}

export function getAudibleClipsAtTime(timeline: Timeline, time: number): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  return playbackClips(timeline)
    .filter(({ track, clip }) => !track.hidden && !track.muted && !clip.hidden && !clip.muted && !clip.audio?.muted && (clip.type === "audio" || clip.type === "video"))
    .filter(({ clip }) => time >= clip.timelineStart && time < getClipEnd(clip));
}

function keyframeTime(clip: TimelineClip, absoluteTime: number): number {
  return clamp(absoluteTime - clip.timelineStart, 0, clip.duration);
}

function nearTime(left: number, right: number): boolean {
  return Math.abs(left - right) < 1 / 120;
}

function sortTransformKeyframes(keyframes: TransformKeyframe[]): TransformKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function sortAudioKeyframes(keyframes: AudioKeyframe[]): AudioKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function sortSpeedKeyframes(keyframes: SpeedKeyframe[]): SpeedKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function sortColorKeyframes(keyframes: ColorKeyframe[]): ColorKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function interpolationRatio(left: number, right: number, time: number): number {
  if (right <= left) return 0;
  return clamp((time - left) / (right - left), 0, 1);
}

function interpolate(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

export function evaluateTransformAtTime(clip: TimelineClip, absoluteTime: number, fallback = defaultTransform()): Transform {
  const base = clip.transform ?? fallback;
  const keyframes = sortTransformKeyframes(clip.keyframes?.transform ?? []);
  if (!keyframes.length) return base;
  const time = keyframeTime(clip, absoluteTime);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.time) return { ...base, x: first.x, y: first.y, scale: first.scale, opacity: first.opacity };
  if (time >= last.time) return { ...base, x: last.x, y: last.y, scale: last.scale, opacity: last.opacity };
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const right = keyframes[rightIndex];
  const ratio = interpolationRatio(left.time, right.time, time);
  return {
    ...base,
    x: interpolate(left.x, right.x, ratio),
    y: interpolate(left.y, right.y, ratio),
    scale: interpolate(left.scale, right.scale, ratio),
    opacity: interpolate(left.opacity, right.opacity, ratio)
  };
}

export function evaluateAudioAtTime(clip: TimelineClip, absoluteTime: number): AudioSettings {
  const base = clip.audio ?? defaultAudioSettings();
  const keyframes = sortAudioKeyframes(clip.keyframes?.audio ?? []);
  if (!keyframes.length) return base;
  const time = keyframeTime(clip, absoluteTime);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.time) return { ...base, volume: first.volume };
  if (time >= last.time) return { ...base, volume: last.volume };
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const right = keyframes[rightIndex];
  return { ...base, volume: interpolate(left.volume, right.volume, interpolationRatio(left.time, right.time, time)) };
}

export function evaluateSpeedAtTime(clip: TimelineClip, absoluteTime: number): number {
  const base = clamp(clip.speed || 1, 0.25, 4);
  const keyframes = sortSpeedKeyframes(clip.keyframes?.speed ?? []);
  if (!keyframes.length) return base;
  const time = keyframeTime(clip, absoluteTime);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.time) return clamp(first.speed, 0.25, 4);
  if (time >= last.time) return clamp(last.speed, 0.25, 4);
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const right = keyframes[rightIndex];
  return clamp(interpolate(left.speed, right.speed, interpolationRatio(left.time, right.time, time)), 0.25, 4);
}

export function evaluateColorAtTime(clip: TimelineClip, absoluteTime: number): ColorGrade {
  const base = normalizeColorSettings(clip.colorAdjustments);
  const keyframes = sortColorKeyframes(clip.keyframes?.color ?? []);
  if (!keyframes.length) return base;
  const time = keyframeTime(clip, absoluteTime);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.time) return normalizeColorSettings(first.grade);
  if (time >= last.time) return normalizeColorSettings(last.grade);
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const right = keyframes[rightIndex];
  return interpolateColorGrade(left.grade, right.grade, interpolationRatio(left.time, right.time, time));
}

function interpolateColorGrade(left: ColorGrade, right: ColorGrade, ratio: number): ColorGrade {
  const a = normalizeColorSettings(left);
  const b = normalizeColorSettings(right);
  const basicKeys = Object.keys(a.basic) as Array<keyof ColorGrade["basic"]>;
  return normalizeColorSettings({
    ...a,
    enabled: ratio < 0.5 ? a.enabled : b.enabled,
    bypassed: ratio < 0.5 ? a.bypassed : b.bypassed,
    beforeAfter: ratio < 0.5 ? a.beforeAfter : b.beforeAfter,
    mix: interpolate(a.mix, b.mix, ratio),
    basic: Object.fromEntries(basicKeys.map((key) => [key, interpolate(a.basic[key], b.basic[key], ratio)])) as unknown as ColorGrade["basic"],
    lut: { ...(ratio < 0.5 ? a.lut : b.lut), intensity: interpolate(a.lut.intensity, b.lut.intensity, ratio) },
    hsl: {
      ...(ratio < 0.5 ? a.hsl : b.hsl),
      ranges: Object.fromEntries(Object.keys(a.hsl.ranges).map((name) => {
        const key = name as keyof typeof a.hsl.ranges;
        const leftRange = a.hsl.ranges[key];
        const rightRange = b.hsl.ranges[key];
        return [key, Object.fromEntries(Object.keys(leftRange).map((field) => {
          const rangeKey = field as keyof typeof leftRange;
          return [rangeKey, interpolate(leftRange[rangeKey], rightRange[rangeKey], ratio)];
        }))];
      })) as unknown as ColorGrade["hsl"]["ranges"]
    },
    curves: ratio < 0.5 ? a.curves : b.curves,
    wheels: {
      ...(ratio < 0.5 ? a.wheels : b.wheels),
      shadows: interpolateWheel(a.wheels.shadows, b.wheels.shadows, ratio),
      midtones: interpolateWheel(a.wheels.midtones, b.wheels.midtones, ratio),
      highlights: interpolateWheel(a.wheels.highlights, b.wheels.highlights, ratio),
      global: interpolateWheel(a.wheels.global, b.wheels.global, ratio),
      shadowRange: interpolate(a.wheels.shadowRange, b.wheels.shadowRange, ratio),
      highlightRange: interpolate(a.wheels.highlightRange, b.wheels.highlightRange, ratio),
      softness: interpolate(a.wheels.softness, b.wheels.softness, ratio)
    },
    match: a.match && b.match ? {
      ...(ratio < 0.5 ? a.match : b.match),
      strength: interpolate(a.match.strength, b.match.strength, ratio),
      exposure: interpolate(a.match.exposure, b.match.exposure, ratio),
      temperature: interpolate(a.match.temperature, b.match.temperature, ratio),
      tint: interpolate(a.match.tint, b.match.tint, ratio),
      contrast: interpolate(a.match.contrast, b.match.contrast, ratio),
      saturation: interpolate(a.match.saturation, b.match.saturation, ratio)
    } : ratio < 0.5 ? a.match : b.match
  });
}

function interpolateWheel(left: ColorGrade["wheels"]["global"], right: ColorGrade["wheels"]["global"], ratio: number) {
  return {
    hue: interpolate(left.hue, right.hue, ratio),
    saturation: interpolate(left.saturation, right.saturation, ratio),
    luminance: interpolate(left.luminance, right.luminance, ratio)
  };
}

export function sourceDuration(clip: Pick<TimelineClip, "sourceIn" | "sourceOut" | "duration" | "speed">): number {
  const span = clip.sourceOut - clip.sourceIn;
  if (Number.isFinite(span) && span > 0) return Math.max(MIN_CLIP_DURATION, span);
  return Math.max(MIN_CLIP_DURATION, clip.duration * clamp(clip.speed || 1, 0.25, 4));
}

export function sourceTimeAtTimelineTime(clip: TimelineClip, absoluteTime: number): number {
  const local = keyframeTime(clip, absoluteTime);
  const speedKeyframes = sortSpeedKeyframes(clip.keyframes?.speed ?? []);
  if (!speedKeyframes.length) return clip.sourceIn + local * clamp(clip.speed || 1, 0.25, 4);
  let covered = 0;
  let cursor = 0;
  let lastSpeed = evaluateSpeedAtTime(clip, clip.timelineStart);
  for (const keyframe of speedKeyframes.filter((item) => item.time > 0 && item.time < local)) {
    const segmentDuration = keyframe.time - cursor;
    covered += ((lastSpeed + keyframe.speed) / 2) * segmentDuration;
    cursor = keyframe.time;
    lastSpeed = keyframe.speed;
  }
  const currentSpeed = evaluateSpeedAtTime(clip, clip.timelineStart + local);
  covered += ((lastSpeed + currentSpeed) / 2) * (local - cursor);
  return clamp(clip.sourceIn + covered, clip.sourceIn, clip.sourceOut);
}

export function setClipSpeed(clip: TimelineClip, speed: number): TimelineClip {
  const nextSpeed = clamp(speed, 0.25, 4);
  const nextDuration = Math.max(MIN_CLIP_DURATION, sourceDuration(clip) / nextSpeed);
  return {
    ...clip,
    speed: nextSpeed,
    playbackRate: nextSpeed,
    duration: nextDuration,
    keyframes: pruneKeyframesForDuration(clip, nextDuration),
    updatedAt: new Date().toISOString()
  };
}

export function upsertTransformKeyframe(clip: TimelineClip, absoluteTime: number, transform: Transform): TimelineClip {
  const time = keyframeTime(clip, absoluteTime);
  const keyframes = sortTransformKeyframes(clip.keyframes?.transform ?? []);
  const nextKeyframe: TransformKeyframe = {
    id: keyframes.find((keyframe) => nearTime(keyframe.time, time))?.id ?? crypto.randomUUID(),
    time,
    x: transform.x,
    y: transform.y,
    scale: transform.scale,
    opacity: transform.opacity
  };
  const next = keyframes.some((keyframe) => nearTime(keyframe.time, time))
    ? keyframes.map((keyframe) => nearTime(keyframe.time, time) ? nextKeyframe : keyframe)
    : [...keyframes, nextKeyframe];
  return { ...clip, keyframes: { ...clip.keyframes, transform: sortTransformKeyframes(next) } };
}

export function upsertAudioKeyframe(clip: TimelineClip, absoluteTime: number, audio: AudioSettings): TimelineClip {
  const time = keyframeTime(clip, absoluteTime);
  const keyframes = sortAudioKeyframes(clip.keyframes?.audio ?? []);
  const nextKeyframe: AudioKeyframe = {
    id: keyframes.find((keyframe) => nearTime(keyframe.time, time))?.id ?? crypto.randomUUID(),
    time,
    volume: audio.volume
  };
  const next = keyframes.some((keyframe) => nearTime(keyframe.time, time))
    ? keyframes.map((keyframe) => nearTime(keyframe.time, time) ? nextKeyframe : keyframe)
    : [...keyframes, nextKeyframe];
  return { ...clip, keyframes: { ...clip.keyframes, audio: sortAudioKeyframes(next) } };
}

export function upsertSpeedKeyframe(clip: TimelineClip, absoluteTime: number, speed: number): TimelineClip {
  const time = keyframeTime(clip, absoluteTime);
  const keyframes = sortSpeedKeyframes(clip.keyframes?.speed ?? []);
  const nextKeyframe: SpeedKeyframe = {
    id: keyframes.find((keyframe) => nearTime(keyframe.time, time))?.id ?? crypto.randomUUID(),
    time,
    speed: clamp(speed, 0.25, 4)
  };
  const next = keyframes.some((keyframe) => nearTime(keyframe.time, time))
    ? keyframes.map((keyframe) => nearTime(keyframe.time, time) ? nextKeyframe : keyframe)
    : [...keyframes, nextKeyframe];
  return { ...clip, keyframes: { ...clip.keyframes, speed: sortSpeedKeyframes(next) } };
}

export function upsertColorKeyframe(clip: TimelineClip, absoluteTime: number, grade: ColorGrade): TimelineClip {
  const time = keyframeTime(clip, absoluteTime);
  const keyframes = sortColorKeyframes(clip.keyframes?.color ?? []);
  const nextKeyframe: ColorKeyframe = {
    id: keyframes.find((keyframe) => nearTime(keyframe.time, time))?.id ?? crypto.randomUUID(),
    time,
    grade: normalizeColorSettings(grade)
  };
  const next = keyframes.some((keyframe) => nearTime(keyframe.time, time))
    ? keyframes.map((keyframe) => nearTime(keyframe.time, time) ? nextKeyframe : keyframe)
    : [...keyframes, nextKeyframe];
  return { ...clip, keyframes: { ...clip.keyframes, color: sortColorKeyframes(next) } };
}

export function removeClipKeyframe(clip: TimelineClip, kind: "transform" | "audio" | "speed" | "color", keyframeId: string): TimelineClip {
  const keyframes = clip.keyframes ?? {};
  if (kind === "transform") {
    return { ...clip, keyframes: { ...keyframes, transform: keyframes.transform?.filter((keyframe) => keyframe.id !== keyframeId) } };
  }
  if (kind === "speed") {
    return { ...clip, keyframes: { ...keyframes, speed: keyframes.speed?.filter((keyframe) => keyframe.id !== keyframeId) } };
  }
  if (kind === "color") {
    return { ...clip, keyframes: { ...keyframes, color: keyframes.color?.filter((keyframe) => keyframe.id !== keyframeId) } };
  }
  return { ...clip, keyframes: { ...keyframes, audio: keyframes.audio?.filter((keyframe) => keyframe.id !== keyframeId) } };
}

export function hasKeyframeAtTime(clip: TimelineClip, kind: "transform" | "audio" | "speed" | "color", absoluteTime: number): boolean {
  const time = keyframeTime(clip, absoluteTime);
  const keyframes = kind === "transform" ? clip.keyframes?.transform : kind === "audio" ? clip.keyframes?.audio : kind === "speed" ? clip.keyframes?.speed : clip.keyframes?.color;
  return Boolean(keyframes?.some((keyframe) => nearTime(keyframe.time, time)));
}

function remapKeyframesForTrim(clip: TimelineClip, delta: number, nextDuration: number): TimelineClip["keyframes"] {
  const transform = clip.keyframes?.transform
    ?.map((keyframe) => ({ ...keyframe, time: keyframe.time - delta }))
    .filter((keyframe) => keyframe.time >= 0 && keyframe.time <= nextDuration);
  const audio = clip.keyframes?.audio
    ?.map((keyframe) => ({ ...keyframe, time: keyframe.time - delta }))
    .filter((keyframe) => keyframe.time >= 0 && keyframe.time <= nextDuration);
  const speed = clip.keyframes?.speed
    ?.map((keyframe) => ({ ...keyframe, time: keyframe.time - delta }))
    .filter((keyframe) => keyframe.time >= 0 && keyframe.time <= nextDuration);
  const color = clip.keyframes?.color
    ?.map((keyframe) => ({ ...keyframe, time: keyframe.time - delta }))
    .filter((keyframe) => keyframe.time >= 0 && keyframe.time <= nextDuration);
  return {
    ...clip.keyframes,
    transform,
    audio,
    speed,
    color
  };
}

function pruneKeyframesForDuration(clip: TimelineClip, nextDuration: number): TimelineClip["keyframes"] {
  return {
    ...clip.keyframes,
    transform: clip.keyframes?.transform?.filter((keyframe) => keyframe.time <= nextDuration),
    audio: clip.keyframes?.audio?.filter((keyframe) => keyframe.time <= nextDuration),
    speed: clip.keyframes?.speed?.filter((keyframe) => keyframe.time <= nextDuration),
    color: clip.keyframes?.color?.filter((keyframe) => keyframe.time <= nextDuration)
  };
}

function splitKeyframes(clip: TimelineClip, splitOffset: number): [TimelineClip["keyframes"], TimelineClip["keyframes"]] {
  const leftTransform = clip.keyframes?.transform?.filter((keyframe) => keyframe.time <= splitOffset);
  const rightTransform = clip.keyframes?.transform
    ?.filter((keyframe) => keyframe.time >= splitOffset)
    .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID(), time: keyframe.time - splitOffset }));
  const leftAudio = clip.keyframes?.audio?.filter((keyframe) => keyframe.time <= splitOffset);
  const rightAudio = clip.keyframes?.audio
    ?.filter((keyframe) => keyframe.time >= splitOffset)
    .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID(), time: keyframe.time - splitOffset }));
  const leftSpeed = clip.keyframes?.speed?.filter((keyframe) => keyframe.time <= splitOffset);
  const rightSpeed = clip.keyframes?.speed
    ?.filter((keyframe) => keyframe.time >= splitOffset)
    .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID(), time: keyframe.time - splitOffset }));
  const leftColor = clip.keyframes?.color?.filter((keyframe) => keyframe.time <= splitOffset);
  const rightColor = clip.keyframes?.color
    ?.filter((keyframe) => keyframe.time >= splitOffset)
    .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID(), time: keyframe.time - splitOffset }));
  return [
    { ...clip.keyframes, transform: leftTransform, audio: leftAudio, speed: leftSpeed, color: leftColor },
    { ...clip.keyframes, transform: rightTransform, audio: rightAudio, speed: rightSpeed, color: rightColor }
  ];
}

function cloneKeyframes(keyframes: TimelineClip["keyframes"]): TimelineClip["keyframes"] {
  return {
    ...keyframes,
    transform: keyframes?.transform?.map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() })),
    audio: keyframes?.audio?.map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() })),
    speed: keyframes?.speed?.map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() })),
    color: keyframes?.color?.map((keyframe) => ({ ...keyframe, id: crypto.randomUUID(), grade: normalizeColorSettings(keyframe.grade) }))
  };
}

function cloneCompound(compound: TimelineClip["compound"]): TimelineClip["compound"] {
  if (!compound) return undefined;
  return {
    clips: compound.clips.map((item) => ({
      ...item,
      clip: {
        ...item.clip,
        id: crypto.randomUUID(),
        keyframes: cloneKeyframes(item.clip.keyframes),
        compound: cloneCompound(item.clip.compound)
      }
    }))
  };
}

export function isClipCompatibleWithTrack(clipType: ClipType, trackType: TrackType): boolean {
  void clipType;
  void trackType;
  return true;
}

export function trackForAsset(timeline: Timeline, asset: MediaAsset): TimelineTrack {
  const preferredIndex = asset.type === "audio" ? 3 : 2;
  return timeline.tracks[preferredIndex] && !timeline.tracks[preferredIndex].locked
    ? timeline.tracks[preferredIndex]
    : timeline.tracks.find((track) => !track.locked) ?? timeline.tracks[0];
}

function mapClips(timeline: Timeline, mapper: (clip: TimelineClip, track: TimelineTrack) => TimelineClip): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => mapper(clip, track))
    }))
  };
}

export function setSelectedClips(timeline: Timeline, clipIds: string[]): Timeline {
  const selected = new Set(clipIds);
  return {
    ...mapClips(timeline, (clip) => ({ ...clip, selected: selected.has(clip.id) })),
    selectedClipIds: clipIds,
    selectedTransitionId: undefined
  };
}

export function setSelectedTransition(timeline: Timeline, transitionId?: string): Timeline {
  return {
    ...setSelectedClips(timeline, []),
    selectedTransitionId: transitionId && (timeline.transitions ?? []).some((transition) => transition.id === transitionId) ? transitionId : undefined
  };
}

export function addClipToTimeline(timeline: Timeline, clip: TimelineClip): Timeline {
  const targetTrack = findTrack(timeline, clip.trackId);
  if (!targetTrack || targetTrack.locked || !isClipCompatibleWithTrack(clip.type, targetTrack.type)) return timeline;
  const next = {
    ...timeline,
    tracks: timeline.tracks.map((track) => track.id === clip.trackId ? { ...track, clips: [...track.clips, clip] } : track)
  };
  return normalizeTimeline(setSelectedClips(next, [clip.id]));
}

export function removeClips(timeline: Timeline, clipIds: string[]): Timeline {
  const remove = new Set(clipIds);
  const removable = new Set(timeline.tracks.flatMap((track) => track.locked ? [] : track.clips
    .filter((clip) => remove.has(clip.id) && !clip.locked)
    .map((clip) => clip.id)));
  return normalizeTimeline({
    ...timeline,
    selectedClipIds: timeline.selectedClipIds.filter((id) => !removable.has(id)),
    selectedTransitionId: undefined,
    tracks: timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => !removable.has(clip.id)) }))
  });
}

export function canCreateCompoundClip(timeline: Timeline): boolean {
  if (timeline.selectedClipIds.length < 2) return false;
  const selected = new Set(timeline.selectedClipIds);
  const items = timeline.tracks.flatMap((track) => track.clips
    .filter((clip) => selected.has(clip.id))
    .map((clip) => ({ track, clip })));
  return items.length >= 2
    && items.every(({ track, clip }) => !track.locked && !clip.locked && clip.type !== "compound" && clip.type !== "transition");
}

export function createCompoundClipFromSelection(timeline: Timeline): Timeline {
  if (!canCreateCompoundClip(timeline)) return timeline;
  const selected = new Set(timeline.selectedClipIds);
  const items = timeline.tracks.flatMap((track) => track.clips
    .filter((clip) => selected.has(clip.id))
    .map((clip) => ({ track, clip })));
  const start = Math.min(...items.map(({ clip }) => clip.timelineStart));
  const end = Math.max(...items.map(({ clip }) => getClipEnd(clip)));
  const targetTrack = [...items].sort((a, b) => a.track.order - b.track.order)[0].track;
  const duration = Math.max(MIN_CLIP_DURATION, end - start);
  const compound = createClip({
    trackId: targetTrack.id,
    type: "compound",
    name: "Compound Clip",
    timelineStart: start,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    color: "#37516f",
    compound: {
      clips: items.map(({ track, clip }) => ({
        clip: { ...clip, timelineStart: clip.timelineStart - start, selected: false },
        trackOrder: track.order,
        trackMuted: track.muted,
        trackHidden: track.hidden
      }))
    }
  });
  return addClipToTimeline(removeClips(timeline, [...selected]), compound);
}

export function canUncompoundClip(timeline: Timeline, clipId: string): boolean {
  const item = timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.id === clipId);
  return Boolean(
    item
      && item.clip.type === "compound"
      && item.clip.compound?.clips.length
      && !item.clip.locked
      && !item.track.locked
  );
}

export function canExtractAudioFromClip(timeline: Timeline, assets: Record<string, MediaAsset>, clipId: string): boolean {
  const item = timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.id === clipId);
  if (!item || item.track.locked || item.clip.locked || item.clip.type !== "video" || !item.clip.assetId) return false;
  if (item.clip.audio?.muted) return false;
  const asset = assets[item.clip.assetId];
  return Boolean(asset && asset.type === "video" && ((asset.channels ?? 0) > 0 || (asset.sampleRate ?? 0) > 0));
}

export function addExtractedAudioClip(timeline: Timeline, assets: Record<string, MediaAsset>, videoClipId: string, audioAsset: MediaAsset): Timeline {
  if (!canExtractAudioFromClip(timeline, assets, videoClipId) || audioAsset.type !== "audio") return timeline;
  const sourceItem = timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.id === videoClipId);
  if (!sourceItem) return timeline;
  const sourceClip = sourceItem.clip;
  const targetTrack = timeline.tracks.find((track) => !track.locked && track.order > sourceItem.track.order)
    ?? timeline.tracks.find((track) => !track.locked);
  if (!targetTrack) return timeline;

  const audioClip = createClip({
    trackId: targetTrack.id,
    assetId: audioAsset.id,
    type: "audio",
    name: `${sourceClip.name} Audio`,
    timelineStart: sourceClip.timelineStart,
    duration: sourceClip.duration,
    sourceIn: sourceClip.sourceIn,
    sourceOut: sourceClip.sourceOut,
    speed: sourceClip.speed,
    audio: { ...defaultAudioSettings(), muted: false },
    color: "#165da5"
  });
  const mutedVideo = {
    ...sourceClip,
    audio: { ...(sourceClip.audio ?? defaultAudioSettings()), muted: true },
    updatedAt: new Date().toISOString()
  };
  return normalizeTimeline({
    ...timeline,
    selectedClipIds: [audioClip.id],
    tracks: timeline.tracks.map((track) => {
      const baseClips = track.clips.map((clip) => clip.id === sourceClip.id ? mutedVideo : { ...clip, selected: false });
      return track.id === targetTrack.id
        ? { ...track, clips: [...baseClips, audioClip] }
        : { ...track, clips: baseClips };
    })
  });
}

export function uncompoundClip(timeline: Timeline, clipId: string): Timeline {
  if (!canUncompoundClip(timeline, clipId)) return timeline;
  const parentItem = timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.id === clipId);
  if (!parentItem || parentItem.clip.type !== "compound" || !parentItem.clip.compound) return timeline;

  const parent = parentItem.clip;
  const compoundContents = parent.compound;
  if (!compoundContents) return timeline;
  const fallbackTrack = parentItem.track;
  const parentSpeed = clamp(parent.speed || 1, 0.25, 4);
  const windowStart = Math.max(0, parent.sourceIn);
  const windowEnd = windowStart + parent.duration * parentSpeed;
  const restored = compoundContents.clips.flatMap((item) => {
    const childStart = item.clip.timelineStart;
    const childEnd = getClipEnd(item.clip);
    const visibleStart = Math.max(childStart, windowStart);
    const visibleEnd = Math.min(childEnd, windowEnd);
    if (visibleEnd - visibleStart < 0.001) return [];
    const targetTrack = timeline.tracks.find((track) => track.order === item.trackOrder && !track.locked) ?? fallbackTrack;
    const childSpeed = clamp(item.clip.speed || 1, 0.25, 4);
    const duration = (visibleEnd - visibleStart) / parentSpeed;
    const sourceOffset = Math.max(0, visibleStart - childStart) * childSpeed;
    return {
      ...item.clip,
      trackId: targetTrack.id,
      timelineStart: Math.max(0, parent.timelineStart + (visibleStart - windowStart) / parentSpeed),
      duration,
      sourceIn: item.clip.sourceIn + sourceOffset,
      sourceOut: item.clip.sourceIn + sourceOffset + duration * childSpeed,
      hidden: parent.hidden || item.clip.hidden,
      muted: parent.muted || item.clip.muted,
      selected: true,
      updatedAt: new Date().toISOString()
    };
  });
  if (!restored.length) return timeline;
  const restoredIds = restored.map((clip) => clip.id);
  const byTrack = new Map<string, TimelineClip[]>();
  restored.forEach((clip) => {
    byTrack.set(clip.trackId, [...(byTrack.get(clip.trackId) ?? []), clip]);
  });

  return normalizeTimeline({
    ...timeline,
    selectedClipIds: restoredIds,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: [
        ...track.clips.filter((clip) => clip.id !== clipId).map((clip) => ({ ...clip, selected: restoredIds.includes(clip.id) })),
        ...(byTrack.get(track.id) ?? [])
      ]
    }))
  });
}

export function moveClip(timeline: Timeline, clipId: string, start: number, trackId?: string): Timeline {
  const existing = findClip(timeline, clipId);
  if (!existing || existing.locked) return timeline;
  const currentTrack = findTrack(timeline, existing.trackId);
  const targetTrack = findTrack(timeline, trackId ?? existing.trackId);
  if (!targetTrack || targetTrack.locked || currentTrack?.locked || !isClipCompatibleWithTrack(existing.type, targetTrack.type)) return timeline;
  const moved = { ...existing, trackId: targetTrack.id, timelineStart: Math.max(0, start), updatedAt: new Date().toISOString() };
  return normalizeTimeline({
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (track.id === existing.trackId && track.id !== targetTrack.id) {
        return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      }
      if (track.id === targetTrack.id) {
        const without = track.clips.filter((clip) => clip.id !== clipId);
        return { ...track, clips: [...without, moved] };
      }
      return track;
    })
  });
}

export function trimClip(clip: TimelineClip, side: "start" | "end", deltaSeconds: number): TimelineClip {
  if (clip.locked) return clip;
  if (clip.type === "compound") {
    if (side === "start") {
      const delta = clamp(deltaSeconds, -clip.timelineStart, clip.duration - MIN_CLIP_DURATION);
      const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration - delta);
      const speed = clamp(clip.speed || 1, 0.25, 4);
      return {
        ...clip,
        timelineStart: Math.max(0, clip.timelineStart + delta),
        duration: nextDuration,
        sourceIn: Math.max(0, clip.sourceIn + delta * speed),
        updatedAt: new Date().toISOString()
      };
    }
    const delta = Math.max(-clip.duration + MIN_CLIP_DURATION, deltaSeconds);
    const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration + delta);
    return { ...clip, duration: nextDuration, updatedAt: new Date().toISOString() };
  }
  if (clip.type === "image") {
    if (side === "start") {
      const delta = clamp(deltaSeconds, -clip.timelineStart, clip.duration - MIN_CLIP_DURATION);
      const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration - delta);
      return {
        ...clip,
        timelineStart: Math.max(0, clip.timelineStart + delta),
        duration: nextDuration,
        sourceIn: 0,
        sourceOut: nextDuration,
        keyframes: remapKeyframesForTrim(clip, delta, nextDuration),
        updatedAt: new Date().toISOString()
      };
    }
    const delta = Math.max(-clip.duration + MIN_CLIP_DURATION, deltaSeconds);
    const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration + delta);
    return {
      ...clip,
      duration: nextDuration,
      sourceIn: 0,
      sourceOut: nextDuration,
      keyframes: pruneKeyframesForDuration(clip, nextDuration),
      updatedAt: new Date().toISOString()
    };
  }
  if (clip.type === "effect") {
    const maxDuration = 60;
    if (side === "start") {
      const delta = clamp(deltaSeconds, -clip.timelineStart, clip.duration - MIN_CLIP_DURATION);
      const nextDuration = clamp(clip.duration - delta, MIN_CLIP_DURATION, maxDuration);
      return {
        ...clip,
        timelineStart: Math.max(0, clip.timelineStart + delta),
        duration: nextDuration,
        sourceOut: nextDuration,
        effects: normalizeEffects(clip.effects, nextDuration).map((effect) => ({ ...effect, duration: Math.min(effect.duration, nextDuration) })),
        keyframes: remapKeyframesForTrim(clip, delta, nextDuration),
        updatedAt: new Date().toISOString()
      };
    }
    const delta = clamp(deltaSeconds, -clip.duration + MIN_CLIP_DURATION, maxDuration - clip.duration);
    const nextDuration = clamp(clip.duration + delta, MIN_CLIP_DURATION, maxDuration);
    return {
      ...clip,
      duration: nextDuration,
      sourceOut: nextDuration,
      effects: normalizeEffects(clip.effects, nextDuration).map((effect) => ({ ...effect, duration: Math.min(effect.duration + Math.max(0, delta), nextDuration) })),
      keyframes: pruneKeyframesForDuration(clip, nextDuration),
      updatedAt: new Date().toISOString()
    };
  }
  const speed = clamp(clip.speed || 1, 0.25, 4);
  if (side === "start") {
    const maxDelta = clip.duration - MIN_CLIP_DURATION;
    const delta = clamp(deltaSeconds, -clip.sourceIn / speed, maxDelta);
    const sourceDelta = delta * speed;
    const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration - delta);
    return {
      ...clip,
      timelineStart: Math.max(0, clip.timelineStart + delta),
      duration: nextDuration,
      sourceIn: Math.max(0, clip.sourceIn + sourceDelta),
      keyframes: remapKeyframesForTrim(clip, delta, nextDuration),
      updatedAt: new Date().toISOString()
    };
  }
  const currentSourceSpan = clip.duration * speed;
  const sourceRoom = Math.max(0, clip.sourceOut - clip.sourceIn);
  const maxGrow = Math.max(0, (sourceRoom - currentSourceSpan) / speed);
  const delta = clamp(deltaSeconds, -clip.duration + MIN_CLIP_DURATION, Math.max(maxGrow, 0));
  const sourceDelta = delta * speed;
  const nextDuration = Math.max(MIN_CLIP_DURATION, clip.duration + delta);
  return {
    ...clip,
    duration: nextDuration,
    sourceOut: Math.max(clip.sourceIn + MIN_CLIP_DURATION, clip.sourceOut + sourceDelta),
    keyframes: pruneKeyframesForDuration(clip, nextDuration),
    updatedAt: new Date().toISOString()
  };
}

export function trimClipInTimeline(timeline: Timeline, clipId: string, side: "start" | "end", delta: number): Timeline {
  return normalizeTimeline(mapClips(timeline, (clip, track) => track.locked || clip.id !== clipId ? clip : trimClip(clip, side, delta)));
}

export function splitClip(clip: TimelineClip, at: number): [TimelineClip, TimelineClip] | null {
  if (clip.locked || at <= clip.timelineStart + 0.05 || at >= getClipEnd(clip) - 0.05) return null;
  const splitOffset = at - clip.timelineStart;
  const speed = clamp(clip.speed || 1, 0.25, 4);
  const sourceSplit = clip.sourceIn + splitOffset * speed;
  const leftDuration = splitOffset;
  const rightDuration = clip.duration - leftDuration;
  const now = new Date().toISOString();
  const [leftKeyframes, rightKeyframes] = splitKeyframes(clip, splitOffset);
  const left = {
    ...clip,
    duration: leftDuration,
    sourceOut: sourceSplit,
    keyframes: leftKeyframes,
    selected: false,
    updatedAt: now
  };
  const right = {
    ...clip,
    id: crypto.randomUUID(),
    timelineStart: at,
    duration: rightDuration,
    sourceIn: sourceSplit,
    sourceOut: clip.sourceOut,
    compound: cloneCompound(clip.compound),
    keyframes: rightKeyframes,
    selected: true,
    createdAt: now,
    updatedAt: now
  };
  return [left, right];
}

export function splitClipInTimeline(timeline: Timeline, clipId: string, at: number): Timeline | null {
  let replacement: [TimelineClip, TimelineClip] | null = null;
  let newSelectedId: string | null = null;
  const tracks = timeline.tracks.map((track) => {
    const clip = track.clips.find((item) => item.id === clipId);
    if (!clip || track.locked) return track;
    replacement = splitClip(clip, at);
    if (!replacement) return track;
    newSelectedId = replacement[1].id;
    return { ...track, clips: track.clips.flatMap((item) => item.id === clipId ? replacement! : [item]) };
  });
  if (!replacement || !newSelectedId) return null;
  return normalizeTimeline(setSelectedClips({ ...timeline, tracks }, [newSelectedId]));
}

export function duplicateSelectedClips(timeline: Timeline): Timeline {
  const ids = new Set(timeline.selectedClipIds);
  const now = new Date().toISOString();
  const newIds: string[] = [];
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: [
      ...track.clips,
      ...track.clips.filter((clip) => ids.has(clip.id) && !clip.locked && !track.locked).map((clip) => {
        const duplicate = {
          ...clip,
          id: crypto.randomUUID(),
          timelineStart: getClipEnd(clip) + 0.1,
          keyframes: cloneKeyframes(clip.keyframes),
          compound: cloneCompound(clip.compound),
          selected: true,
          createdAt: now,
          updatedAt: now
        };
        newIds.push(duplicate.id);
        return duplicate;
      })
    ]
  }));
  return newIds.length ? normalizeTimeline(setSelectedClips({ ...timeline, tracks }, newIds)) : timeline;
}

export function updateClip(timeline: Timeline, clipId: string, patch: Partial<TimelineClip>): Timeline {
  return normalizeTimeline(mapClips(timeline, (clip, track) => {
    if (clip.id !== clipId || clip.locked || track.locked) return clip;
    return { ...clip, ...patch, updatedAt: new Date().toISOString() };
  }));
}

export function updateTrack(timeline: Timeline, trackId: string, patch: Partial<TimelineTrack>): Timeline {
  return normalizeTimeline({
    ...timeline,
    tracks: timeline.tracks.map((track) => track.id === trackId ? { ...track, ...patch } : track)
  });
}

export function addTrack(timeline: Timeline, type: TrackType): Timeline {
  void type;
  const count = timeline.tracks.length + 1;
  const id = `layer-${crypto.randomUUID().slice(0, 6)}`;
  return normalizeTimeline({
    ...timeline,
    tracks: [
      ...timeline.tracks,
      { id, name: `Layer ${count}`, type: "overlay", order: timeline.tracks.length, locked: false, muted: false, hidden: false, height: 58, clips: [] }
    ]
  });
}

export function normalizeTimeline(timeline: Timeline): Timeline {
  const normalizeClip = (clip: TimelineClip): TimelineClip => ({
    ...clip,
    colorAdjustments: clip.type === "video" || clip.type === "image" || clip.type === "filter" ? normalizeColorSettings(clip.colorAdjustments) : clip.colorAdjustments,
    text: clip.type === "text" ? normalizeTextSettings(clip.text) : clip.text,
    textAnimations: clip.type === "text" ? normalizeTextClipAnimations(clip.textAnimations) : clip.textAnimations,
    videoAnimations: clip.type === "video" || clip.type === "image" ? normalizeVideoClipAnimations(clip.videoAnimations) : clip.videoAnimations,
    effects: normalizeEffects(clip.effects, clip.duration),
    masks: isMaskCompatible(clip.type) ? normalizeMasks(clip.masks, timeline) : clip.masks,
    backgroundRemoval: clip.type === "video" || clip.type === "image" ? normalizeBackgroundRemovalSettings(clip.backgroundRemoval) : clip.backgroundRemoval,
    compound: clip.compound ? {
      clips: clip.compound.clips.map((item) => ({ ...item, clip: normalizeClip(item.clip) }))
    } : undefined
  });
  const sortedTracks = timeline.tracks
    .map((track, order) => ({
      ...track,
      name: `Layer ${order + 1}`,
      type: "overlay" as TrackType,
      order,
      clips: [...track.clips]
        .map(normalizeClip)
        .sort((a, b) => a.timelineStart - b.timelineStart)
    }))
    .sort((a, b) => a.order - b.order);
  const normalizedBase = { ...timeline, tracks: sortedTracks };
  const transitions = cleanupTransitions(normalizedBase);
  const duration = timelineDuration({ ...normalizedBase, transitions });
  return {
    ...timeline,
    tracks: sortedTracks,
    markers: (timeline.markers ?? []).map((marker) => ({ ...marker, time: clamp(marker.time, 0, duration) })).sort((a, b) => a.time - b.time),
    transitions,
    duration,
    playhead: clamp(timeline.playhead, 0, duration),
    selectedClipIds: timeline.selectedClipIds.filter((id) => sortedTracks.some((track) => track.clips.some((clip) => clip.id === id))),
    selectedTransitionId: transitions.some((transition) => transition.id === timeline.selectedTransitionId) ? timeline.selectedTransitionId : undefined
  };
}

export function resetTransformForTimeline(timeline: Pick<Timeline, "width" | "height">): Transform {
  return defaultTransform({ width: timeline.width, height: timeline.height, fps: 30, sampleRate: 48000 });
}

export function centerTransform(transform: Transform, timeline: Pick<Timeline, "width" | "height">): Transform {
  return { ...transform, x: timeline.width / 2, y: timeline.height / 2 };
}

export function scaleTransformToFit(transform: Transform, timeline: Pick<Timeline, "width" | "height">, source?: Pick<MediaAsset, "width" | "height">, mode: "fit" | "fill" = "fit"): Transform {
  const sourceWidth = source?.width || timeline.width;
  const sourceHeight = source?.height || timeline.height;
  const scaleX = timeline.width / sourceWidth;
  const scaleY = timeline.height / sourceHeight;
  return { ...centerTransform(transform, timeline), scale: mode === "fit" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY) };
}

export function finalizeProject(project: Project): Project {
  const timeline = normalizeTimeline(project.timeline);
  return {
    ...project,
    version: PROJECT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings: {
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      sampleRate: timeline.sampleRate
    },
    timeline
  };
}

export function buildExportPlan(project: Project): { clips: ExportRenderClip[]; transitions: ExportRenderTransition[]; warnings: string[]; duration: number } {
  const warnings: string[] = [];
  const resolvedClips = playbackClips(project.timeline);
  const clips = resolvedClips
    .filter(({ track }) => !track.hidden && !track.locked)
    .filter(({ clip }) => !clip.hidden && (clip.type === "video" || clip.type === "image") && clip.assetId)
    .sort((a, b) => a.clip.timelineStart - b.clip.timelineStart)
    .flatMap(({ track, clip }) => {
      const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
      if (!asset || (asset.type !== "video" && asset.type !== "image")) {
        warnings.push(`${clip.name} is not a visual clip and will not be rendered by the MVP exporter.`);
        return [];
      }
      return [{
        id: clip.id,
        sourcePath: asset.path,
        sourceType: asset.type,
        sourceIn: clip.sourceIn,
        duration: sourceDuration(clip),
        speed: clamp(clip.speed || 1, 0.25, 4),
        timelineStart: clip.timelineStart,
        trackId: track.id,
        includeAudio: asset.type === "video" && !track.muted && !clip.muted && !clip.audio?.muted,
        effects: normalizeEffects(clip.effects, clip.duration).filter((effect) => effect.enabled),
        colorGrade: exportColorGrade(clip.colorAdjustments),
        masks: normalizeMasks(clip.masks, project.timeline).filter((mask) => mask.enabled),
        backgroundRemoval: clip.type === "video" || clip.type === "image" ? normalizeBackgroundRemovalSettings(clip.backgroundRemoval) : undefined,
        videoAnimations: normalizeVideoClipAnimations(clip.videoAnimations)
      }];
    });

  const unsupported = resolvedClips.map(({ clip }) => clip).filter((clip) => clip.type === "text" || clip.type === "effect" || clip.type === "filter" || clip.type === "transition");
  if (unsupported.length) warnings.push("Text, effects, filters, and legacy transition clips are previewed/structured but not burned into MVP exports yet.");
  const transitions = (project.timeline.transitions ?? []).flatMap((transition) => {
    const range = transitionTimeRange(project.timeline, transition);
    if (!range) return [];
    const mapping = transitionExportMapping(transition);
    return [{
      ...transition,
      start: range.start,
      end: range.end,
      ffmpegXfade: mapping.ffmpegXfade,
      compatibility: mapping.compatibility
    }];
  });
  if (transitions.some((transition) => transition.compatibility === "fully-supported")) warnings.push("Supported timeline transitions are mapped to FFmpeg xfade names in the render plan; layered preview/export parity is approximate in this MVP exporter.");
  const unsupportedTransitions = transitions.filter((transition) => transition.compatibility !== "fully-supported");
  if (unsupportedTransitions.length) warnings.push(`Some transitions preview/save but need the next compositor/export pass for exact output: ${[...new Set(unsupportedTransitions.map((transition) => transition.type))].join(", ")}.`);
  const unsupportedEffects = resolvedClips.flatMap(({ clip }) => unsupportedExportEffects(clip.effects));
  if (unsupportedEffects.length) warnings.push(`Some animated effects are preview-only in MVP export: ${[...new Set(unsupportedEffects)].join(", ")}.`);
  const supportedEffects = resolvedClips.some(({ clip }) => normalizeEffects(clip.effects, clip.duration).some((effect) => exportFilterForEffect(effect)));
  if (supportedEffects) warnings.push("Supported effect filters are applied during export, but layered browser overlays may not match preview pixel-for-pixel.");
  const approximateColor = resolvedClips.some(({ clip }) => (clip.type === "video" || clip.type === "image") && exportColorGrade(clip.colorAdjustments).compatibility === "approximate");
  if (approximateColor) warnings.push("Some advanced color modules are preview-structured but approximate in MVP export.");
  const masked = resolvedClips.map(({ clip }) => clip).filter((clip) => normalizeMasks(clip.masks, project.timeline).some((mask) => mask.enabled));
  if (masked.length) warnings.push("Masks preview and save in the editor, but MVP export warns because browser SVG masks are not yet reproduced pixel-perfectly by FFmpeg.");
  const keyed = resolvedClips.map(({ clip }) => clip).filter((clip) => (clip.type === "video" || clip.type === "image") && normalizeBackgroundRemovalSettings(clip.backgroundRemoval).enabled);
  if (keyed.length) {
    const unsupportedKeyed = keyed.filter((clip) => normalizeBackgroundRemovalSettings(clip.backgroundRemoval).exportStatus === "unsupported");
    warnings.push("Background removal can be GPU heavy during preview; lower preview quality if playback stutters.");
    if (unsupportedKeyed.length) warnings.push("Difference Key background removal previews/saves, but MVP export marks it unsupported until reference-frame compositing is added.");
    else warnings.push("Green, blue, custom color, and luma background-removal settings are mapped to FFmpeg filters for export; edge cleanup may be approximate.");
  }
  const unsupportedVideoAnimations = allClips(project.timeline)
    .filter((clip) => clip.type === "video" || clip.type === "image")
    .flatMap((clip) => {
      const animations = normalizeVideoClipAnimations(clip.videoAnimations);
      return [animations.in, animations.out]
        .filter((animation) => animation.enabled && animation.type !== "none" && animation.type !== "fade" && animation.type !== "blur")
        .map((animation) => animation.type);
    });
  if (unsupportedVideoAnimations.length) {
    warnings.push(`Fade and blur clip animations are exported; these clip animations currently preview/save but require the next compositor pass for matching export: ${[...new Set(unsupportedVideoAnimations)].join(", ")}.`);
  }
  const automated = allClips(project.timeline).filter((clip) => (clip.keyframes?.transform?.length ?? 0) > 0 || (clip.keyframes?.audio?.length ?? 0) > 0 || (clip.keyframes?.color?.length ?? 0) > 0);
  if (automated.length) warnings.push("Keyframed animation and volume automation preview in the editor but are not rendered by the MVP exporter yet.");
  const animatedText = allClips(project.timeline).filter((clip) => clip.type === "text" && (
    normalizeTextClipAnimations(clip.textAnimations).in.enabled || normalizeTextClipAnimations(clip.textAnimations).out.enabled
  ));
  if (animatedText.length) warnings.push("Text animations preview and save in the editor, but MVP export does not burn animated text into the rendered video yet.");
  return { clips, transitions, warnings: [...new Set(warnings)], duration: timelineContentDuration(project.timeline) };
}

export function buildAudioExportPlan(project: Project): { clips: ExportAudioClip[]; warnings: string[]; duration: number } {
  const warnings: string[] = [];
  const clips = playbackClips(project.timeline)
    .filter(({ track, clip }) => !track.hidden && !track.muted && !clip.hidden && !clip.muted && !clip.audio?.muted)
    .filter(({ clip }) => (clip.type === "audio" || clip.type === "video") && clip.assetId)
    .flatMap(({ clip }) => {
      const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
      if (!asset || (asset.type !== "audio" && asset.type !== "video")) return [];
      const audio = evaluateAudioAtTime(clip, clip.timelineStart);
      return [{
        id: clip.id,
        sourcePath: asset.path,
        sourceIn: clip.sourceIn,
        duration: sourceDuration(clip),
        timelineStart: clip.timelineStart,
        speed: clamp(clip.speed || 1, 0.25, 4),
        volume: clamp(audio.volume, 0, 2),
        fadeIn: Math.max(0, clip.audio?.fadeIn ?? 0),
        fadeOut: Math.max(0, clip.audio?.fadeOut ?? 0)
      }];
    })
    .sort((a, b) => a.timelineStart - b.timelineStart);
  const automated = playbackClips(project.timeline).some(({ clip }) => (clip.keyframes?.audio?.length ?? 0) > 0);
  if (automated) warnings.push("Audio keyframes are previewed in the editor; audio-only export uses the clip volume at the clip start for this MVP mix.");
  return { clips, warnings, duration: timelineContentDuration(project.timeline) };
}

type V1Asset = {
  id: string;
  path: string;
  name: string;
  mediaType?: string;
  type?: string;
  duration?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  thumbnailPath?: string;
  waveform?: number[];
  waveformPeaks?: number[];
  trimIn?: number;
  trimOut?: number;
  importedAt?: string;
};

type V1Clip = {
  id: string;
  trackId: string;
  assetId?: string;
  type: string;
  name: string;
  timelineStart: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  transform?: Transform;
  volume?: number;
  speed?: number;
  text?: Partial<TextSettings>;
  crop?: TimelineClip["crop"];
  color?: string;
};

type V1Track = {
  id: string;
  name: string;
  type: TrackType;
  visible?: boolean;
  hidden?: boolean;
  muted?: boolean;
  locked?: boolean;
  height?: number;
  clips?: V1Clip[];
};

export function migrateProject(raw: unknown): Project {
  const parsed = raw as Partial<Project> & {
    timeline?: Partial<Timeline> & { clips?: Record<string, V1Clip>; tracks?: V1Track[] };
    assets?: Record<string, V1Asset>;
  };
  if (!parsed?.id || !parsed.timeline || !parsed.assets) {
    throw new Error("Invalid Mahee Motion project file.");
  }
  if (parsed.version === PROJECT_SCHEMA_VERSION && parsed.settings && Array.isArray(parsed.timeline.tracks) && !("clips" in parsed.timeline)) {
    return finalizeProject(parsed as Project);
  }

  const settings = parsed.settings ?? defaultProjectSettings();
  const oldTracks = (parsed.timeline?.tracks ?? []) as V1Track[];
  const tracks: TimelineTrack[] = createTracks().map((track) => {
    const legacyId = legacyTrackIdForLayer(track.id);
    const oldTrack = oldTracks.find((item) => item.id === track.id || item.id === legacyId);
    return {
      ...track,
      name: track.name,
      type: "overlay",
      locked: oldTrack?.locked ?? false,
      muted: oldTrack?.muted ?? false,
      hidden: oldTrack?.hidden ?? (oldTrack?.visible === false),
      height: oldTrack?.height ?? track.height,
      clips: [] as TimelineClip[]
    };
  });
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const oldClips = Object.values(parsed.timeline.clips ?? {}).concat(oldTracks.flatMap((track) => track.clips ?? []));
  for (const oldClip of oldClips) {
    const asset = oldClip.assetId ? parsed.assets[oldClip.assetId] : undefined;
    const type = toClipType(oldClip.type, asset);
    const fallbackTrack = legacyLayerForTrack(oldClip.trackId);
    const trackId = byId.has(oldClip.trackId) ? oldClip.trackId : fallbackTrack;
    byId.get(trackId)?.clips.push(createClip({
      id: oldClip.id,
      trackId,
      assetId: oldClip.assetId,
      type,
      name: oldClip.name,
      timelineStart: oldClip.timelineStart,
      duration: oldClip.duration,
      sourceIn: oldClip.sourceIn,
      sourceOut: oldClip.sourceOut,
      transform: oldClip.transform,
      crop: oldClip.crop,
      audio: { ...defaultAudioSettings(), volume: oldClip.volume ?? 1 },
      speed: oldClip.speed ?? 1,
      text: oldClip.text ? normalizeTextSettings(oldClip.text) : undefined,
      color: oldClip.color,
      createdAt: parsed.createdAt
    }));
  }

  const assets = Object.fromEntries(Object.entries(parsed.assets).flatMap(([id, asset]) => {
    const type = normalizeMediaType(asset.mediaType ?? asset.type);
    if (type === "unknown") return [];
    return [[id, {
      id: asset.id ?? id,
      path: asset.path,
      name: asset.name,
      type,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      fps: asset.fps ?? asset.frameRate,
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      thumbnailPath: asset.thumbnailPath,
      waveformPeaks: asset.waveformPeaks ?? asset.waveform ?? [],
      trimIn: asset.trimIn,
      trimOut: asset.trimOut,
      importedAt: asset.importedAt ?? parsed.createdAt ?? new Date().toISOString()
    } satisfies MediaAsset]];
  }));

  return finalizeProject({
    id: parsed.id,
    name: parsed.name ?? "Unknown",
    version: PROJECT_SCHEMA_VERSION,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    settings,
    assets,
    timeline: {
      duration: parsed.timeline.duration ?? 60,
      fps: parsed.timeline.fps ?? settings.fps,
      width: parsed.timeline.width ?? settings.width,
      height: parsed.timeline.height ?? settings.height,
      sampleRate: parsed.timeline.sampleRate ?? settings.sampleRate,
      tracks,
      markers: parsed.timeline.markers ?? [],
      transitions: parsed.timeline.transitions ?? [],
      playhead: parsed.timeline.playhead ?? 0,
      zoom: parsed.timeline.zoom ?? 10,
      selectedClipIds: parsed.timeline.selectedClipIds ?? [],
      selectedTransitionId: parsed.timeline.selectedTransitionId
    },
    exportSettings: parsed.exportSettings ?? {
      outputPath: "",
      resolution: "1080p",
      aspectRatio: "16:9",
      frameRate: 30,
      videoBitrate: "8M",
      audioBitrate: "192k"
    },
    cache: parsed.cache ?? {}
  });
}

function normalizeMediaType(value?: string): MediaAsset["type"] | "unknown" {
  if (value === "video" || value === "audio" || value === "image") return value;
  return "unknown";
}

function legacyTrackIdForLayer(layerId: string): string | undefined {
  const index = Number(layerId.replace("layer-", ""));
  return ["v3", "v2", "v1", "a1", "a2", "t1"][index - 1];
}

function legacyLayerForTrack(trackId: string): string {
  const legacy = ["v3", "v2", "v1", "a1", "a2", "t1"];
  const index = legacy.indexOf(trackId);
  return index >= 0 ? `layer-${index + 1}` : "layer-1";
}

function toClipType(value: string, asset?: V1Asset): ClipType {
  if (value === "text" || value === "effect" || value === "filter" || value === "transition") return value;
  const assetType = normalizeMediaType(asset?.mediaType ?? asset?.type);
  if (assetType === "audio") return "audio";
  if (assetType === "image") return "image";
  return "video";
}

export function serializeProject(project: Project): string {
  return JSON.stringify(finalizeProject(project), null, 2);
}

export function parseProject(json: string): Project {
  return migrateProject(JSON.parse(json));
}
