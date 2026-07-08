import type { TextAnimation, TextAnimationDirection, TextAnimationEasing, TextAnimationSide, TextAnimationType, TextClipAnimations, TimelineClip } from "../types/editor";
import { clamp } from "./time";

export type TextAnimationPreset = {
  id: string;
  label: string;
  side: TextAnimationSide;
  type: TextAnimationType;
  description: string;
  patch: Partial<TextAnimation>;
};

export type TextAnimationVisualState = {
  opacity: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  blur: number;
  visibleText?: string;
};

const defaultAnimation: TextAnimation = {
  type: "none",
  enabled: false,
  duration: 0.6,
  delay: 0,
  intensity: 1,
  direction: "up",
  distance: 80,
  scale: 0.22,
  blur: 10,
  characterStagger: 0.025,
  wordStagger: 0.08,
  easing: "ease-out"
};

export const inTextAnimationPresets: TextAnimationPreset[] = [
  { id: "fade-in", label: "Fade In", side: "in", type: "fade", description: "Clean opacity reveal.", patch: { type: "fade", duration: 0.55, easing: "ease-out" } },
  { id: "slide-up", label: "Slide Up", side: "in", type: "slide", description: "Moves upward into place.", patch: { type: "slide", direction: "up", distance: 90, duration: 0.65 } },
  { id: "slide-down", label: "Slide Down", side: "in", type: "slide", description: "Drops into frame.", patch: { type: "slide", direction: "down", distance: 90, duration: 0.65 } },
  { id: "slide-left", label: "Slide Left", side: "in", type: "slide", description: "Moves left into place.", patch: { type: "slide", direction: "left", distance: 100, duration: 0.65 } },
  { id: "slide-right", label: "Slide Right", side: "in", type: "slide", description: "Moves right into place.", patch: { type: "slide", direction: "right", distance: 100, duration: 0.65 } },
  { id: "pop-in", label: "Pop In", side: "in", type: "pop", description: "Scale bounce with fade.", patch: { type: "pop", scale: 0.32, duration: 0.5, easing: "back-out" } },
  { id: "zoom-in", label: "Zoom In", side: "in", type: "zoom", description: "Soft zoom reveal.", patch: { type: "zoom", scale: 0.35, duration: 0.6 } },
  { id: "blur-in", label: "Blur In", side: "in", type: "blur", description: "Focuses into clarity.", patch: { type: "blur", blur: 14, duration: 0.7 } },
  { id: "typewriter", label: "Typewriter", side: "in", type: "typewriter", description: "Character-by-character reveal.", patch: { type: "typewriter", characterStagger: 0.028, duration: 1.1, easing: "linear" } },
  { id: "word-reveal", label: "Word Reveal", side: "in", type: "word-reveal", description: "Word-by-word caption reveal.", patch: { type: "word-reveal", wordStagger: 0.1, duration: 1, easing: "linear" } },
  { id: "rise-in", label: "Rise In", side: "in", type: "rise", description: "Elegant lower rise.", patch: { type: "rise", direction: "up", distance: 55, duration: 0.7 } },
  { id: "stretch-in", label: "Stretch In", side: "in", type: "stretch", description: "Subtle vertical stretch.", patch: { type: "stretch", scale: 0.28, duration: 0.55 } }
];

export const outTextAnimationPresets: TextAnimationPreset[] = [
  { id: "fade-out", label: "Fade Out", side: "out", type: "fade", description: "Clean opacity exit.", patch: { type: "fade", duration: 0.55, easing: "ease-in" } },
  { id: "slide-up-out", label: "Slide Up Out", side: "out", type: "slide", description: "Exits upward.", patch: { type: "slide", direction: "up", distance: 90, duration: 0.65, easing: "ease-in" } },
  { id: "slide-down-out", label: "Slide Down Out", side: "out", type: "slide", description: "Exits downward.", patch: { type: "slide", direction: "down", distance: 90, duration: 0.65, easing: "ease-in" } },
  { id: "slide-left-out", label: "Slide Left Out", side: "out", type: "slide", description: "Exits left.", patch: { type: "slide", direction: "left", distance: 100, duration: 0.65, easing: "ease-in" } },
  { id: "slide-right-out", label: "Slide Right Out", side: "out", type: "slide", description: "Exits right.", patch: { type: "slide", direction: "right", distance: 100, duration: 0.65, easing: "ease-in" } },
  { id: "pop-out", label: "Pop Out", side: "out", type: "pop", description: "Quick scale disappearance.", patch: { type: "pop", scale: 0.3, duration: 0.45, easing: "ease-in" } },
  { id: "zoom-out", label: "Zoom Out", side: "out", type: "zoom", description: "Recedes smoothly.", patch: { type: "zoom", scale: 0.4, duration: 0.6, easing: "ease-in" } },
  { id: "blur-out", label: "Blur Out", side: "out", type: "blur", description: "Defocuses while fading.", patch: { type: "blur", blur: 14, duration: 0.7, easing: "ease-in" } },
  { id: "type-out", label: "Type Out", side: "out", type: "typewriter", description: "Characters disappear.", patch: { type: "typewriter", characterStagger: 0.025, duration: 0.9, easing: "linear" } },
  { id: "shrink-out", label: "Shrink Out", side: "out", type: "shrink", description: "Shrinks away.", patch: { type: "shrink", scale: 0.42, duration: 0.5, easing: "ease-in" } }
];

