import type { TimelineClip, VideoAnimationDirection, VideoAnimationEasing, VideoAnimationSide, VideoAnimationType, VideoClipAnimation, VideoClipAnimations } from "../types/editor";
import { clamp } from "./time";

export type VideoAnimationPreset = {
  id: string;
  label: string;
  side: VideoAnimationSide;
  type: VideoAnimationType;
  description: string;
  patch: Partial<VideoClipAnimation>;
};

export type VideoAnimationVisualState = {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  blur: number;
  clipPath?: string;
};

const defaultAnimation: VideoClipAnimation = {
  type: "none",
  enabled: false,
  duration: 0.65,
  delay: 0,
  intensity: 1,
  easing: "ease-out",
  direction: "up",
  distance: 110,
  scaleAmount: 0.22,
  rotationAmount: 8,
  blurAmount: 10,
  wipeSoftness: 8,
  anchorX: 0.5,
  anchorY: 0.5
};

export const inVideoAnimationPresets: VideoAnimationPreset[] = [
  { id: "fade-in", label: "Fade In", side: "in", type: "fade", description: "Soft professional opacity reveal.", patch: { type: "fade", duration: 0.55 } },
  { id: "slide-up", label: "Slide Up", side: "in", type: "slide", description: "Smooth slide from below.", patch: { type: "slide", direction: "up", distance: 120, duration: 0.7 } },
  { id: "slide-down", label: "Slide Down", side: "in", type: "slide", description: "Smooth slide from above.", patch: { type: "slide", direction: "down", distance: 120, duration: 0.7 } },
  { id: "slide-left", label: "Slide Left", side: "in", type: "slide", description: "Clean movement from right.", patch: { type: "slide", direction: "left", distance: 130, duration: 0.7 } },
  { id: "slide-right", label: "Slide Right", side: "in", type: "slide", description: "Clean movement from left.", patch: { type: "slide", direction: "right", distance: 130, duration: 0.7 } },
  { id: "zoom-in", label: "Zoom In", side: "in", type: "zoom", description: "Gentle scale up to normal.", patch: { type: "zoom", scaleAmount: 0.22, duration: 0.65 } },
  { id: "zoom-out-normal", label: "Zoom Out to Normal", side: "in", type: "zoom", description: "Starts slightly large and settles.", patch: { type: "zoom", scaleAmount: -0.16, duration: 0.7 } },
  { id: "pop-in", label: "Pop In", side: "in", type: "pop", description: "Quick modern scale pop.", patch: { type: "pop", scaleAmount: 0.28, duration: 0.48, easing: "back-out" } },
  { id: "blur-in", label: "Blur In", side: "in", type: "blur", description: "Defocused reveal.", patch: { type: "blur", blurAmount: 14, duration: 0.7 } },
  { id: "rotate-in", label: "Rotate In", side: "in", type: "rotate", description: "Subtle rotation settle.", patch: { type: "rotate", rotationAmount: -8, scaleAmount: 0.08, duration: 0.65 } },
  { id: "wipe-in", label: "Wipe In", side: "in", type: "wipe", description: "Directional reveal mask.", patch: { type: "wipe", direction: "right", wipeSoftness: 10, duration: 0.7 } },
  { id: "soft-bounce-in", label: "Soft Bounce In", side: "in", type: "soft-bounce", description: "Restrained bounce motion.", patch: { type: "soft-bounce", direction: "up", distance: 70, scaleAmount: 0.08, duration: 0.75, easing: "back-out" } }
];

