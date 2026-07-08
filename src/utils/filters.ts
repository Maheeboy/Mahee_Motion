import type { ColorGrade } from "../types/editor";
import { defaultColorGrade, normalizeColorSettings } from "./colorGrade";

export interface ColorFilterPreset {
  id: string;
  name: string;
  description: string;
  previewPath: string;
  grade: ColorGrade;
}

function grade(patch: Partial<ColorGrade["basic"]>): ColorGrade {
  const base = defaultColorGrade();
  return normalizeColorSettings({
    ...base,
    basic: {
      ...base.basic,
      ...patch
    }
  });
}

export const colorFilterPresets: ColorFilterPreset[] = [
  {
    id: "cinematic-teal",
    name: "Cinematic Teal",
    description: "Balanced teal shadows, warm highlights, and controlled contrast.",
    previewPath: "/filters/cinematic-teal.png",
    grade: grade({ contrast: 24, saturation: 8, vibrance: 22, temperature: -10, tint: -5, highlights: -28, shadows: 10, fade: 4, clarity: 10, dehaze: 8 })
  },
  {
    id: "warm-golden",
    name: "Warm Golden",
    description: "Golden-hour warmth with soft highlight recovery.",
    previewPath: "/filters/warm-golden.png",
    grade: grade({ brightness: 4, contrast: 10, saturation: 12, vibrance: 12, temperature: 32, tint: -3, highlights: -22, whites: 5 })
  },
  {
    id: "clean-natural",
    name: "Clean Natural",
    description: "Light correction for crisp, faithful footage.",
    previewPath: "/filters/clean-natural.png",
    grade: grade({ brightness: 2, contrast: 10, saturation: 4, vibrance: 7, temperature: -3, highlights: -12, shadows: 6, sharpness: 18, clarity: 6 })
  },
  {
    id: "moody-contrast",
    name: "Moody Contrast",
    description: "Deep shadows and controlled saturation for dramatic edits.",
    previewPath: "/filters/moody-contrast.png",
    grade: grade({ brightness: -8, contrast: 34, saturation: -8, vibrance: 8, temperature: -6, highlights: -28, shadows: -14, blacks: -22, clarity: 16, dehaze: 10 })
  },
  {
    id: "vivid-pop",
    name: "Vivid Pop",
    description: "High-energy color lift with punchy contrast.",
    previewPath: "/filters/vivid-pop.png",
    grade: grade({ brightness: 4, contrast: 18, saturation: 34, vibrance: 28, highlights: -10, shadows: 4, sharpness: 14, clarity: 8 })
  },
  {
    id: "soft-film",
    name: "Soft Film",
    description: "Gentle faded blacks, warm print color, and light grain.",
    previewPath: "/filters/soft-film.png",
    grade: grade({ contrast: -8, saturation: -10, temperature: 14, tint: 4, highlights: -24, shadows: 12, fade: 24, grainAmount: 8, grainSize: 1.5 })
  },
  {
    id: "cool-steel",
    name: "Cool Steel",
    description: "Cool modern shadows with restrained saturation.",
    previewPath: "/filters/cool-steel.png",
    grade: grade({ brightness: -2, contrast: 18, saturation: -14, vibrance: 8, temperature: -30, tint: 7, highlights: -14, shadows: -4, clarity: 12 })
  },
  {
    id: "matte-pastel",
    name: "Matte Pastel",
    description: "Soft low-contrast pastel grade for calm edits.",
    previewPath: "/filters/matte-pastel.png",
    grade: grade({ brightness: 8, contrast: -16, saturation: -18, vibrance: 6, temperature: 8, tint: 5, highlights: -30, shadows: 18, fade: 30 })
  },
  {
    id: "sunset-glow",
    name: "Sunset Glow",
    description: "Warm orange glow with rich color and protected highlights.",
    previewPath: "/filters/sunset-glow.png",
    grade: grade({ brightness: 5, contrast: 14, saturation: 20, vibrance: 18, temperature: 40, tint: 8, highlights: -24, whites: 6, shadows: 6 })
  }
];

export function filterPresetById(presetId: string): ColorFilterPreset | undefined {
  return colorFilterPresets.find((preset) => preset.id === presetId);
}
