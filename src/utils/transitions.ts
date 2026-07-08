import type { CSSProperties } from "react";
import type { Timeline, TimelineClip, TransitionDirection, TransitionEasing, TransitionInstance, TransitionPlacement } from "../types/editor";

export type TransitionCategory = "Basic" | "Camera" | "Blur" | "Light" | "Glitch" | "Wipe" | "Stylized";
export type TransitionCompatibility = "fully-supported" | "approximate" | "unsupported";

export interface TransitionDefinition {
  id: string;
  name: string;
  category: TransitionCategory;
  previewPath: string;
  defaultDuration: number;
  defaultDirection?: TransitionDirection;
  defaultIntensity?: number;
  defaultSoftness?: number;
  defaultBlurAmount?: number;
  defaultZoomAmount?: number;
  defaultRotation?: number;
  defaultColor?: string;
  ffmpegXfade?: string;
  compatibility: TransitionCompatibility;
}

export interface TransitionDropZone {
  valid: boolean;
  reason?: string;
  trackId?: string;
  placement?: TransitionPlacement;
  leftClipId?: string;
  rightClipId?: string;
  time: number;
  duration: number;
}

export const transitionDefinitions: TransitionDefinition[] = [
  def("cross-dissolve", "Cross Dissolve", "Basic", "fade", "fully-supported", 0.85, { defaultIntensity: 0.9 }),
  def("fade-black", "Fade to Black", "Basic", "fadeblack", "fully-supported", 0.85, { defaultColor: "#000000", defaultIntensity: 0.95 }),
  def("dip-white", "Dip to White", "Basic", "fadewhite", "fully-supported", 0.75, { defaultColor: "#ffffff", defaultIntensity: 0.95 }),
  def("slide-left", "Slide Left", "Basic", "slideleft", "fully-supported", 0.78, { defaultDirection: "left", defaultIntensity: 1 }),
  def("slide-right", "Slide Right", "Basic", "slideright", "fully-supported", 0.78, { defaultDirection: "right", defaultIntensity: 1 }),
  def("slide-up", "Slide Up", "Basic", "slideup", "fully-supported", 0.78, { defaultDirection: "up", defaultIntensity: 1 }),
  def("slide-down", "Slide Down", "Basic", "slidedown", "fully-supported", 0.78, { defaultDirection: "down", defaultIntensity: 1 }),
  def("push", "Push", "Camera", "pushleft", "fully-supported", 0.72, { defaultDirection: "left", defaultIntensity: 1 }),
  def("wipe", "Wipe", "Wipe", "wipeleft", "fully-supported", 0.7, { defaultDirection: "left", defaultSoftness: 0.08, defaultIntensity: 1 }),
  def("zoom", "Zoom", "Camera", "zoomin", "fully-supported", 0.68, { defaultZoomAmount: 0.42, defaultIntensity: 1 }),
  def("blur", "Blur", "Blur", "fade", "approximate", 0.7, { defaultBlurAmount: 24, defaultIntensity: 0.95 }),
  def("spin", "Spin", "Stylized", "fade", "approximate", 0.68, { defaultRotation: 260, defaultIntensity: 0.9, defaultZoomAmount: 0.2 }),
  def("whip-pan", "Whip Pan", "Camera", "smoothleft", "approximate", 0.5, { defaultDirection: "left", defaultBlurAmount: 34, defaultIntensity: 1 }),
  def("flash", "Flash", "Light", "fadewhite", "fully-supported", 0.42, { defaultColor: "#ffffff", defaultIntensity: 1 }),
  def("light-leak", "Light Leak", "Light", undefined, "approximate", 0.78, { defaultColor: "#ff9f45", defaultIntensity: 1 }),
  def("glitch", "Glitch", "Glitch", undefined, "unsupported", 0.55, { defaultIntensity: 1, defaultSoftness: 0.06 }),
  def("rgb-split", "RGB Split", "Glitch", undefined, "unsupported", 0.55, { defaultIntensity: 0.95 }),
  def("luma-fade", "Luma Fade", "Stylized", "fade", "approximate", 0.72, { defaultSoftness: 0.18, defaultIntensity: 0.92 }),
  def("mask-reveal", "Mask Reveal", "Wipe", "circleopen", "approximate", 0.75, { defaultSoftness: 0.08, defaultIntensity: 1 }),
  def("film-burn", "Film Burn", "Light", undefined, "unsupported", 0.75, { defaultColor: "#ff6f1f", defaultIntensity: 1 })
];

