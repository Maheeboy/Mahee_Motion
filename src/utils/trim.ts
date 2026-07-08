import { clamp } from "./time";

export const MIN_TRIM_DURATION = 0.1;

export interface TrimRange {
  inPoint: number;
  outPoint: number;
}

export function formatTrimTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const centiseconds = Math.floor((safe - whole) * 100);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

export function parseTrimTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0)) return null;
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
}

export function clampTrimRange(range: TrimRange, duration: number, minimum = MIN_TRIM_DURATION): TrimRange {
  const safeDuration = Math.max(minimum, Number.isFinite(duration) ? duration : minimum);
  const inPoint = clamp(range.inPoint, 0, Math.max(0, safeDuration - minimum));
  const outPoint = clamp(range.outPoint, inPoint + minimum, safeDuration);
  return { inPoint, outPoint };
}

export function trimDuration(range: TrimRange): number {
  return Math.max(0, range.outPoint - range.inPoint);
}

export function validateTrimRange(range: TrimRange, duration: number, minimum = MIN_TRIM_DURATION): string | null {
  if (!Number.isFinite(range.inPoint) || !Number.isFinite(range.outPoint)) return "Enter valid In and Out times.";
  if (range.inPoint < 0) return "In point cannot be before the start.";
  if (range.outPoint > duration) return "Out point cannot be after the media duration.";
  if (range.outPoint <= range.inPoint) return "Out point must be after In point.";
  if (range.outPoint - range.inPoint < minimum) return `Selected range must be at least ${minimum.toFixed(1)}s.`;
  return null;
}

export function nudgeTrimValue(value: number, delta: number, duration: number): number {
  return clamp(value + delta, 0, Math.max(0, duration));
}

export function frameStep(fps?: number): number {
  return fps && fps > 0 ? 1 / fps : 0.1;
}
