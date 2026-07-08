import type { TextSettings, Timeline, Transform } from "../types/editor";
import { defaultTextSettings, defaultTransform, normalizeTextSettings } from "./timeline";

export interface TextStylePreset {
  id: string;
  name: string;
  sample: string;
  color: string;
  text: TextSettings;
  transform: (timeline: Pick<Timeline, "width" | "height">) => Transform;
}

const base = defaultTextSettings();

function centered(timeline: Pick<Timeline, "width" | "height">): Transform {
  return { ...defaultTransform(), x: timeline.width / 2, y: timeline.height / 2 };
}

export const textStylePresets: TextStylePreset[] = [
  {
    id: "cinema-title",
    name: "Cinema Title",
    sample: "Journey",
    color: "#a87935",
    text: normalizeTextSettings({
      ...base,
      text: "Journey",
      fontSize: 86,
      fontWeight: 900,
      color: "#fff2d6",
      shadow: { enabled: true, color: "#000000", x: 0, y: 10, blur: 22, opacity: 0.62 },
      glow: { enabled: true, color: "#d9a85f", size: 12, opacity: 0.28 }
    }),
    transform: (timeline) => ({ ...centered(timeline), y: timeline.height * 0.42 })
  },
  {
    id: "neon-pop",
    name: "Neon Pop",
    sample: "Glow",
    color: "#8259cf",
    text: normalizeTextSettings({
      ...base,
      text: "Glow",
      fontSize: 72,
      fontWeight: 900,
      color: "#f7fbff",
      stroke: { enabled: true, color: "#1624ff", width: 2 },
      glow: { enabled: true, color: "#23d8ff", size: 26, opacity: 0.8 },
      shadow: { enabled: true, color: "#090014", x: 0, y: 8, blur: 18, opacity: 0.58 }
    }),
    transform: (timeline) => ({ ...centered(timeline), y: timeline.height * 0.48 })
  },
  {
    id: "gold-lower",
    name: "Gold Lower",
    sample: "Creator",
    color: "#99642d",
    text: normalizeTextSettings({
      ...base,
      text: "Creator",
      fontSize: 42,
      fontWeight: 850,
      color: "#ffe3a3",
      background: "#0b1218",
      align: "left",
      stroke: { enabled: true, color: "#241304", width: 1 },
      shadow: { enabled: true, color: "#000000", x: 2, y: 8, blur: 14, opacity: 0.48 }
    }),
    transform: (timeline) => ({ ...centered(timeline), x: timeline.width * 0.28, y: timeline.height * 0.78 })
  },
  {
    id: "soft-caption",
    name: "Soft Caption",
    sample: "Moment",
    color: "#5d738e",
    text: normalizeTextSettings({
      ...base,
      text: "Moment",
      fontSize: 38,
      fontWeight: 700,
      color: "#f4f8fb",
      background: "#000000",
      shadow: { enabled: true, color: "#000000", x: 0, y: 6, blur: 16, opacity: 0.44 }
    }),
    transform: (timeline) => ({ ...centered(timeline), y: timeline.height * 0.84 })
  },
  {
    id: "bubble-curve",
    name: "Bubble Curve",
    sample: "Slay",
    color: "#b5548c",
    text: normalizeTextSettings({
      ...base,
      text: "Slay",
      fontSize: 78,
      fontWeight: 900,
      color: "#ffffff",
      stroke: { enabled: true, color: "#ff3f9d", width: 4 },
      glow: { enabled: true, color: "#ff8fd0", size: 18, opacity: 0.44 },
      shadow: { enabled: true, color: "#270217", x: 0, y: 10, blur: 14, opacity: 0.5 },
      curve: { enabled: true, amount: 42 }
    }),
    transform: (timeline) => ({ ...centered(timeline), y: timeline.height * 0.46 })
  },
  {
    id: "clean-punch",
    name: "Clean Punch",
    sample: "Focus",
    color: "#277085",
    text: normalizeTextSettings({
      ...base,
      text: "Focus",
      fontSize: 64,
      fontWeight: 900,
      color: "#ffffff",
      stroke: { enabled: true, color: "#0b1218", width: 2 },
      shadow: { enabled: true, color: "#000000", x: 0, y: 7, blur: 10, opacity: 0.46 }
    }),
    transform: (timeline) => ({ ...centered(timeline), y: timeline.height * 0.5 })
  }
];

export function textStylePresetById(id: string): TextStylePreset | undefined {
  return textStylePresets.find((preset) => preset.id === id);
}