export const outVideoAnimationPresets: VideoAnimationPreset[] = [
  { id: "fade-out", label: "Fade Out", side: "out", type: "fade", description: "Soft opacity exit.", patch: { type: "fade", duration: 0.55, easing: "ease-in" } },
  { id: "slide-up-out", label: "Slide Up Out", side: "out", type: "slide", description: "Exits upward.", patch: { type: "slide", direction: "up", distance: 120, duration: 0.65, easing: "ease-in" } },
  { id: "slide-down-out", label: "Slide Down Out", side: "out", type: "slide", description: "Exits downward.", patch: { type: "slide", direction: "down", distance: 120, duration: 0.65, easing: "ease-in" } },
  { id: "slide-left-out", label: "Slide Left Out", side: "out", type: "slide", description: "Exits left.", patch: { type: "slide", direction: "left", distance: 130, duration: 0.65, easing: "ease-in" } },
  { id: "slide-right-out", label: "Slide Right Out", side: "out", type: "slide", description: "Exits right.", patch: { type: "slide", direction: "right", distance: 130, duration: 0.65, easing: "ease-in" } },
  { id: "zoom-out", label: "Zoom Out", side: "out", type: "zoom", description: "Shrinks away cleanly.", patch: { type: "zoom", scaleAmount: 0.26, duration: 0.6, easing: "ease-in" } },
  { id: "zoom-in-out", label: "Zoom In Out", side: "out", type: "zoom", description: "Pushes toward viewer.", patch: { type: "zoom", scaleAmount: -0.24, duration: 0.6, easing: "ease-in" } },
  { id: "pop-out", label: "Pop Out", side: "out", type: "pop", description: "Quick scale disappear.", patch: { type: "pop", scaleAmount: 0.32, duration: 0.42, easing: "ease-in" } },
  { id: "blur-out", label: "Blur Out", side: "out", type: "blur", description: "Defocused exit.", patch: { type: "blur", blurAmount: 14, duration: 0.65, easing: "ease-in" } },
  { id: "rotate-out", label: "Rotate Out", side: "out", type: "rotate", description: "Subtle rotated exit.", patch: { type: "rotate", rotationAmount: 8, scaleAmount: 0.1, duration: 0.6, easing: "ease-in" } },
  { id: "wipe-out", label: "Wipe Out", side: "out", type: "wipe", description: "Directional hide mask.", patch: { type: "wipe", direction: "right", wipeSoftness: 10, duration: 0.65, easing: "ease-in" } },
  { id: "soft-drop-out", label: "Soft Drop Out", side: "out", type: "soft-drop", description: "Gentle downward fade.", patch: { type: "soft-drop", direction: "down", distance: 80, duration: 0.65, easing: "ease-in" } }
];

export function defaultVideoAnimation(): VideoClipAnimation {
  return { ...defaultAnimation };
}

export function defaultVideoClipAnimations(): VideoClipAnimations {
  return {
    in: defaultVideoAnimation(),
    out: { ...defaultAnimation, easing: "ease-in" }
  };
}

export function normalizeVideoAnimation(animation?: Partial<VideoClipAnimation>, side: VideoAnimationSide = "in"): VideoClipAnimation {
  const next = { ...defaultAnimation, ...(side === "out" ? { easing: "ease-in" as VideoAnimationEasing } : {}), ...(animation ?? {}) };
  return {
    ...next,
    type: next.type ?? "none",
    enabled: Boolean(next.enabled && next.type !== "none"),
    duration: clamp(Number(next.duration) || defaultAnimation.duration, 0.05, 10),
    delay: clamp(Number(next.delay) || 0, 0, 30),
    intensity: clamp(Number(next.intensity) || 1, 0, 2),
    easing: next.easing ?? (side === "out" ? "ease-in" : "ease-out"),
    direction: next.direction ?? "up",
    distance: clamp(Number(next.distance) || defaultAnimation.distance, 0, 2000),
    scaleAmount: clamp(Number(next.scaleAmount) || defaultAnimation.scaleAmount, -2, 2),
    rotationAmount: clamp(Number(next.rotationAmount) || defaultAnimation.rotationAmount, -180, 180),
    blurAmount: clamp(Number(next.blurAmount) || defaultAnimation.blurAmount, 0, 80),
    wipeSoftness: clamp(Number(next.wipeSoftness) || defaultAnimation.wipeSoftness, 0, 40),
    anchorX: clamp(Number(next.anchorX) || 0.5, 0, 1),
    anchorY: clamp(Number(next.anchorY) || 0.5, 0, 1)
  };
}

export function normalizeVideoClipAnimations(animations?: Partial<VideoClipAnimations>): VideoClipAnimations {
  return {
    in: normalizeVideoAnimation(animations?.in, "in"),
    out: normalizeVideoAnimation(animations?.out, "out")
  };
}

export function applyVideoAnimationPreset(current: Partial<VideoClipAnimation> | undefined, preset: VideoAnimationPreset): VideoClipAnimation {
  return normalizeVideoAnimation({ ...current, ...preset.patch, type: preset.type, enabled: true }, preset.side);
}

