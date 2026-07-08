import type { BezierPoint, MaskBlendMode, MaskInstance, MaskKeyframe, MaskSnapshot, MaskType, Timeline, TimelineClip } from "../types/editor";
import { clamp } from "./time";

export const maskTypes: Array<{ type: MaskType; label: string }> = [
  { type: "rectangle", label: "Rectangle" },
  { type: "rounded-rectangle", label: "Rounded" },
  { type: "circle", label: "Circle" },
  { type: "ellipse", label: "Ellipse" },
  { type: "bezier", label: "Custom" }
];

const maskTypeSet = new Set(maskTypes.map((item) => item.type));

export function bezierBounds(points: BezierPoint[] | undefined, fallback: Pick<Timeline, "width" | "height">): { position: { x: number; y: number }; width: number; height: number } {
  if (!points?.length) {
    return {
      position: { x: fallback.width / 2, y: fallback.height / 2 },
      width: Math.round(fallback.width * 0.44),
      height: Math.round(fallback.height * 0.44)
    };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: Math.max(8, maxX - minX),
    height: Math.max(8, maxY - minY)
  };
}

export function isVisualMaskClip(clip?: Pick<TimelineClip, "type">): boolean {
  return Boolean(clip && clip.type !== "audio");
}

export function defaultBezierPoints(width: number, height: number): BezierPoint[] {
  return [
    { id: crypto.randomUUID(), x: width * 0.35, y: height * 0.28 },
    { id: crypto.randomUUID(), x: width * 0.68, y: height * 0.36 },
    { id: crypto.randomUUID(), x: width * 0.62, y: height * 0.72 },
    { id: crypto.randomUUID(), x: width * 0.31, y: height * 0.64 }
  ];
}

export function defaultMask(type: MaskType, timeline: Pick<Timeline, "width" | "height">): MaskInstance {
  const width = Math.round(timeline.width * 0.44);
  const height = Math.round(timeline.height * 0.44);
  return normalizeMask({
    id: crypto.randomUUID(),
    type,
    name: maskTypes.find((item) => item.type === type)?.label ?? "Mask",
    enabled: true,
    draft: type === "bezier",
    inverted: false,
    blendMode: "add",
    position: { x: timeline.width / 2, y: timeline.height / 2 },
    width,
    height: type === "circle" ? width : height,
    scale: 1,
    rotation: 0,
    feather: 0,
    expansion: 0,
    opacity: 1,
    cornerRadius: type === "rounded-rectangle" ? 48 : 0,
    aspectRatioLocked: type === "circle",
    points: type === "bezier" ? [] : undefined,
    keyframes: []
  }, timeline);
}

function normalizePoint(point: Partial<BezierPoint>, timeline: Pick<Timeline, "width" | "height">): BezierPoint {
  return {
    id: point.id ?? crypto.randomUUID(),
    x: clamp(Number(point.x ?? timeline.width / 2), -timeline.width, timeline.width * 2),
    y: clamp(Number(point.y ?? timeline.height / 2), -timeline.height, timeline.height * 2),
    in: point.in,
    out: point.out,
    smooth: Boolean(point.smooth)
  };
}

