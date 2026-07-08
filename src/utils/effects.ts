import type { CSSProperties } from "react";
import type { EffectInstance, EffectParamValue, EffectType, TimelineClip } from "../types/editor";
import { clamp } from "./time";

export interface EffectPreset {
  id: string;
  type: EffectType;
  name: string;
  description: string;
  intensity: number;
  params: Record<string, EffectParamValue>;
  exportSupported: boolean;
}

export interface EffectCategory {
  type: EffectType;
  name: string;
  detail: string;
  presets: EffectPreset[];
}

const effectDetails: Record<EffectType, { name: string; detail: string }> = {
  glitch: { name: "Glitch", detail: "Digital jumps, signal slices, and controlled distortion." },
  "film-grain": { name: "Film Grain", detail: "Fine deterministic texture for organic footage." },
  vignette: { name: "Vignette", detail: "Cinematic edge falloff and soft focus framing." },
  glow: { name: "Glow / Bloom", detail: "Soft highlights and neon bloom styling." },
  "rgb-split": { name: "RGB Split", detail: "Chromatic channel offsets for lens and digital looks." },
  vhs: { name: "VHS / Retro Tape", detail: "Tape softness, scanlines, and tracking color." },
  "light-leak": { name: "Light Leak", detail: "Warm, blue, and rainbow leak overlays." },
  "camera-shake": { name: "Camera Shake", detail: "Deterministic handheld or impact movement." },
  "zoom-pulse": { name: "Zoom Pulse", detail: "Subtle punch and beat-driven scale motion." }
};

export const effectCategories: EffectCategory[] = [
  {
    type: "film-grain",
    ...effectDetails["film-grain"],
    presets: [
      preset("fine-film", "film-grain", "Fine Film", 0.58, { size: 1.35, softness: 0.48 }),
      preset("16mm", "film-grain", "16mm", 0.72, { size: 1.9, softness: 0.34 }),
      preset("35mm", "film-grain", "35mm", 0.66, { size: 1.55, softness: 0.4 }),
      preset("rough-vintage", "film-grain", "Rough Vintage", 0.84, { size: 2.55, softness: 0.2 })
    ]
  },
  {
    type: "vignette",
    ...effectDetails.vignette,
    presets: [
      preset("soft-focus", "vignette", "Soft Focus", 0.56, { color: "black", softness: 0.62 }),
      preset("dark-cinema", "vignette", "Dark Cinema", 0.78, { color: "black", softness: 0.46 }),
      preset("portrait", "vignette", "Portrait", 0.64, { color: "black", softness: 0.54 }),
      preset("dreamy-white", "vignette", "Dreamy White", 0.58, { color: "white", softness: 0.68 })
    ]
  },
  {
    type: "glow",
    ...effectDetails.glow,
    presets: [
      preset("soft-bloom", "glow", "Soft Bloom", 0.62, { warmth: 0.28, radius: 18 }),
      preset("neon", "glow", "Neon", 0.76, { warmth: -0.18, radius: 24 }),
      preset("dream", "glow", "Dream", 0.7, { warmth: 0.36, radius: 28 }),
      preset("highlight-glow", "glow", "Highlight Glow", 0.66, { warmth: 0.18, radius: 22 })
    ]
  },
  {
    type: "rgb-split",
    ...effectDetails["rgb-split"],
    presets: [
      preset("subtle-lens", "rgb-split", "Subtle Lens", 0.58, { offset: 5 }),
      preset("digital-split", "rgb-split", "Digital Split", 0.72, { offset: 9 }),
      preset("heavy-glitch", "rgb-split", "Heavy Glitch", 0.9, { offset: 14 })
    ]
  },
  {
    type: "vhs",
    ...effectDetails.vhs,
    presets: [
      preset("clean-vhs", "vhs", "Clean VHS", 0.58, { scanlines: 0.42, bleed: 0.26 }),
      preset("old-tape", "vhs", "Old Tape", 0.74, { scanlines: 0.56, bleed: 0.38 }),
      preset("tracking-error", "vhs", "Tracking Error", 0.84, { scanlines: 0.68, bleed: 0.52 }),
      preset("retro-tv", "vhs", "Retro TV", 0.68, { scanlines: 0.58, bleed: 0.32 })
    ]
  },
  {
    type: "light-leak",
    ...effectDetails["light-leak"],
    presets: [
      preset("warm-left", "light-leak", "Warm Left", 0.7, { hue: "warm", side: "left" }),
      preset("warm-right", "light-leak", "Warm Right", 0.7, { hue: "warm", side: "right" }),
      preset("blue-flash", "light-leak", "Blue Flash", 0.66, { hue: "blue", side: "center" }),
      preset("rainbow-leak", "light-leak", "Rainbow Leak", 0.76, { hue: "rainbow", side: "left" })
    ]
  },
  {
    type: "camera-shake",
    ...effectDetails["camera-shake"],
    presets: [
      preset("handheld", "camera-shake", "Handheld", 0.48, { frequency: 8, rotation: 0.55 }, false),
      preset("subtle-motion", "camera-shake", "Subtle Motion", 0.36, { frequency: 5, rotation: 0.34 }, false),
      preset("impact", "camera-shake", "Impact", 0.72, { frequency: 16, rotation: 1.15 }, false),
      preset("earthquake", "camera-shake", "Earthquake", 0.92, { frequency: 20, rotation: 1.85 }, false)
    ]
  },
  {
    type: "zoom-pulse",
    ...effectDetails["zoom-pulse"],
    presets: [
      preset("punch-in", "zoom-pulse", "Punch In", 0.58, { direction: "in", frequency: 1.2 }, false),
      preset("punch-out", "zoom-pulse", "Punch Out", 0.58, { direction: "out", frequency: 1.2 }, false),
      preset("smooth-pulse", "zoom-pulse", "Smooth Pulse", 0.48, { direction: "pulse", frequency: 0.95 }, false),
      preset("beat-zoom", "zoom-pulse", "Beat Zoom", 0.7, { direction: "pulse", frequency: 2.4 }, false)
    ]
  },
  {
    type: "glitch",
    ...effectDetails.glitch,
    presets: [
      preset("digital-glitch", "glitch", "Digital Glitch", 0.56, { slices: 5, chroma: 0.34 }, false),
      preset("signal-error", "glitch", "Signal Error", 0.68, { slices: 7, chroma: 0.45 }, false),
      preset("rgb-burst", "glitch", "RGB Burst", 0.76, { slices: 6, chroma: 0.64 }, false),
      preset("heavy-distortion", "glitch", "Heavy Distortion", 0.92, { slices: 9, chroma: 0.78 }, false)
    ]
  }
];

