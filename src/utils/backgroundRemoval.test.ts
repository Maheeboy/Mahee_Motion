import { describe, expect, it } from "vitest";
import { ffmpegFilterForBackgroundRemoval, keyedAlphaForPixel, normalizeBackgroundRemovalSettings } from "./backgroundRemoval";

describe("background removal", () => {
  it("keys green screen pixels using chroma distance", () => {
    const settings = normalizeBackgroundRemovalSettings({ enabled: true, mode: "green-screen", tolerance: 0.28, softness: 0.12 });
    expect(keyedAlphaForPixel(0, 178, 64, settings)).toBeLessThan(0.2);
    expect(keyedAlphaForPixel(218, 172, 132, settings)).toBeGreaterThan(0.8);
  });

  it("uses softness to create a gradual alpha transition", () => {
    const hard = normalizeBackgroundRemovalSettings({ enabled: true, mode: "green-screen", tolerance: 0.2, softness: 0.02 });
    const soft = normalizeBackgroundRemovalSettings({ enabled: true, mode: "green-screen", tolerance: 0.2, softness: 0.45 });
    const sample = [80, 140, 90] as const;
    expect(keyedAlphaForPixel(...sample, soft)).toBeLessThan(keyedAlphaForPixel(...sample, hard));
  });

  it("supports bright and dark luma keying", () => {
    const bright = normalizeBackgroundRemovalSettings({ enabled: true, mode: "luma-key", lumaKey: "bright", lumaThreshold: 0.65, lumaSoftness: 0.1 });
    const dark = normalizeBackgroundRemovalSettings({ enabled: true, mode: "luma-key", lumaKey: "dark", lumaThreshold: 0.35, lumaSoftness: 0.1 });
    expect(keyedAlphaForPixel(245, 245, 245, bright)).toBeLessThan(0.2);
    expect(keyedAlphaForPixel(20, 20, 20, dark)).toBeLessThan(0.2);
  });

  it("maps export-supported keyers to ffmpeg filters", () => {
    expect(ffmpegFilterForBackgroundRemoval({ enabled: true, mode: "custom-color", keyColor: "#12ab34" })).toContain("chromakey=0x12ab34");
    expect(ffmpegFilterForBackgroundRemoval({ enabled: true, mode: "luma-key" })).toContain("lumakey=");
    expect(ffmpegFilterForBackgroundRemoval({ enabled: true, mode: "difference-key" })).toBeUndefined();
  });
});
