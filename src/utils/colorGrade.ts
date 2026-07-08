import type { CSSProperties } from "react";
import type {
  BasicColorSettings,
  ColorGrade,
  ColorSettings,
  ColorWheelSettings,
  ColorWheelsSettings,
  CurvePoint,
  CurvesSettings,
  HslRangeName,
  HslRangeSettings,
  HslSettings,
  LegacyColorSettings,
  LutSettings
} from "../types/editor";
import { clamp } from "./time";

export const COLOR_GRADE_VERSION = 1;

const hslNames: HslRangeName[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta"];

export const colorPipelineOrder = [
  "Input transform",
  "White balance",
  "Exposure and tonal correction",
  "RGB curves",
  "HSL",
  "Color wheels",
  "Creative LUT",
  "Finishing controls",
  "Output transform"
] as const;

export interface ExportColorGrade {
  enabled: boolean;
  compatibility: "fully-supported" | "approximate" | "unsupported";
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  hue: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
  fade: number;
  grainAmount: number;
}

export interface ColorPreset {
  id: string;
  name: string;
  readonly: boolean;
  grade: ColorGrade;
}

export function defaultBasicColorSettings(): BasicColorSettings {
  return {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    gamma: 1,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    hue: 0,
    sharpness: 0,
    clarity: 0,
    dehaze: 0,
    fade: 0,
    grainAmount: 0,
    grainSize: 1
  };
}

function defaultLutSettings(): LutSettings {
  return {
    enabled: false,
    intensity: 1
  };
}

function defaultHslRange(): HslRangeSettings {
  return {
    hue: 0,
    saturation: 0,
    luminance: 0,
    rangeWidth: 45,
    feathering: 0.45
  };
}

function defaultHslSettings(): HslSettings {
  return {
    enabled: false,
    ranges: Object.fromEntries(hslNames.map((name) => [name, defaultHslRange()])) as Record<HslRangeName, HslRangeSettings>
  };
}

const defaultCurve = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];

function defaultCurvesSettings(): CurvesSettings {
  return {
    enabled: false,
    master: defaultCurve(),
    red: defaultCurve(),
    green: defaultCurve(),
    blue: defaultCurve(),
    hueHue: defaultCurve(),
    hueSaturation: defaultCurve(),
    hueLuminance: defaultCurve()
  };
}

function defaultWheel(): ColorWheelSettings {
  return {
    hue: 0,
    saturation: 0,
    luminance: 0
  };
}

function defaultWheelsSettings(): ColorWheelsSettings {
  return {
    enabled: false,
    shadows: defaultWheel(),
    midtones: defaultWheel(),
    highlights: defaultWheel(),
    global: defaultWheel(),
    shadowRange: 0.35,
    highlightRange: 0.65,
    softness: 0.35
  };
}

export function defaultColorGrade(): ColorGrade {
  return {
    enabled: true,
    bypassed: false,
    beforeAfter: "off",
    version: COLOR_GRADE_VERSION,
    basic: defaultBasicColorSettings(),
    lut: defaultLutSettings(),
    hsl: defaultHslSettings(),
    curves: defaultCurvesSettings(),
    wheels: defaultWheelsSettings(),
    mix: 1
  };
}

function isLegacyColorSettings(value?: Partial<ColorSettings>): value is Partial<LegacyColorSettings> {
  return Boolean(value && !("basic" in value) && ("contrast" in value || "tealOrange" in value || "fadedBlacks" in value));
}

function legacyToGrade(value: Partial<LegacyColorSettings>): ColorGrade {
  const grade = defaultColorGrade();
  return normalizeColorSettings({
    ...grade,
    basic: {
      ...grade.basic,
      contrast: (((value.contrast ?? 1) - 1) / 0.008),
      saturation: (((value.saturation ?? 1) - 1) / 0.01),
      temperature: value.temperature ?? 0,
      tint: value.tint ?? 0,
      highlights: -((value.highlightReduction ?? 0) * 100),
      fade: (value.fadedBlacks ?? 0) * 100,
      shadows: (value.fadedBlacks ?? 0) * 45,
      hue: (value.tealOrange ?? 0) * -8,
      vibrance: (value.tealOrange ?? 0) * 18
    }
  });
}