export const effectPresets = effectCategories.flatMap((category) => category.presets);

function preset(
  id: string,
  type: EffectType,
  name: string,
  intensity: number,
  params: Record<string, EffectParamValue>,
  exportSupported = true
): EffectPreset {
  return {
    id,
    type,
    name,
    description: effectDetails[type].detail,
    intensity,
    params,
    exportSupported
  };
}

export function effectDisplayName(type: EffectType): string {
  return effectDetails[type].name;
}

export function createEffectFromPreset(presetId: string, clip: Pick<TimelineClip, "effects" | "duration">): EffectInstance {
  const selected = effectPresets.find((item) => item.id === presetId) ?? effectPresets[0];
  return normalizeEffect({
    id: crypto.randomUUID(),
    type: selected.type,
    name: selected.name,
    presetId: selected.id,
    enabled: true,
    intensity: selected.intensity,
    startTime: 0,
    duration: clip.duration,
    seed: seedFor(`${selected.id}-${clip.effects?.length ?? 0}`),
    order: clip.effects?.length ?? 0,
    params: selected.params
  }, clip.duration, clip.effects?.length ?? 0);
}

export function normalizeEffect(effect: Partial<EffectInstance>, clipDuration = 5, fallbackOrder = 0): EffectInstance {
  const type = isEffectType(effect.type) ? effect.type : "film-grain";
  const fallbackPreset = effectPresets.find((item) => item.type === type) ?? effectPresets[0];
  const duration = clamp(Number(effect.duration ?? clipDuration), 0.05, Math.max(0.05, clipDuration));
  return {
    id: effect.id ?? crypto.randomUUID(),
    type,
    name: effect.name ?? fallbackPreset.name,
    presetId: effect.presetId,
    enabled: effect.enabled ?? true,
    intensity: clamp(Number(effect.intensity ?? fallbackPreset.intensity), 0, 1),
    startTime: clamp(Number(effect.startTime ?? 0), 0, Math.max(0, clipDuration - 0.05)),
    duration,
    seed: Math.max(1, Math.floor(Number(effect.seed ?? seedFor(fallbackPreset.id)))),
    order: Math.max(0, Math.floor(Number(effect.order ?? fallbackOrder))),
    params: { ...fallbackPreset.params, ...(effect.params ?? {}) }
  };
}

