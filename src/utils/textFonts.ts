import type { TextSettings } from "../types/editor";

export interface TextFontOption {
  label: string;
  family: string;
  weight: number;
  style?: "normal" | "italic";
}

export const textFontOptions: TextFontOption[] = [
  { label: "Satoshi Regular", family: "Satoshi", weight: 400 },
  { label: "Satoshi Light", family: "Satoshi", weight: 300 },
  { label: "Satoshi Medium", family: "Satoshi", weight: 500 },
  { label: "Satoshi Bold", family: "Satoshi", weight: 700 },
  { label: "Satoshi Black", family: "Satoshi", weight: 900 },
  { label: "Satoshi Italic", family: "Satoshi", weight: 400, style: "italic" },
  { label: "Satoshi Bold Italic", family: "Satoshi", weight: 700, style: "italic" }
];

export function applyTextFont(text: TextSettings, font: TextFontOption): TextSettings {
  return {
    ...text,
    fontFamily: font.style === "italic" ? `${font.family} Italic` : font.family,
    fontWeight: font.weight
  };
}