export const transitionCategories: TransitionCategory[] = ["Basic", "Camera", "Blur", "Light", "Glitch", "Wipe", "Stylized"];

export function transitionDefinition(type: string): TransitionDefinition {
  return transitionDefinitions.find((item) => item.id === type) ?? transitionDefinitions[0];
}

export function createTransition(type: string, zone: TransitionDropZone): TransitionInstance {
  const definition = transitionDefinition(type);
  return normalizeTransition({
    id: crypto.randomUUID(),
    type: definition.id,
    leftClipId: zone.leftClipId,
    rightClipId: zone.rightClipId,
    placement: zone.placement ?? "between",
    duration: zone.duration || definition.defaultDuration,
    easing: "ease-in-out",
    direction: definition.defaultDirection,
    intensity: definition.defaultIntensity ?? 0.7,
    softness: definition.defaultSoftness ?? 0.2,
    blurAmount: definition.defaultBlurAmount ?? 0,
    zoomAmount: definition.defaultZoomAmount ?? 0.16,
    rotation: definition.defaultRotation ?? 0,
    color: definition.defaultColor,
    reversed: false
  });
}

export function normalizeTransition(input: Partial<TransitionInstance>): TransitionInstance {
  const definition = transitionDefinition(input.type ?? "cross-dissolve");
  return {
    id: input.id ?? crypto.randomUUID(),
    type: definition.id,
    leftClipId: input.leftClipId,
    rightClipId: input.rightClipId,
    placement: input.placement ?? "between",
    duration: clamp(input.duration ?? definition.defaultDuration, 0.05, 60),
    easing: normalizeEasing(input.easing),
    direction: input.direction ?? definition.defaultDirection,
    intensity: clamp(input.intensity ?? definition.defaultIntensity ?? 0.7, 0, 1),
    softness: clamp(input.softness ?? definition.defaultSoftness ?? 0.2, 0, 1),
    blurAmount: clamp(input.blurAmount ?? definition.defaultBlurAmount ?? 0, 0, 80),
    zoomAmount: clamp(input.zoomAmount ?? definition.defaultZoomAmount ?? 0.16, 0, 2),
    rotation: clamp(input.rotation ?? definition.defaultRotation ?? 0, -720, 720),
    color: input.color ?? definition.defaultColor,
    reversed: Boolean(input.reversed)
  };
}

export function normalizeTransitions(input?: Array<Partial<TransitionInstance>>): TransitionInstance[] {
  return (input ?? []).map(normalizeTransition);
}