export function normalizeEffects(effects: EffectInstance[] | undefined, clipDuration = 5): EffectInstance[] {
  return (effects ?? [])
    .map((effect, index) => normalizeEffect(effect, clipDuration, index))
    .sort((a, b) => a.order - b.order)
    .map((effect, index) => ({ ...effect, order: index }));
}

export function activeEffectsAt(clip: TimelineClip, absoluteTime: number, bypass = false): EffectInstance[] {
  if (bypass) return [];
  const localTime = clamp(absoluteTime - clip.timelineStart, 0, clip.duration);
  return normalizeEffects(clip.effects, clip.duration).filter((effect) => (
    effect.enabled && effect.intensity > 0 && localTime >= effect.startTime && localTime <= effect.startTime + effect.duration
  ));
}

export function effectProgress(effect: EffectInstance, clip: TimelineClip, absoluteTime: number): number {
  const localTime = clamp(absoluteTime - clip.timelineStart, 0, clip.duration);
  return clamp((localTime - effect.startTime) / Math.max(0.05, effect.duration), 0, 1);
}

export function buildEffectFilter(effects: EffectInstance[]): string {
  const parts: string[] = [];
  for (const effect of effects) {
    const i = effect.intensity;
    if (effect.type === "film-grain") parts.push(`contrast(${(1 + i * 0.12).toFixed(3)}) saturate(${(1 - i * 0.08).toFixed(3)})`);
    if (effect.type === "vignette") parts.push(`contrast(${(1 + i * 0.16).toFixed(3)}) brightness(${(1 - i * 0.04).toFixed(3)})`);
    if (effect.type === "glow") parts.push(`brightness(${(1 + i * 0.2).toFixed(3)}) saturate(${(1 + i * 0.28).toFixed(3)}) contrast(${(1 + i * 0.08).toFixed(3)})`);
    if (effect.type === "rgb-split") parts.push(`saturate(${(1 + i * 0.36).toFixed(3)}) contrast(${(1 + i * 0.1).toFixed(3)})`);
    if (effect.type === "vhs") parts.push(`saturate(${(1 - i * 0.32).toFixed(3)}) contrast(${(1 - i * 0.12).toFixed(3)}) brightness(${(1 - i * 0.04).toFixed(3)})`);
    if (effect.type === "light-leak") parts.push(`brightness(${(1 + i * 0.13).toFixed(3)}) saturate(${(1 + i * 0.12).toFixed(3)})`);
    if (effect.type === "glitch") parts.push(`contrast(${(1 + i * 0.2).toFixed(3)}) saturate(${(1 + i * 0.24).toFixed(3)})`);
  }
  return parts.join(" ");
}

export function effectFrameStyle(effects: EffectInstance[], clip: TimelineClip, absoluteTime: number): CSSProperties {
  let shakeX = 0;
  let shakeY = 0;
  let rotate = 0;
  let scale = 1;
  for (const effect of effects) {
    const progress = effectProgress(effect, clip, absoluteTime);
    const wave = seededWave(effect.seed, progress, Number(effect.params.frequency ?? 8));
    if (effect.type === "camera-shake") {
      const amp = effect.intensity * 26;
      shakeX += wave * amp;
      shakeY += seededWave(effect.seed + 11, progress, Number(effect.params.frequency ?? 8)) * amp * 0.62;
      rotate += seededWave(effect.seed + 23, progress, Number(effect.params.frequency ?? 8)) * Number(effect.params.rotation ?? 0.5) * effect.intensity;
    }
    if (effect.type === "zoom-pulse") {
      const direction = String(effect.params.direction ?? "pulse");
      const pulse = direction === "in" ? progress : direction === "out" ? 1 - progress : (Math.sin(progress * Math.PI * 2 * Number(effect.params.frequency ?? 1)) + 1) / 2;
      scale += pulse * effect.intensity * 0.2;
    }
    if (effect.type === "glitch") {
      shakeX += Math.round(seededWave(effect.seed + 41, progress, 18) * effect.intensity * 16);
    }
  }
  return {
    "--effect-shake-x": `${shakeX.toFixed(2)}px`,
    "--effect-shake-y": `${shakeY.toFixed(2)}px`,
    "--effect-rotate": `${rotate.toFixed(3)}deg`,
    "--effect-scale": scale.toFixed(4)
  } as CSSProperties;
}