export function normalizeColorSettings(settings?: Partial<ColorSettings>): ColorGrade {
  if (isLegacyColorSettings(settings)) return legacyToGrade(settings);
  const input = (settings ?? {}) as Partial<ColorGrade>;
  const base = defaultColorGrade();
  const basicInput = (input.basic ?? {}) as Partial<BasicColorSettings>;
  const hslInput = input.hsl;
  const curvesInput = input.curves;
  const wheelsInput = input.wheels;
  return {
    enabled: input.enabled ?? base.enabled,
    bypassed: input.bypassed ?? base.bypassed,
    beforeAfter: input.beforeAfter ?? base.beforeAfter,
    version: COLOR_GRADE_VERSION,
    basic: {
      exposure: clamp(basicInput.exposure ?? base.basic.exposure, -5, 5),
      brightness: clamp(basicInput.brightness ?? base.basic.brightness, -100, 100),
      contrast: clamp(basicInput.contrast ?? base.basic.contrast, -100, 100),
      highlights: clamp(basicInput.highlights ?? base.basic.highlights, -100, 100),
      shadows: clamp(basicInput.shadows ?? base.basic.shadows, -100, 100),
      whites: clamp(basicInput.whites ?? base.basic.whites, -100, 100),
      blacks: clamp(basicInput.blacks ?? base.basic.blacks, -100, 100),
      gamma: clamp(basicInput.gamma ?? base.basic.gamma, 0.1, 3),
      temperature: clamp(basicInput.temperature ?? base.basic.temperature, -100, 100),
      tint: clamp(basicInput.tint ?? base.basic.tint, -100, 100),
      saturation: clamp(basicInput.saturation ?? base.basic.saturation, -100, 100),
      vibrance: clamp(basicInput.vibrance ?? base.basic.vibrance, -100, 100),
      hue: clamp(basicInput.hue ?? base.basic.hue, -180, 180),
      sharpness: clamp(basicInput.sharpness ?? base.basic.sharpness, 0, 100),
      clarity: clamp(basicInput.clarity ?? base.basic.clarity, -100, 100),
      dehaze: clamp(basicInput.dehaze ?? base.basic.dehaze, -100, 100),
      fade: clamp(basicInput.fade ?? base.basic.fade, 0, 100),
      grainAmount: clamp(basicInput.grainAmount ?? base.basic.grainAmount, 0, 100),
      grainSize: clamp(basicInput.grainSize ?? base.basic.grainSize, 0.5, 4)
    },
    lut: {
      ...base.lut,
      ...input.lut,
      intensity: clamp(input.lut?.intensity ?? base.lut.intensity, 0, 1),
      enabled: input.lut?.enabled ?? base.lut.enabled
    },
    hsl: {
      enabled: hslInput?.enabled ?? base.hsl.enabled,
      solo: hslInput?.solo,
      ranges: Object.fromEntries(hslNames.map((name) => {
        const range = hslInput?.ranges?.[name] ?? base.hsl.ranges[name];
        return [name, {
          hue: clamp(range.hue, -100, 100),
          saturation: clamp(range.saturation, -100, 100),
          luminance: clamp(range.luminance, -100, 100),
          rangeWidth: clamp(range.rangeWidth, 5, 120),
          feathering: clamp(range.feathering, 0, 1)
        }];
      })) as Record<HslRangeName, HslRangeSettings>
    },
    curves: {
      enabled: curvesInput?.enabled ?? base.curves.enabled,
      master: normalizeCurve(curvesInput?.master ?? base.curves.master),
      red: normalizeCurve(curvesInput?.red ?? base.curves.red),
      green: normalizeCurve(curvesInput?.green ?? base.curves.green),
      blue: normalizeCurve(curvesInput?.blue ?? base.curves.blue),
      hueHue: normalizeCurve(curvesInput?.hueHue ?? base.curves.hueHue),
      hueSaturation: normalizeCurve(curvesInput?.hueSaturation ?? base.curves.hueSaturation),
      hueLuminance: normalizeCurve(curvesInput?.hueLuminance ?? base.curves.hueLuminance)
    },
    wheels: {
      enabled: wheelsInput?.enabled ?? base.wheels.enabled,
      shadows: normalizeWheel(wheelsInput?.shadows ?? base.wheels.shadows),
      midtones: normalizeWheel(wheelsInput?.midtones ?? base.wheels.midtones),
      highlights: normalizeWheel(wheelsInput?.highlights ?? base.wheels.highlights),
      global: normalizeWheel(wheelsInput?.global ?? base.wheels.global),
      shadowRange: clamp(wheelsInput?.shadowRange ?? base.wheels.shadowRange, 0.05, 0.8),
      highlightRange: clamp(wheelsInput?.highlightRange ?? base.wheels.highlightRange, 0.2, 0.95),
      softness: clamp(wheelsInput?.softness ?? base.wheels.softness, 0, 1)
    },
    match: input.match,
    mix: clamp(input.mix ?? base.mix, 0, 1)
  };
}