export function cleanupTransitions(timeline: Timeline): TransitionInstance[] {
  const clips = new Map(timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
  return normalizeTransitions(timeline.transitions)
    .flatMap((transition) => {
      const left = transition.leftClipId ? clips.get(transition.leftClipId) : undefined;
      const right = transition.rightClipId ? clips.get(transition.rightClipId) : undefined;
      if (transition.placement === "between") {
        if (!left || !right || !isVisualClip(left) || !isVisualClip(right)) return [];
        return [{ ...transition, duration: clampTransitionDuration(transition.duration, left, right, "between") }];
      }
      const clip = transition.placement === "in" ? right : left;
      if (!clip || !isVisualClip(clip)) return [];
      return [{ ...transition, duration: clampTransitionDuration(transition.duration, transition.placement === "out" ? clip : undefined, transition.placement === "in" ? clip : undefined, transition.placement) }];
    });
}

export function transitionTimeRange(timeline: Timeline, transition: TransitionInstance): { start: number; end: number; center: number } | undefined {
  const clips = allTimelineClips(timeline);
  const left = transition.leftClipId ? clips.get(transition.leftClipId) : undefined;
  const right = transition.rightClipId ? clips.get(transition.rightClipId) : undefined;
  if (transition.placement === "between" && left && right) {
    const center = (getClipEnd(left) + right.timelineStart) / 2;
    return { center, start: center - transition.duration / 2, end: center + transition.duration / 2 };
  }
  if (transition.placement === "in" && right) {
    return { center: right.timelineStart, start: right.timelineStart, end: right.timelineStart + transition.duration };
  }
  if (transition.placement === "out" && left) {
    const end = getClipEnd(left);
    return { center: end, start: end - transition.duration, end };
  }
  return undefined;
}

export function transitionDropZone(timeline: Timeline, trackId: string | undefined, time: number, requestedDuration = 0.8): TransitionDropZone {
  if (!trackId) return { valid: false, reason: "Drop on a visual layer.", time, duration: requestedDuration };
  const track = timeline.tracks.find((item) => item.id === trackId);
  if (!track || track.locked) return { valid: false, reason: "Layer is locked.", trackId, time, duration: requestedDuration };
  const visual = track.clips.filter(isVisualClip).sort((a, b) => a.timelineStart - b.timelineStart);
  if (!visual.length) return { valid: false, reason: "Transitions need video or image clips.", trackId, time, duration: requestedDuration };
  const snap = 0.75;
  for (let index = 0; index < visual.length - 1; index += 1) {
    const left = visual[index];
    const right = visual[index + 1];
    const cut = getClipEnd(left);
    const gap = Math.max(0, right.timelineStart - cut);
    const cutTarget = gap > 0 ? cut + gap / 2 : cut;
    if (gap <= 0.5 && (Math.abs(time - cutTarget) <= snap || Math.abs(time - cut) <= snap || Math.abs(time - right.timelineStart) <= snap)) {
      return {
        valid: true,
        trackId,
        placement: "between",
        leftClipId: left.id,
        rightClipId: right.id,
        time: cutTarget,
        duration: clampTransitionDuration(requestedDuration, left, right, "between")
      };
    }
  }
  for (const clip of visual) {
    if (Math.abs(time - clip.timelineStart) <= snap) {
      return {
        valid: true,
        trackId,
        placement: "in",
        rightClipId: clip.id,
        time: clip.timelineStart,
        duration: clampTransitionDuration(requestedDuration, undefined, clip, "in")
      };
    }
    const end = getClipEnd(clip);
    if (Math.abs(time - end) <= snap) {
      return {
        valid: true,
        trackId,
        placement: "out",
        leftClipId: clip.id,
        time: end,
        duration: clampTransitionDuration(requestedDuration, clip, undefined, "out")
      };
    }
  }
  return { valid: false, reason: "Drop near a cut or clip edge.", trackId, time, duration: requestedDuration };
}

export function nearestTransitionDropZone(timeline: Timeline, time: number, requestedDuration = 0.8): TransitionDropZone {
  const zones = timeline.tracks
    .filter((track) => !track.locked)
    .map((track) => transitionDropZone(timeline, track.id, time, requestedDuration))
    .filter((zone) => zone.valid && zone.trackId)
    .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time));
  if (zones[0]) return zones[0];
  const firstEditableVisualTrack = timeline.tracks.find((track) => !track.locked && track.clips.some(isVisualClip));
  return {
    valid: false,
    reason: firstEditableVisualTrack ? "Move the playhead near a visual cut or clip edge." : "Add at least one video or image clip first.",
    trackId: firstEditableVisualTrack?.id,
    time,
    duration: requestedDuration
  };
}