export function effectOverlayVariables(effects: EffectInstance[]): CSSProperties {
  const values = {
    grain: 0,
    vignette: 0,
    glow: 0,
    rgb: 0,
    vhs: 0,
    leak: 0,
    glitch: 0
  };
  let leakX = 50;
  let leakHue = "rgba(255,137,54,1)";
  for (const effect of effects) {
    const i = effect.intensity;
    if (effect.type === "film-grain") values.grain = Math.max(values.grain, i);
    if (effect.type === "vignette") values.vignette = Math.max(values.vignette, i);
    if (effect.type === "glow") values.glow = Math.max(values.glow, i);
    if (effect.type === "rgb-split") values.rgb = Math.max(values.rgb, i);
    if (effect.type === "vhs") values.vhs = Math.max(values.vhs, i);
    if (effect.type === "glitch") values.glitch = Math.max(values.glitch, i);
    if (effect.type === "light-leak") {
      values.leak = Math.max(values.leak, i);
      const side = String(effect.params.side ?? "left");
      const hue = String(effect.params.hue ?? "warm");
      leakX = side === "right" ? 82 : side === "center" ? 50 : 16;
      leakHue = hue === "blue" ? "rgba(77,174,255,1)" : hue === "rainbow" ? "rgba(219,91,255,1)" : "rgba(255,137,54,1)";
    }
  }
  return {
    "--effect-grain": values.grain.toFixed(3),
    "--effect-vignette": values.vignette.toFixed(3),
    "--effect-glow": values.glow.toFixed(3),
    "--effect-rgb": values.rgb.toFixed(3),
    "--effect-vhs": values.vhs.toFixed(3),
    "--effect-leak": values.leak.toFixed(3),
    "--effect-glitch": values.glitch.toFixed(3),
    "--effect-leak-x": `${leakX}%`,
    "--effect-leak-color": leakHue
  } as CSSProperties;
}

export function exportFilterForEffect(effect: EffectInstance): string | undefined {
  if (!effect.enabled || effect.intensity <= 0) return undefined;
  const i = effect.intensity;
  if (effect.type === "film-grain") return `noise=alls=${(i * 34).toFixed(1)}:allf=t+u,eq=contrast=${(1 + i * 0.12).toFixed(3)}:saturation=${(1 - i * 0.08).toFixed(3)}`;
  if (effect.type === "vignette") return `vignette=PI/4*${(i * 1.35).toFixed(3)},eq=contrast=${(1 + i * 0.1).toFixed(3)}`;
  if (effect.type === "glow") return `eq=brightness=${(i * 0.1).toFixed(3)}:saturation=${(1 + i * 0.28).toFixed(3)}:contrast=${(1 + i * 0.06).toFixed(3)}`;
  if (effect.type === "rgb-split") return `chromashift=cbh=${Math.round(i * 12)}:crh=${Math.round(-i * 12)},eq=saturation=${(1 + i * 0.24).toFixed(3)}`;
  if (effect.type === "vhs") return `eq=saturation=${(1 - i * 0.32).toFixed(3)}:contrast=${(1 - i * 0.12).toFixed(3)},noise=alls=${(i * 18).toFixed(1)}:allf=t`;
  if (effect.type === "light-leak") return `eq=brightness=${(i * 0.08).toFixed(3)}:saturation=${(1 + i * 0.16).toFixed(3)}`;
  return undefined;
}

export function unsupportedExportEffects(effects: EffectInstance[] | undefined): string[] {
  return normalizeEffects(effects).filter((effect) => effect.enabled && !exportFilterForEffect(effect)).map((effect) => effect.name);
}

function seedFor(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function seededWave(seed: number, progress: number, frequency: number): number {
  const a = Math.sin((progress * frequency + seed * 0.013) * 12.9898) * 43758.5453;
  const b = Math.sin((progress * (frequency * 0.71) + seed * 0.021) * 78.233) * 14375.8545;
  return ((a - Math.floor(a)) * 2 - 1) * 0.65 + ((b - Math.floor(b)) * 2 - 1) * 0.35;
}

function isEffectType(value: unknown): value is EffectType {
  return typeof value === "string" && value in effectDetails;
}