export function normalizeMask(input: Partial<MaskInstance>, timeline: Pick<Timeline, "width" | "height">): MaskInstance {
  const type = maskTypeSet.has(input.type as MaskType) ? input.type as MaskType : "rectangle";
  const width = clamp(Number(input.width ?? timeline.width * 0.44), 4, timeline.width * 2);
  const height = clamp(Number(input.height ?? timeline.height * 0.44), 4, timeline.height * 2);
  const aspectRatioLocked = Boolean(input.aspectRatioLocked ?? type === "circle");
  const normalized: MaskInstance = {
    id: input.id ?? crypto.randomUUID(),
    type,
    name: input.name ?? maskTypes.find((item) => item.type === type)?.label ?? "Mask",
    enabled: input.enabled ?? true,
    draft: type === "bezier" ? Boolean(input.draft) : undefined,
    inverted: Boolean(input.inverted),
    blendMode: (["add", "subtract", "intersect"] as MaskBlendMode[]).includes(input.blendMode as MaskBlendMode) ? input.blendMode as MaskBlendMode : "add",
    position: {
      x: clamp(Number(input.position?.x ?? timeline.width / 2), -timeline.width, timeline.width * 2),
      y: clamp(Number(input.position?.y ?? timeline.height / 2), -timeline.height, timeline.height * 2)
    },
    width,
    height: type === "circle" || aspectRatioLocked ? width : height,
    scale: clamp(Number(input.scale ?? 1), 0.05, 8),
    rotation: clamp(Number(input.rotation ?? 0), -360, 360),
    feather: clamp(Number(input.feather ?? 0), 0, 200),
    expansion: clamp(Number(input.expansion ?? 0), -200, 200),
    opacity: clamp(Number(input.opacity ?? 1), 0, 1),
    cornerRadius: clamp(Number(input.cornerRadius ?? (type === "rounded-rectangle" ? 48 : 0)), 0, 400),
    aspectRatioLocked,
    points: type === "bezier" ? (input.points ?? []).map((point) => normalizePoint(point, timeline)) : undefined,
    keyframes: []
  };
  normalized.keyframes = (input.keyframes ?? []).map((keyframe) => normalizeMaskKeyframe(keyframe, normalized, timeline)).sort((a, b) => a.time - b.time);
  return normalized;
}

export function normalizeMasks(masks: MaskInstance[] | undefined, timeline: Pick<Timeline, "width" | "height">): MaskInstance[] {
  return (masks ?? []).map((mask) => normalizeMask(mask, timeline));
}

function snapshot(mask: MaskSnapshot): MaskSnapshot {
  return {
    position: { ...mask.position },
    width: mask.width,
    height: mask.height,
    scale: mask.scale,
    rotation: mask.rotation,
    feather: mask.feather,
    expansion: mask.expansion,
    opacity: mask.opacity,
    cornerRadius: mask.cornerRadius,
    points: mask.points?.map((point) => ({ ...point, in: point.in ? { ...point.in } : undefined, out: point.out ? { ...point.out } : undefined }))
  };
}

function normalizeMaskKeyframe(input: Partial<MaskKeyframe>, base: MaskInstance, timeline: Pick<Timeline, "width" | "height">): MaskKeyframe {
  const merged = normalizeMask({ ...base, ...input, id: base.id, keyframes: [] }, timeline);
  return {
    ...snapshot(merged),
    id: input.id ?? crypto.randomUUID(),
    time: clamp(Number(input.time ?? 0), 0, Number.MAX_SAFE_INTEGER)
  };
}