export function transitionPreviewStyle(transition: TransitionInstance, clip: TimelineClip, timeline: Timeline, time: number): CSSProperties {
  const range = transitionTimeRange(timeline, transition);
  if (!range || time < range.start || time > range.end) return {};
  const raw = transition.duration <= 0 ? 1 : (time - range.start) / transition.duration;
  const progress = easeProgress(transition.reversed ? 1 - raw : raw, transition.easing);
  const isLeft = transition.leftClipId === clip.id;
  const isRight = transition.rightClipId === clip.id;
  const direction = transition.direction ?? "left";
  const intensity = transition.intensity ?? 0.7;
  const pulse = Math.sin(progress * Math.PI);
  const hardPulse = Math.sin(progress * Math.PI * 2);
  const style: CSSProperties = {};
  switch (transition.type) {
    case "cross-dissolve":
      if (transition.placement === "in" && isRight) style.opacity = Math.min(1, progress * 1.15);
      else if (transition.placement === "out" && isLeft) style.opacity = Math.max(0, 1 - progress * 1.15);
      else if (isLeft) style.opacity = Math.max(0, 1 - progress * 1.12);
      else if (isRight) style.opacity = Math.min(1, progress * 1.12);
      break;
    case "fade-black":
    case "dip-white":
      style.filter = `brightness(${transition.type === "fade-black" ? 1 - pulse * intensity * 0.65 : 1 + pulse * intensity * 1.05}) saturate(${1 - pulse * 0.22})`;
      if (isLeft) style.opacity = Math.max(0.12, 1 - progress * 0.92);
      if (isRight) style.opacity = Math.min(1, progress * 1.14);
      break;
    case "flash":
      style.filter = `brightness(${1 + pulse * intensity * 1.8}) contrast(${1 + pulse * 0.35}) saturate(${1 - pulse * 0.15})`;
      style.opacity = isLeft ? Math.max(0.25, 1 - progress * 0.75) : Math.min(1, progress * 1.35);
      break;
    case "light-leak":
      style.filter = `brightness(${1 + pulse * intensity * 1.1}) sepia(${pulse * 0.45}) saturate(${1 + pulse * 0.75}) hue-rotate(${hardPulse * 8}deg)`;
      style.opacity = isLeft ? Math.max(0.22, 1 - progress * 0.62) : Math.min(1, progress * 1.22);
      style.scale = `${1 + pulse * 0.06}`;
      break;
    case "film-burn":
      style.filter = `brightness(${1 + pulse * intensity * 1.45}) contrast(${1 + pulse * 0.55}) sepia(${pulse * 0.8}) saturate(${1 + pulse * 1.1}) hue-rotate(${-18 + progress * 30}deg)`;
      style.opacity = isLeft ? Math.max(0.18, 1 - progress * 0.72) : Math.min(1, progress * 1.28);
      style.scale = `${1 + pulse * 0.08}`;
      break;
    case "slide-left":
    case "slide-right":
    case "slide-up":
    case "slide-down": {
      const sign = direction === "right" || direction === "down" ? 1 : -1;
      const axis = direction === "up" || direction === "down" ? "Y" : "X";
      const amount = (isRight ? 1 - progress : -progress) * sign * 118 * intensity;
      style.translate = axis === "X" ? `${amount}% 0` : `0 ${amount}%`;
      style.opacity = isRight ? Math.min(1, 0.15 + progress * 1.15) : Math.max(0.08, 1 - progress * 1.05);
      style.filter = `brightness(${1 + pulse * 0.16})`;
      break;
    }
    case "push":
    case "whip-pan": {
      const sign = direction === "right" || direction === "down" ? 1 : -1;
      const axis = direction === "up" || direction === "down" ? "Y" : "X";
      const amount = (isRight ? 1 - progress : -progress) * sign * (transition.type === "whip-pan" ? 155 : 128) * intensity;
      style.translate = axis === "X" ? `${amount}% 0` : `0 ${amount}%`;
      style.scale = `${1 + pulse * (transition.type === "whip-pan" ? 0.08 : 0.035)}`;
      style.filter = `blur(${pulse * (transition.blurAmount ?? 10)}px) brightness(${1 + pulse * 0.18})`;
      break;
    }
    case "wipe":
    case "mask-reveal": {
      const edge = Math.max(0, Math.min(100, (isRight ? 100 - progress * 100 : progress * 100)));
      if (transition.type === "mask-reveal") {
        const radius = isRight ? Math.max(0, progress * 145) : Math.max(0, (1 - progress) * 145);
        style.clipPath = `circle(${radius}% at 50% 50%)`;
        style.filter = `brightness(${1 + pulse * 0.22})`;
      } else {
        style.clipPath = direction === "right"
          ? `inset(0 ${edge}% 0 0)`
          : direction === "up"
            ? `inset(${edge}% 0 0 0)`
            : direction === "down"
              ? `inset(0 0 ${edge}% 0)`
              : `inset(0 0 0 ${edge}%)`;
        style.filter = `contrast(${1 + pulse * 0.18})`;
      }
      break;
    }
    case "zoom":
      if (isLeft) {
        style.scale = `${1 + progress * (transition.zoomAmount ?? 0.32)}`;
        style.opacity = Math.max(0.05, 1 - progress * 1.05);
      }
      if (isRight) {
        style.scale = `${1 + (1 - progress) * (transition.zoomAmount ?? 0.32)}`;
        style.opacity = Math.min(1, progress * 1.18);
      }
      style.filter = `contrast(${1 + pulse * 0.22}) brightness(${1 + pulse * 0.12})`;
      break;
    case "blur":
      style.filter = `blur(${pulse * (transition.blurAmount ?? 24)}px) brightness(${1 - pulse * 0.12}) saturate(${1 - pulse * 0.2})`;
      style.opacity = isLeft ? Math.max(0.1, 1 - progress * 0.95) : Math.min(1, progress * 1.12);
      break;
    case "spin":
      style.rotate = `${(isRight ? 1 - progress : progress) * (isRight ? -1 : 1) * (transition.rotation ?? 260)}deg`;
      style.scale = `${1 + pulse * (transition.zoomAmount ?? 0.18)}`;
      style.opacity = isLeft ? Math.max(0.14, 1 - progress) : Math.min(1, progress * 1.2);
      break;
    case "glitch":
      style.translate = `${Math.round(hardPulse * 14 * intensity)}px ${Math.round(Math.sin(progress * Math.PI * 5) * 5 * intensity)}px`;
      style.scale = `${1 + (Math.abs(hardPulse) > 0.65 ? 0.04 * intensity : 0)}`;
      style.filter = `contrast(${1 + intensity * 0.75}) saturate(${1 + pulse * intensity * 1.4}) hue-rotate(${hardPulse * 18 * intensity}deg)`;
      style.opacity = isLeft ? Math.max(0.16, 1 - progress * 0.9) : Math.min(1, 0.18 + progress * 1.18);
      break;
    case "rgb-split":
      style.translate = `${Math.round(Math.sin(progress * Math.PI * 4) * 8 * intensity)}px 0`;
      style.filter = `contrast(${1 + intensity * 0.5}) saturate(${1 + pulse * intensity * 1.8}) hue-rotate(${hardPulse * 24 * intensity}deg)`;
      style.opacity = isLeft ? Math.max(0.22, 1 - progress * 0.8) : Math.min(1, progress * 1.2);
      break;
    case "luma-fade":
      style.filter = `brightness(${0.68 + progress * 0.62 + pulse * 0.18}) contrast(${1 + intensity * 0.65}) saturate(${0.75 + pulse * intensity * 1.2})`;
      style.opacity = isLeft ? Math.max(0.12, 1 - progress * 1.05) : Math.min(1, progress * 1.1);
      break;
  }
  return style;
}

