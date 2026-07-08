import { describe, expect, it } from "vitest";
import { clampTrimRange, formatTrimTime, frameStep, nudgeTrimValue, parseTrimTime, trimDuration, validateTrimRange } from "./trim";

describe("trim utilities", () => {
  it("formats and parses seconds consistently", () => {
    expect(formatTrimTime(12.345)).toBe("00:00:12.34");
    expect(parseTrimTime("00:01:02.50")).toBe(62.5);
    expect(parseTrimTime("01:02.25")).toBe(62.25);
    expect(parseTrimTime("7.5")).toBe(7.5);
    expect(parseTrimTime("not time")).toBeNull();
  });

  it("clamps trim ranges to media duration and minimum duration", () => {
    expect(clampTrimRange({ inPoint: -1, outPoint: 30 }, 10)).toEqual({ inPoint: 0, outPoint: 10 });
    expect(clampTrimRange({ inPoint: 9.98, outPoint: 10 }, 10)).toEqual({ inPoint: 9.9, outPoint: 10 });
  });

  it("validates trim ranges and calculates selected duration", () => {
    expect(validateTrimRange({ inPoint: 1, outPoint: 2 }, 3)).toBeNull();
    expect(validateTrimRange({ inPoint: 2, outPoint: 2 }, 3)).toContain("after In");
    expect(validateTrimRange({ inPoint: 0, outPoint: 0.05 }, 3)).toContain("at least");
    expect(trimDuration({ inPoint: 1.25, outPoint: 4 })).toBe(2.75);
  });

  it("nudges safely and supports frame steps", () => {
    expect(nudgeTrimValue(1, -2, 10)).toBe(0);
    expect(nudgeTrimValue(9.9, 2, 10)).toBe(10);
    expect(frameStep(25)).toBeCloseTo(0.04);
    expect(frameStep()).toBe(0.1);
  });
});