export function easingProgress(progress: number, easing: VideoAnimationEasing): number {
  const t = clamp(progress, 0, 1);
  if (easing === "linear") return t;
  if (easing === "ease-in") return t * t * t;
  if (easing === "ease-out") return 1 - Math.pow(1 - t, 3);
  if (easing === "ease-in-out") return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function animationWindow(clip: TimelineClip, side: VideoAnimationSide, animation: VideoClipAnimation): { start: number; end: number; duration: number } {
  const clipStart = clip.timelineStart;
  const clipEnd = clip.timelineStart + clip.duration;
  const total = Math.max(0.05, clip.duration);
  const animations = normalizeVideoClipAnimations(clip.videoAnimations);
  const requestedIn = animations.in.enabled ? Math.max(0.05, animations.in.duration) : 0;
  const requestedOut = animations.out.enabled ? Math.max(0.05, animations.out.duration) : 0;
  const available = Math.max(0.05, total - Math.min(animations.in.delay, total * 0.5) - Math.min(animations.out.delay, total * 0.5));
  const overlapScale = requestedIn + requestedOut > available ? available / (requestedIn + requestedOut) : 1;
  const duration = Math.max(0.05, Math.min(animation.duration, (side === "in" ? requestedIn : requestedOut) * overlapScale || animation.duration));
  if (side === "in") {
    const start = clipStart + Math.min(animation.delay, Math.max(0, total - duration));
    return { start, end: Math.min(clipEnd, start + duration), duration };
  }
  const delay = Math.min(animation.delay, Math.max(0, total - duration));
  const end = Math.max(clipStart, clipEnd - delay);
  return { start: Math.max(clipStart, end - duration), end, duration };
}

export function videoAnimationProgress(clip: TimelineClip, side: VideoAnimationSide, absoluteTime: number): number {
  const animation = normalizeVideoClipAnimations(clip.videoAnimations)[side];
  if (!animation.enabled || animation.type === "none") return side === "in" ? 1 : 0;
  const window = animationWindow(clip, side, animation);
  if (absoluteTime <= window.start) return 0;
  if (absoluteTime >= window.end) return 1;
  return clamp((absoluteTime - window.start) / Math.max(0.001, window.end - window.start), 0, 1);
}

function directionOffset(direction: VideoAnimationDirection, amount: number): { x: number; y: number } {
  if (direction === "left") return { x: amount, y: 0 };
  if (direction === "right") return { x: -amount, y: 0 };
  if (direction === "down") return { x: 0, y: -amount };
  return { x: 0, y: amount };
}

function wipeClipPath(direction: VideoAnimationDirection, hidden: number, softness: number): string {
  void softness;
  const pct = clamp(hidden, 0, 1) * 100;
  if (direction === "left") return `inset(0 0 0 ${pct}%)`;
  if (direction === "right") return `inset(0 ${pct}% 0 0)`;
  if (direction === "down") return `inset(${pct}% 0 0 0)`;
  return `inset(0 0 ${pct}% 0)`;
}

function applySide(state: VideoAnimationVisualState, animation: VideoClipAnimation, side: VideoAnimationSide, progress: number) {
  if (!animation.enabled || animation.type === "none") return;
  const eased = easingProgress(progress, animation.easing);
  const entering = side === "in";
  const hidden = entering ? 1 - eased : eased;
  const intensity = animation.intensity;
  if (animation.type === "fade") {
    state.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "slide") {
    const offset = directionOffset(animation.direction, animation.distance * intensity * hidden);
    state.translateX += offset.x;
    state.translateY += offset.y;
    state.opacity *= entering ? eased : 1 - eased * 0.12;
  } else if (animation.type === "zoom") {
    state.scale *= Math.max(0.02, 1 - animation.scaleAmount * intensity * hidden);
    state.opacity *= entering ? eased : 1 - eased * 0.1;
  } else if (animation.type === "pop") {
    state.scale *= Math.max(0.02, 1 - animation.scaleAmount * intensity * hidden);
    state.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "blur") {
    state.blur += animation.blurAmount * intensity * hidden;
    state.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "rotate") {
    state.rotation += animation.rotationAmount * intensity * hidden;
    state.scale *= Math.max(0.02, 1 - Math.abs(animation.scaleAmount) * 0.5 * hidden);
    state.opacity *= entering ? eased : 1 - eased * 0.18;
  } else if (animation.type === "wipe") {
    state.clipPath = wipeClipPath(animation.direction, hidden, animation.wipeSoftness);
  } else if (animation.type === "soft-bounce") {
    const offset = directionOffset(animation.direction, animation.distance * intensity * hidden);
    state.translateX += offset.x;
    state.translateY += offset.y;
    state.scale *= 1 + animation.scaleAmount * (entering ? Math.sin(eased * Math.PI) : hidden) * intensity;
    state.opacity *= entering ? eased : 1 - eased * 0.2;
  } else if (animation.type === "soft-drop") {
    const offset = directionOffset(animation.direction, animation.distance * intensity * hidden);
    state.translateX += offset.x;
    state.translateY += offset.y;
    state.opacity *= entering ? eased : 1 - eased;
  }
}

export function resolveVideoAnimation(clip: TimelineClip, absoluteTime: number): VideoAnimationVisualState {
  const animations = normalizeVideoClipAnimations(clip.videoAnimations);
  const state: VideoAnimationVisualState = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotation: 0,
    blur: 0
  };
  applySide(state, animations.in, "in", videoAnimationProgress(clip, "in", absoluteTime));
  applySide(state, animations.out, "out", videoAnimationProgress(clip, "out", absoluteTime));
  return state;
}