function interpolate(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

function interpolateSnapshot(left: MaskSnapshot, right: MaskSnapshot, ratio: number): MaskSnapshot {
  return {
    position: {
      x: interpolate(left.position.x, right.position.x, ratio),
      y: interpolate(left.position.y, right.position.y, ratio)
    },
    width: interpolate(left.width, right.width, ratio),
    height: interpolate(left.height, right.height, ratio),
    scale: interpolate(left.scale, right.scale, ratio),
    rotation: interpolate(left.rotation, right.rotation, ratio),
    feather: interpolate(left.feather, right.feather, ratio),
    expansion: interpolate(left.expansion, right.expansion, ratio),
    opacity: interpolate(left.opacity, right.opacity, ratio),
    cornerRadius: interpolate(left.cornerRadius ?? 0, right.cornerRadius ?? 0, ratio),
    points: left.points?.length === right.points?.length ? left.points?.map((point, index) => ({
      ...point,
      x: interpolate(point.x, right.points?.[index]?.x ?? point.x, ratio),
      y: interpolate(point.y, right.points?.[index]?.y ?? point.y, ratio)
    })) : left.points
  };
}

export function evaluateMaskAtTime(mask: MaskInstance, clip: Pick<TimelineClip, "timelineStart" | "duration">, absoluteTime: number): MaskInstance {
  const base = { ...mask, keyframes: [...mask.keyframes].sort((a, b) => a.time - b.time) };
  if (!base.keyframes.length) return base;
  const local = clamp(absoluteTime - clip.timelineStart, 0, clip.duration);
  const first = base.keyframes[0];
  const last = base.keyframes[base.keyframes.length - 1];
  if (local <= first.time) return { ...base, ...snapshot(first) };
  if (local >= last.time) return { ...base, ...snapshot(last) };
  const rightIndex = base.keyframes.findIndex((keyframe) => keyframe.time >= local);
  const left = base.keyframes[Math.max(0, rightIndex - 1)];
  const right = base.keyframes[rightIndex];
  const ratio = right.time <= left.time ? 0 : clamp((local - left.time) / (right.time - left.time), 0, 1);
  return { ...base, ...interpolateSnapshot(left, right, ratio) };
}

export function upsertMaskKeyframe(mask: MaskInstance, clip: Pick<TimelineClip, "timelineStart" | "duration">, absoluteTime: number, timeline: Pick<Timeline, "width" | "height">): MaskInstance {
  const time = clamp(absoluteTime - clip.timelineStart, 0, clip.duration);
  const existing = mask.keyframes.find((keyframe) => Math.abs(keyframe.time - time) < 1 / 120);
  const nextKeyframe = normalizeMaskKeyframe({ ...snapshot(mask), id: existing?.id, time }, mask, timeline);
  const keyframes = existing
    ? mask.keyframes.map((keyframe) => keyframe.id === existing.id ? nextKeyframe : keyframe)
    : [...mask.keyframes, nextKeyframe];
  return { ...mask, keyframes: keyframes.sort((a, b) => a.time - b.time) };
}

export function removeMaskKeyframe(mask: MaskInstance, keyframeId: string): MaskInstance {
  return { ...mask, keyframes: mask.keyframes.filter((keyframe) => keyframe.id !== keyframeId) };
}

export function updateMask(mask: MaskInstance, patch: Partial<MaskInstance>, timeline: Pick<Timeline, "width" | "height">): MaskInstance {
  const next = normalizeMask({ ...mask, ...patch, keyframes: mask.keyframes }, timeline);
  return { ...next, keyframes: mask.keyframes };
}

function escapeSvg(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function maskFilterId(mask: MaskInstance): string {
  return `mask-feather-${mask.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function polygonPath(points: Array<[number, number]>): string {
  return `${points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} Z`;
}

function framePath(timeline: Pick<Timeline, "width" | "height">): string {
  return `M 0 0 H ${timeline.width} V ${timeline.height} H 0 Z`;
}

function inverseMaskPath(mask: MaskInstance, timeline: Pick<Timeline, "width" | "height">): string {
  return `${framePath(timeline)} ${maskShapePath(mask)}`;
}

export function maskShapePath(mask: MaskInstance): string {
  const w = Math.max(4, (mask.width + mask.expansion * 2) * mask.scale);
  const h = Math.max(4, (mask.height + mask.expansion * 2) * mask.scale);
  const x = mask.position.x;
  const y = mask.position.y;
  if (mask.type === "circle" || mask.type === "ellipse") {
    const rx = mask.type === "circle" ? w / 2 : w / 2;
    const ry = mask.type === "circle" ? w / 2 : h / 2;
    return `M ${x - rx} ${y} A ${rx} ${ry} 0 1 0 ${x + rx} ${y} A ${rx} ${ry} 0 1 0 ${x - rx} ${y} Z`;
  }
  if (mask.type === "bezier") {
    const points = mask.points ?? [];
    if (points.length < 3) return "";
    return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;
  }
  const rx = mask.type === "rounded-rectangle" ? Math.min(mask.cornerRadius ?? 0, w / 2, h / 2) : 0;
  if (rx <= 0) return polygonPath([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]]);
  return `M ${x - w / 2 + rx} ${y - h / 2} H ${x + w / 2 - rx} A ${rx} ${rx} 0 0 1 ${x + w / 2} ${y - h / 2 + rx} V ${y + h / 2 - rx} A ${rx} ${rx} 0 0 1 ${x + w / 2 - rx} ${y + h / 2} H ${x - w / 2 + rx} A ${rx} ${rx} 0 0 1 ${x - w / 2} ${y + h / 2 - rx} V ${y - h / 2 + rx} A ${rx} ${rx} 0 0 1 ${x - w / 2 + rx} ${y - h / 2} Z`;
}

export function buildMaskDataUrl(masks: MaskInstance[] | undefined, clip: TimelineClip, timeline: Pick<Timeline, "width" | "height">, absoluteTime: number): string | undefined {
  const active = normalizeMasks(masks, timeline).filter((mask) => mask.enabled);
  if (!active.length) return undefined;
  const evaluated = active
    .map((mask) => evaluateMaskAtTime(mask, clip, absoluteTime))
    .filter((mask) => !mask.draft)
    .filter((mask) => mask.type !== "bezier" || (mask.points?.length ?? 0) >= 3);
  if (!evaluated.length) return undefined;
  const baseMasks = evaluated.filter((mask) => mask.blendMode !== "intersect" && !(mask.blendMode === "subtract" && mask.inverted));
  const intersectMasks = evaluated.filter((mask) => mask.blendMode === "intersect" || (mask.blendMode === "subtract" && mask.inverted));
  const hasNormalAdd = baseMasks.some((mask) => mask.blendMode === "add" && !mask.inverted);
  const hasInvertedAdd = baseMasks.some((mask) => mask.blendMode === "add" && mask.inverted);
  const background = hasNormalAdd && !hasInvertedAdd ? "black" : "white";
  const filters = evaluated
    .filter((mask) => mask.feather > 0)
    .map((mask) => `<filter id="${maskFilterId(mask)}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${Math.max(0.1, mask.feather / 3).toFixed(2)}"/></filter>`)
    .join("");
  const pathElement = (mask: MaskInstance, color: "white" | "black", path = maskShapePath(mask)) => {
    if (!path) return "";
    return `<path d="${escapeSvg(path)}" fill="${color}" fill-opacity="${mask.opacity}" fill-rule="evenodd" transform="rotate(${mask.rotation} ${mask.position.x} ${mask.position.y})" ${mask.feather ? `filter="url(#${maskFilterId(mask)})"` : ""}/>`;
  };
  const basePaths = baseMasks.map((mask) => {
    if (mask.blendMode === "subtract" && mask.inverted) return pathElement(mask, "white");
    if (mask.blendMode === "subtract") return pathElement(mask, "black");
    if (mask.inverted) return pathElement(mask, "black");
    return pathElement(mask, "white");
  }).join("");
  const intersectPaths = intersectMasks.map((mask) => (
    mask.inverted
      ? pathElement(mask, "white", inverseMaskPath(mask, timeline))
      : pathElement(mask, "white")
  )).join("");
  const intersectDef = intersectMasks.length
    ? `<mask id="intersect-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${timeline.width}" height="${timeline.height}" mask-type="luminance"><rect width="100%" height="100%" fill="black"/>${intersectPaths}</mask>`
    : "";
  const content = intersectMasks.length
    ? `<g mask="url(#intersect-mask)"><rect width="100%" height="100%" fill="white" mask="url(#clip-mask)"/></g>`
    : `<rect width="100%" height="100%" fill="white" mask="url(#clip-mask)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${timeline.width}" height="${timeline.height}" viewBox="0 0 ${timeline.width} ${timeline.height}"><defs>${filters}<mask id="clip-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${timeline.width}" height="${timeline.height}" mask-type="luminance"><rect width="100%" height="100%" fill="${background}"/>${basePaths}</mask>${intersectDef}</defs>${content}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