export function defaultTextAnimation(): TextAnimation {
  return { ...defaultAnimation };
}

export function defaultTextClipAnimations(): TextClipAnimations {
  return {
    in: defaultTextAnimation(),
    out: { ...defaultAnimation, easing: "ease-in" }
  };
}

export function normalizeTextAnimation(animation?: Partial<TextAnimation>, side: TextAnimationSide = "in"): TextAnimation {
  const next = { ...defaultAnimation, ...(side === "out" ? { easing: "ease-in" as TextAnimationEasing } : {}), ...(animation ?? {}) };
  return {
    ...next,
    type: next.type ?? "none",
    enabled: Boolean(next.enabled && next.type !== "none"),
    duration: clamp(Number(next.duration) || defaultAnimation.duration, 0.05, 10),
    delay: clamp(Number(next.delay) || 0, 0, 30),
    intensity: clamp(Number(next.intensity) || 1, 0, 2),
    direction: next.direction ?? "up",
    distance: clamp(Number(next.distance) || defaultAnimation.distance, 0, 800),
    scale: clamp(Number(next.scale) || defaultAnimation.scale, 0, 2),
    blur: clamp(Number(next.blur) || defaultAnimation.blur, 0, 80),
    characterStagger: clamp(Number(next.characterStagger) || defaultAnimation.characterStagger, 0, 0.5),
    wordStagger: clamp(Number(next.wordStagger) || defaultAnimation.wordStagger, 0, 1),
    easing: next.easing ?? "ease-out"
  };
}

export function normalizeTextClipAnimations(animations?: Partial<TextClipAnimations>): TextClipAnimations {
  return {
    in: normalizeTextAnimation(animations?.in, "in"),
    out: normalizeTextAnimation(animations?.out, "out")
  };
}

export function applyTextAnimationPreset(current: Partial<TextAnimation> | undefined, preset: TextAnimationPreset): TextAnimation {
  return normalizeTextAnimation({ ...current, ...preset.patch, type: preset.type, enabled: true }, preset.side);
}

