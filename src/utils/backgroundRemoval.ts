/* global ImageData */
import type { BackgroundRemovalExportStatus, BackgroundRemovalMode, BackgroundRemovalSettings } from "../types/editor";
import { clamp } from "./time";

export const backgroundRemovalModes: Array<{ id: BackgroundRemovalMode; label: string; status: BackgroundRemovalExportStatus; note: string }> = [
  { id: "off", label: "Off", status: "fully-supported", note: "No background removal." },
  { id: "green-screen", label: "Green Screen", status: "fully-supported", note: "Best for clean green screens." },
  { id: "blue-screen", label: "Blue Screen", status: "fully-supported", note: "Best for clean blue screens." },
  { id: "custom-color", label: "Custom Color", status: "fully-supported", note: "Pick any flat background color." },
  { id: "luma-key", label: "Luma Key", status: "approximate", note: "Keys bright or dark luminance ranges." },
  { id: "difference-key", label: "Difference Key", status: "unsupported", note: "Static camera only; preview/export parity needs reference-frame compositing." }
];

export function defaultBackgroundRemovalSettings(): BackgroundRemovalSettings {
  return {
    enabled: false,
    mode: "off",
    keyColor: "#00b140",
    tolerance: 0.26,
    softness: 0.11,
    feather: 0.025,
    edgeExpansion: 0,
    spillSuppression: 0.72,
    spillRange: 0.34,
    desaturation: 0.24,
    opacity: 1,
    invert: false,
    showMatte: false,
    lumaThreshold: 0.72,
    lumaSoftness: 0.18,
    lumaKey: "bright",
    differenceThreshold: 0.22,
    differenceSoftness: 0.14,
    differenceNoiseReduction: 0.06,
    previewBackground: "checkerboard",
    previewCustomColor: "#20252b",
    exportStatus: "fully-supported"
  };
}

export function normalizeBackgroundRemovalSettings(input?: Partial<BackgroundRemovalSettings>): BackgroundRemovalSettings {
  const base = defaultBackgroundRemovalSettings();
  const mode = input?.mode ?? base.mode;
  const modeMeta = backgroundRemovalModes.find((item) => item.id === mode);
  return {
    ...base,
    ...input,
    enabled: Boolean(input?.enabled),
    mode,
    keyColor: validHex(input?.keyColor) ? input!.keyColor! : keyColorForMode(mode),
    tolerance: clamp(Number(input?.tolerance ?? base.tolerance), 0, 1),
    softness: clamp(Number(input?.softness ?? base.softness), 0.001, 1),
    feather: clamp(Number(input?.feather ?? base.feather), 0, 0.5),
    edgeExpansion: clamp(Number(input?.edgeExpansion ?? base.edgeExpansion), -0.5, 0.5),
    spillSuppression: clamp(Number(input?.spillSuppression ?? base.spillSuppression), 0, 1),
    spillRange: clamp(Number(input?.spillRange ?? base.spillRange), 0, 1),
    desaturation: clamp(Number(input?.desaturation ?? base.desaturation), 0, 1),
    opacity: clamp(Number(input?.opacity ?? base.opacity), 0, 1),
    lumaThreshold: clamp(Number(input?.lumaThreshold ?? base.lumaThreshold), 0, 1),
    lumaSoftness: clamp(Number(input?.lumaSoftness ?? base.lumaSoftness), 0.001, 1),
    differenceThreshold: clamp(Number(input?.differenceThreshold ?? base.differenceThreshold), 0, 1),
    differenceSoftness: clamp(Number(input?.differenceSoftness ?? base.differenceSoftness), 0.001, 1),
    differenceNoiseReduction: clamp(Number(input?.differenceNoiseReduction ?? base.differenceNoiseReduction), 0, 1),
    exportStatus: modeMeta?.status ?? "unsupported"
  };
}

export function keyColorForMode(mode: BackgroundRemovalMode): string {
  if (mode === "blue-screen") return "#0057ff";
  if (mode === "green-screen") return "#00b140";
  return "#00b140";
}

export function applyModeDefaults(settings: BackgroundRemovalSettings, mode: BackgroundRemovalMode): BackgroundRemovalSettings {
  const normalized = normalizeBackgroundRemovalSettings({ ...settings, mode });
  return normalizeBackgroundRemovalSettings({
    ...normalized,
    keyColor: mode === "custom-color" ? normalized.keyColor : keyColorForMode(mode),
    enabled: mode !== "off",
    exportStatus: backgroundRemovalModes.find((item) => item.id === mode)?.status
  });
}