function normalizeCurve(points: CurvePoint[]): CurvePoint[] {
  const clean = points
    .map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);
  const withStart = clean.some((point) => point.x === 0) ? clean : [{ x: 0, y: 0 }, ...clean];
  const withEnd = withStart.some((point) => point.x === 1) ? withStart : [...withStart, { x: 1, y: 1 }];
  return withEnd.filter((point, index, all) => index === 0 || Math.abs(point.x - all[index - 1].x) > 0.001);
}

function normalizeWheel(wheel: ColorWheelSettings): ColorWheelSettings {
  return {
    hue: wrapHue(wheel.hue),
    saturation: clamp(wheel.saturation, 0, 1),
    luminance: clamp(wheel.luminance, -100, 100)
  };
}

function wrapHue(value: number): number {
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

export function buildColorFilter(settings?: Partial<ColorSettings>): string {
  const grade = normalizeColorSettings(settings);
  if (!grade.enabled || grade.bypassed || grade.beforeAfter === "bypass" || grade.mix <= 0) return "";
  const basic = effectiveBasicSettings(grade);
  const mix = grade.mix;
  const exposureBrightness = (Math.pow(2, basic.exposure) - 1) * 0.42;
  const gammaBrightness = Math.pow(0.5, 1 / basic.gamma) - 0.5;
  const brightness = clamp(1 + (basic.brightness / 100) * 0.35 + exposureBrightness + gammaBrightness * 0.55 + (basic.whites / 100) * 0.09 + (basic.blacks / 100) * 0.045 - (Math.abs(Math.min(0, basic.highlights)) / 100) * 0.05, 0.05, 3);
  const contrast = clamp(1 + (basic.contrast / 100) * 0.75 + (basic.clarity / 100) * 0.18 + (basic.dehaze / 100) * 0.16 + (basic.sharpness / 100) * 0.08 - (basic.blacks / 100) * 0.1, 0.2, 2.5);
  const saturation = clamp(1 + (basic.saturation / 100) + (basic.vibrance / 100) * 0.42, 0, 3);
  const sepia = clamp(Math.max(0, basic.temperature) / 100 * 0.18 + Math.abs(basic.tint) / 100 * 0.035, 0, 0.35);
  const hue = basic.hue + basic.tint * 0.08 - basic.temperature * 0.035;
  const finalBrightness = 1 + (brightness - 1) * mix;
  const finalContrast = 1 + (contrast - 1) * mix;
  const finalSaturation = 1 + (saturation - 1) * mix;
  return [
    `brightness(${finalBrightness.toFixed(3)})`,
    `contrast(${finalContrast.toFixed(3)})`,
    `saturate(${finalSaturation.toFixed(3)})`,
    `sepia(${(sepia * mix).toFixed(3)})`,
    `hue-rotate(${(hue * mix).toFixed(2)}deg)`
  ].join(" ");
}

export function colorOverlayStyle(settings?: Partial<ColorSettings>): CSSProperties {
  const grade = normalizeColorSettings(settings);
  const basic = effectiveBasicSettings(grade);
  const active = grade.enabled && !grade.bypassed && grade.beforeAfter !== "bypass" ? grade.mix : 0;
  return {
    "--grade-fade": ((basic.fade / 100) * active).toFixed(3),
    "--grade-highlights": (Math.max(0, -basic.highlights / 100) * active).toFixed(3),
    "--grade-highlight-lift": (Math.max(0, basic.highlights / 100) * active).toFixed(3),
    "--grade-shadow-lift": (Math.max(0, basic.shadows / 100) * active).toFixed(3),
    "--grade-shadow-crush": (Math.max(0, -basic.shadows / 100) * active).toFixed(3),
    "--grade-white-lift": (Math.max(0, basic.whites / 100) * active).toFixed(3),
    "--grade-black-lift": (Math.max(0, basic.blacks / 100) * active).toFixed(3),
    "--grade-black-crush": (Math.max(0, -basic.blacks / 100) * active).toFixed(3),
    "--grade-warm": (Math.max(0, basic.temperature / 100) * active).toFixed(3),
    "--grade-cool": (Math.max(0, -basic.temperature / 100) * active).toFixed(3),
    "--grade-tint-magenta": (Math.max(0, basic.tint / 100) * active).toFixed(3),
    "--grade-tint-green": (Math.max(0, -basic.tint / 100) * active).toFixed(3),
    "--grade-grain": ((basic.grainAmount / 100) * active).toFixed(3),
    "--grade-grain-size": basic.grainSize.toFixed(2)
  } as CSSProperties;
}

export function exportColorGrade(settings?: Partial<ColorSettings>): ExportColorGrade {
  const grade = normalizeColorSettings(settings);
  const basic = effectiveBasicSettings(grade);
  const enabled = grade.enabled && !grade.bypassed && grade.beforeAfter !== "bypass" && grade.mix > 0;
  return {
    enabled,
    compatibility: "fully-supported",
    brightness: clamp(((Math.pow(2, basic.exposure) - 1) * 0.22) + basic.brightness / 220 + basic.whites / 650 - Math.max(0, -basic.highlights) / 900, -1, 1),
    contrast: clamp(1 + basic.contrast / 130 + basic.clarity / 420 + basic.dehaze / 360, 0.1, 3),
    saturation: clamp(1 + basic.saturation / 100 + basic.vibrance / 260, 0, 3),
    gamma: clamp(1 / basic.gamma, 0.1, 10),
    hue: clamp(basic.hue + basic.tint * 0.08 - basic.temperature * 0.035, -180, 180),
    temperature: basic.temperature,
    tint: basic.tint,
    shadows: basic.shadows,
    highlights: basic.highlights,
    fade: basic.fade,
    grainAmount: basic.grainAmount
  };
}

const lutLooks: Record<string, Partial<BasicColorSettings>> = {
  cinematic: { contrast: 18, saturation: -4, vibrance: 18, temperature: 5, tint: -3, highlights: -18, shadows: 10, fade: 5 },
  "warm-film": { contrast: 8, saturation: 5, temperature: 24, tint: -3, highlights: -20, fade: 16, grainAmount: 7 },
  "cool-clean": { contrast: 12, saturation: -2, temperature: -20, tint: 4, highlights: -10, clarity: 8 },
  noir: { contrast: 34, saturation: -100, highlights: -16, shadows: -8, blacks: -18, clarity: 16 },
  "vintage-print": { contrast: -2, saturation: -12, temperature: 15, tint: 5, highlights: -24, fade: 24, grainAmount: 10 }
};

function curveValue(points: CurvePoint[], x: number): number {
  const normalized = normalizeCurve(points);
  const rightIndex = normalized.findIndex((point) => point.x >= x);
  if (rightIndex <= 0) return normalized[0]?.y ?? x;
  const left = normalized[rightIndex - 1];
  const right = normalized[rightIndex];
  const ratio = (x - left.x) / Math.max(0.0001, right.x - left.x);
  return left.y + (right.y - left.y) * ratio;
}

function wheelComponents(wheel: ColorWheelSettings) {
  const radians = wheel.hue * Math.PI / 180;
  return {
    warm: Math.cos(radians) * wheel.saturation * 34,
    tint: Math.sin(radians) * wheel.saturation * 34,
    luminance: wheel.luminance
  };
}

export function effectiveBasicSettings(settings?: Partial<ColorSettings>): BasicColorSettings {
  const grade = normalizeColorSettings(settings);
  const result = { ...grade.basic };
  const add = (patch: Partial<BasicColorSettings>, amount = 1) => {
    for (const [key, value] of Object.entries(patch) as Array<[keyof BasicColorSettings, number]>) {
      result[key] += value * amount;
    }
  };

  if (grade.lut.enabled && grade.lut.lutId && lutLooks[grade.lut.lutId]) {
    add(lutLooks[grade.lut.lutId], grade.lut.intensity);
  }

  if (grade.hsl.enabled) {
    const adjustedRanges = Object.entries(grade.hsl.ranges).filter(([, range]) => Math.abs(range.hue) + Math.abs(range.saturation) + Math.abs(range.luminance) > 0.01);
    const ranges = grade.hsl.solo ? [[grade.hsl.solo, grade.hsl.ranges[grade.hsl.solo]]] as const : adjustedRanges.length ? adjustedRanges : Object.entries(grade.hsl.ranges);
    const count = Math.max(1, ranges.length);
    const hue = ranges.reduce((sum, [, range]) => sum + range.hue, 0) / count;
    const saturation = ranges.reduce((sum, [, range]) => sum + range.saturation, 0) / count;
    const luminance = ranges.reduce((sum, [, range]) => sum + range.luminance, 0) / count;
    add({ hue: hue * 0.36, saturation: saturation * 0.62, brightness: luminance * 0.25, vibrance: saturation * 0.18 });
  }

  if (grade.curves.enabled) {
    const masterMid = curveValue(grade.curves.master, 0.5) - 0.5;
    const redMid = curveValue(grade.curves.red, 0.5) - 0.5;
    const greenMid = curveValue(grade.curves.green, 0.5) - 0.5;
    const blueMid = curveValue(grade.curves.blue, 0.5) - 0.5;
    add({
      brightness: masterMid * 95,
      contrast: ((curveValue(grade.curves.master, 0.75) - curveValue(grade.curves.master, 0.25)) - 0.5) * 120,
      temperature: (redMid - blueMid) * 90,
      tint: (redMid + blueMid - greenMid * 2) * 55
    });
  }

  if (grade.wheels.enabled) {
    const global = wheelComponents(grade.wheels.global);
    const shadows = wheelComponents(grade.wheels.shadows);
    const midtones = wheelComponents(grade.wheels.midtones);
    const highlights = wheelComponents(grade.wheels.highlights);
    add({
      temperature: global.warm + shadows.warm * 0.22 + midtones.warm * 0.38 + highlights.warm * 0.28,
      tint: global.tint + shadows.tint * 0.22 + midtones.tint * 0.38 + highlights.tint * 0.28,
      brightness: global.luminance * 0.45 + midtones.luminance * 0.25,
      shadows: shadows.luminance * 0.65,
      highlights: highlights.luminance * 0.65,
      saturation: grade.wheels.global.saturation * 24
    });
  }

  if (grade.match?.enabled) {
    add({
      exposure: grade.match.exposure,
      temperature: grade.match.temperature,
      tint: grade.match.tint,
      contrast: grade.match.contrast,
      saturation: grade.match.saturation
    }, grade.match.strength);
  }

  return defaultBasicColorSettingsKeys.reduce((clean, key) => {
    const bounds = basicBounds[key];
    clean[key] = clamp(result[key], bounds[0], bounds[1]);
    return clean;
  }, {} as BasicColorSettings);
}

const defaultBasicColorSettingsKeys = Object.keys(defaultBasicColorSettings()) as Array<keyof BasicColorSettings>;
const basicBounds: Record<keyof BasicColorSettings, [number, number]> = {
  exposure: [-5, 5], brightness: [-100, 100], contrast: [-100, 100], highlights: [-100, 100],
  shadows: [-100, 100], whites: [-100, 100], blacks: [-100, 100], gamma: [0.1, 3],
  temperature: [-100, 100], tint: [-100, 100], saturation: [-100, 100], vibrance: [-100, 100],
  hue: [-180, 180], sharpness: [0, 100], clarity: [-100, 100], dehaze: [-100, 100],
  fade: [0, 100], grainAmount: [0, 100], grainSize: [0.5, 4]
};

export const builtInColorPresets: ColorPreset[] = [
  preset("clean-cinematic", "Clean Cinematic", { contrast: 14, saturation: 8, vibrance: 10, highlights: -18, shadows: 8, temperature: 6, tint: -2, clarity: 8, dehaze: 4 }),
  preset("teal-orange", "Teal and Orange", { contrast: 10, saturation: 12, vibrance: 20, temperature: 10, tint: -4, hue: -5, highlights: -12, shadows: 12 }),
  preset("cold-drama", "Cold Drama", { exposure: -0.1, contrast: 18, saturation: -8, temperature: -18, tint: 5, highlights: -24, blacks: -12, clarity: 12 }),
  preset("warm-film", "Warm Film", { contrast: 8, saturation: 6, vibrance: 12, temperature: 22, tint: -3, highlights: -18, fade: 12, grainAmount: 8, grainSize: 1.4 }),
  preset("faded-black", "Faded Black", { contrast: -4, saturation: -6, highlights: -20, shadows: 18, blacks: 22, fade: 28, grainAmount: 5 })
];

function preset(id: string, name: string, basic: Partial<BasicColorSettings>): ColorPreset {
  return {
    id,
    name,
    readonly: true,
    grade: normalizeColorSettings({ ...defaultColorGrade(), basic: { ...defaultBasicColorSettings(), ...basic } })
  };
}
