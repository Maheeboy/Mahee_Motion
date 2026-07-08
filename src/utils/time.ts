export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(Math.max(0, seconds) * fps);
}

export function framesToSeconds(frames: number, fps: number): number {
  return fps <= 0 ? 0 : Math.max(0, frames) / fps;
}

export function formatTimecode(seconds: number, fps = 30, showHours = true): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = secondsToFrames(seconds, safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  const s = String(secs).padStart(2, "0");
  const f = String(frames).padStart(2, "0");
  return showHours ? `${h}:${m}:${s}:${f}` : `${m}:${s}`;
}

export function pixelsToSeconds(x: number, pxPerSecond: number): number {
  return pxPerSecond <= 0 ? 0 : x / pxPerSecond;
}

export function secondsToPixels(seconds: number, pxPerSecond: number): number {
  return Math.max(0, seconds) * Math.max(1, pxPerSecond);
}