export function transitionExportMapping(transition: TransitionInstance): { ffmpegXfade?: string; compatibility: TransitionCompatibility } {
  const definition = transitionDefinition(transition.type);
  return { ffmpegXfade: definition.ffmpegXfade, compatibility: definition.compatibility };
}

function def(id: string, name: string, category: TransitionCategory, ffmpegXfade: string | undefined, compatibility: TransitionCompatibility, defaultDuration: number, extra: Partial<TransitionDefinition> = {}): TransitionDefinition {
  return {
    id,
    name,
    category,
    previewPath: `/transitions/${id}.png`,
    defaultDuration,
    ffmpegXfade,
    compatibility,
    ...extra
  };
}

function isVisualClip(clip: TimelineClip): boolean {
  return (clip.type === "video" || clip.type === "image") && !clip.hidden;
}

function getClipEnd(clip: TimelineClip): number {
  return clip.timelineStart + clip.duration;
}

function clampTransitionDuration(duration: number, left: TimelineClip | undefined, right: TimelineClip | undefined, placement: TransitionPlacement): number {
  const maxByClip = placement === "between"
    ? Math.min(left?.duration ?? 0, right?.duration ?? 0, 60)
    : Math.min(left?.duration ?? right?.duration ?? 0, 60);
  return clamp(duration, 0.05, Math.max(0.05, maxByClip));
}

function allTimelineClips(timeline: Timeline): Map<string, TimelineClip> {
  return new Map(timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
}

function easeProgress(value: number, easing: TransitionEasing): number {
  const t = clamp(value, 0, 1);
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
  if (easing === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  return t;
}

function normalizeEasing(value?: string): TransitionEasing {
  return value === "linear" || value === "ease-in" || value === "ease-out" || value === "ease-in-out" ? value : "ease-in-out";
}

function clamp(value: number, min: number, max: number): number {
  const next = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, next));
}