export function easingProgress(progress: number, easing: TextAnimationEasing): number {
  const t = clamp(progress, 0, 1);
  if (easing === "linear") return t;
  if (easing === "ease-in") return t * t * t;
  if (easing === "ease-out") return 1 - Math.pow(1 - t, 3);
  if (easing === "ease-in-out") return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function animationWindow(clip: TimelineClip, side: TextAnimationSide, animation: TextAnimation): { start: number; end: number; duration: number } {
  const clipStart = clip.timelineStart;
  const clipEnd = clip.timelineStart + clip.duration;
  const total = Math.max(0.05, clip.duration);
  const animations = normalizeTextClipAnimations(clip.textAnimations);
  const other = side === "in" ? animations.out : animations.in;
  const requestedIn = animations.in.enabled ? Math.max(0.05, animations.in.duration) : 0;
  const requestedOut = animations.out.enabled ? Math.max(0.05, animations.out.duration) : 0;
  const available = Math.max(0.05, total - Math.min(animations.in.delay, total * 0.5) - Math.min(animations.out.delay, total * 0.5));
  const scale = requestedIn + requestedOut > available ? available / (requestedIn + requestedOut) : 1;
  const duration = Math.max(0.05, Math.min(animation.duration, (side === "in" ? requestedIn : requestedOut) * scale || animation.duration));
  if (side === "in") {
    const start = clipStart + Math.min(animation.delay, Math.max(0, total - duration));
    return { start, end: Math.min(clipEnd, start + duration), duration };
  }
  const delay = Math.min(animation.delay, Math.max(0, total - duration - Math.min(other.duration, total)));
  const end = Math.max(clipStart, clipEnd - delay);
  return { start: Math.max(clipStart, end - duration), end, duration };
}

export function textAnimationProgress(clip: TimelineClip, side: TextAnimationSide, absoluteTime: number): number {
  const animation = normalizeTextClipAnimations(clip.textAnimations)[side];
  if (!animation.enabled || animation.type === "none") return side === "in" ? 1 : 0;
  const window = animationWindow(clip, side, animation);
  if (absoluteTime <= window.start) return side === "in" ? 0 : 0;
  if (absoluteTime >= window.end) return side === "in" ? 1 : 1;
  return clamp((absoluteTime - window.start) / Math.max(0.001, window.end - window.start), 0, 1);
}

function directionOffset(direction: TextAnimationDirection, amount: number): { x: number; y: number } {
  if (direction === "left") return { x: amount, y: 0 };
  if (direction === "right") return { x: -amount, y: 0 };
  if (direction === "down") return { x: 0, y: -amount };
  return { x: 0, y: amount };
}

function graphemes(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale: string | undefined, options: { granularity: "grapheme" }) => {
      segment(value: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (item) => item.segment);
  return Array.from(text);
}

function visibleGraphemeText(text: string, progress: number, reverse = false): string {
  const parts = graphemes(text);
  const count = Math.round(parts.length * clamp(progress, 0, 1));
  return reverse ? parts.slice(0, Math.max(0, parts.length - count)).join("") : parts.slice(0, count).join("");
}

function visibleWordText(text: string, progress: number): string {
  const parts = text.split(/(\s+)/);
  const words = parts.filter((part) => !/^\s+$/.test(part)).length;
  const visibleWords = Math.round(words * clamp(progress, 0, 1));
  let seen = 0;
  return parts.map((part) => {
    if (/^\s+$/.test(part)) return seen > 0 && seen <= visibleWords ? part : "";
    seen += 1;
    return seen <= visibleWords ? part : "";
  }).join("");
}

function applySide(base: TextAnimationVisualState, animation: TextAnimation, side: TextAnimationSide, progress: number, text: string): TextAnimationVisualState {
  if (!animation.enabled || animation.type === "none") return base;
  const eased = easingProgress(progress, animation.easing);
  const entering = side === "in";
  const amount = entering ? 1 - eased : eased;
  const intensity = animation.intensity;
  if (animation.type === "fade") {
    base.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "slide" || animation.type === "rise") {
    const offset = directionOffset(animation.direction, animation.distance * intensity * amount);
    base.translateX += offset.x;
    base.translateY += offset.y;
    base.opacity *= entering ? eased : 1 - eased * 0.15;
  } else if (animation.type === "pop" || animation.type === "zoom" || animation.type === "shrink") {
    const delta = animation.scale * intensity * amount;
    const scale = animation.type === "zoom" && !entering ? 1 + delta : 1 - delta;
    base.scaleX *= Math.max(0.02, scale);
    base.scaleY *= Math.max(0.02, scale);
    base.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "stretch") {
    base.scaleY *= Math.max(0.02, 1 - animation.scale * intensity * amount);
    base.opacity *= entering ? eased : 1 - eased * 0.25;
  } else if (animation.type === "blur") {
    base.blur += animation.blur * intensity * amount;
    base.opacity *= entering ? eased : 1 - eased;
  } else if (animation.type === "typewriter") {
    base.visibleText = visibleGraphemeText(text, eased, !entering);
  } else if (animation.type === "word-reveal") {
    base.visibleText = visibleWordText(text, eased);
  }
  return base;
}

export function resolveTextAnimation(clip: TimelineClip, absoluteTime: number, text: string): TextAnimationVisualState {
  const animations = normalizeTextClipAnimations(clip.textAnimations);
  const base: TextAnimationVisualState = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    blur: 0,
    visibleText: text
  };
  applySide(base, animations.in, "in", textAnimationProgress(clip, "in", absoluteTime), text);
  applySide(base, animations.out, "out", textAnimationProgress(clip, "out", absoluteTime), base.visibleText ?? text);
  return base;
}