export function keyedAlphaForPixel(red: number, green: number, blue: number, settingsInput: Partial<BackgroundRemovalSettings>): number {
  const settings = normalizeBackgroundRemovalSettings(settingsInput);
  if (!settings.enabled || settings.mode === "off") return 1;
  if (settings.mode === "luma-key") {
    const luma = ((red * 0.2126) + (green * 0.7152) + (blue * 0.0722)) / 255;
    const keyed = settings.lumaKey === "bright" ? luma - settings.lumaThreshold : settings.lumaThreshold - luma;
    const matte = smoothstep(0, settings.lumaSoftness, keyed);
    return settings.invert ? matte : 1 - matte;
  }
  if (settings.mode === "difference-key") return 1;
  const key = hexToRgb(settings.keyColor);
  const pixelYcbcr = rgbToYCbCr(red, green, blue);
  const keyYcbcr = rgbToYCbCr(key.r, key.g, key.b);
  const chromaDistance = Math.hypot(pixelYcbcr.cb - keyYcbcr.cb, pixelYcbcr.cr - keyYcbcr.cr);
  const lumaDistance = Math.abs(pixelYcbcr.y - keyYcbcr.y) * 0.24;
  const normalizedDistance = normalizedRgbDistance(red, green, blue, key.r, key.g, key.b) * 0.42;
  const distance = Math.min(1, chromaDistance * 0.82 + normalizedDistance + lumaDistance);
  const edge = settings.tolerance + settings.edgeExpansion;
  const matte = smoothstep(edge, edge + settings.softness + settings.feather, distance);
  return settings.invert ? 1 - matte : matte;
}

export function processKeyedImageData(imageData: ImageData, settingsInput: Partial<BackgroundRemovalSettings>): ImageData {
  const settings = normalizeBackgroundRemovalSettings(settingsInput);
  const data = imageData.data;
  const key = hexToRgb(settings.keyColor);
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = keyedAlphaForPixel(red, green, blue, settings);
    if (settings.showMatte) {
      const matte = Math.round(alpha * 255);
      data[index] = matte;
      data[index + 1] = matte;
      data[index + 2] = matte;
      data[index + 3] = 255;
      continue;
    }
    if (settings.mode !== "luma-key" && settings.mode !== "difference-key") {
      const spill = spillAmount(red, green, blue, key, settings);
      if (spill > 0) {
        const neutral = (red + blue) / 2;
        data[index + 1] = Math.round(green - (green - neutral) * spill);
        if (settings.desaturation > 0) {
          const gray = red * 0.299 + green * 0.587 + blue * 0.114;
          data[index] = Math.round(red + (gray - red) * settings.desaturation * spill);
          data[index + 1] = Math.round(data[index + 1] + (gray - data[index + 1]) * settings.desaturation * spill);
          data[index + 2] = Math.round(blue + (gray - blue) * settings.desaturation * spill);
        }
      }
    }
    data[index + 3] = Math.round(data[index + 3] * alpha * settings.opacity);
  }
  return imageData;
}

export function backgroundPreviewClass(settingsInput?: Partial<BackgroundRemovalSettings>): string {
  const settings = normalizeBackgroundRemovalSettings(settingsInput);
  return `bg-removal-${settings.previewBackground}`;
}

export function ffmpegFilterForBackgroundRemoval(settingsInput?: Partial<BackgroundRemovalSettings>): string | undefined {
  const settings = normalizeBackgroundRemovalSettings(settingsInput);
  if (!settings.enabled || settings.mode === "off") return undefined;
  if (settings.mode === "difference-key") return undefined;
  if (settings.mode === "luma-key") {
    const threshold = settings.lumaThreshold.toFixed(3);
    const tolerance = settings.lumaSoftness.toFixed(3);
    return `lumakey=threshold=${threshold}:tolerance=${tolerance}:softness=${settings.feather.toFixed(3)}`;
  }
  const similarity = settings.tolerance.toFixed(3);
  const blend = Math.max(settings.softness, settings.feather).toFixed(3);
  const color = settings.keyColor.replace("#", "0x");
  return `chromakey=${color}:${similarity}:${blend}`;
}

function validHex(value?: string): boolean {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
  const hex = validHex(value) ? value.slice(1) : "00b140";
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToYCbCr(red: number, green: number, blue: number): { y: number; cb: number; cr: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    cb: -0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 0.5 * r - 0.418688 * g - 0.081312 * b
  };
}

function normalizedRgbDistance(red: number, green: number, blue: number, keyRed: number, keyGreen: number, keyBlue: number): number {
  const sum = Math.max(1, red + green + blue);
  const keySum = Math.max(1, keyRed + keyGreen + keyBlue);
  const nr = red / sum;
  const ng = green / sum;
  const nb = blue / sum;
  const kr = keyRed / keySum;
  const kg = keyGreen / keySum;
  const kb = keyBlue / keySum;
  return Math.hypot(nr - kr, ng - kg, nb - kb);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function spillAmount(red: number, green: number, blue: number, key: { r: number; g: number; b: number }, settings: BackgroundRemovalSettings): number {
  const greenKey = key.g >= key.b;
  const dominant = greenKey ? green : blue;
  const other = greenKey ? blue : green;
  const spill = clamp(((dominant - Math.max(red, other)) / 255) / Math.max(0.001, settings.spillRange), 0, 1);
  return spill * settings.spillSuppression;
}
