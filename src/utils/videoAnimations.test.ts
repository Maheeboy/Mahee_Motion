import { describe, expect, it } from "vitest";
import { useEditorStore } from "../store/editorStore";
import type { Project } from "../types/editor";
import { addClipToTimeline, allClips, buildExportPlan, createClip, createProject, parseProject, serializeProject, splitClip, trimClip } from "./timeline";
import {
  applyVideoAnimationPreset,
  defaultVideoClipAnimations,
  inVideoAnimationPresets,
  normalizeVideoClipAnimations,
  outVideoAnimationPresets,
  resolveVideoAnimation,
  videoAnimationProgress
} from "./videoAnimations";

function videoClip() {
  return createClip({
    trackId: "layer-1",
    type: "video",
    name: "Lake",
    timelineStart: 2,
    duration: 6,
    sourceIn: 0,
    sourceOut: 6,
    videoAnimations: {
      in: applyVideoAnimationPreset(defaultVideoClipAnimations().in, inVideoAnimationPresets.find((preset) => preset.id === "slide-up")!),
      out: applyVideoAnimationPreset(defaultVideoClipAnimations().out, outVideoAnimationPresets.find((preset) => preset.id === "fade-out")!)
    }
  });
}

describe("video animation utilities", () => {
  it("calculates progress with delay and clip-relative out timing", () => {
    const clip = {
      ...videoClip(),
      videoAnimations: {
        in: { ...videoClip().videoAnimations!.in, duration: 1, delay: 0.5 },
        out: { ...videoClip().videoAnimations!.out, duration: 1, delay: 0.25 }
      }
    };
    expect(videoAnimationProgress(clip, "in", 2.25)).toBe(0);
    expect(videoAnimationProgress(clip, "in", 3)).toBeCloseTo(0.5);
    expect(videoAnimationProgress(clip, "out", 6.75)).toBe(0);
    expect(videoAnimationProgress(clip, "out", 7.25)).toBeCloseTo(0.5);
  });

  it("clamps overlapping in and out durations on short clips", () => {
    const clip = {
      ...videoClip(),
      duration: 1,
      videoAnimations: {
        in: { ...videoClip().videoAnimations!.in, duration: 2 },
        out: { ...videoClip().videoAnimations!.out, duration: 2 }
      }
    };
    expect(videoAnimationProgress(clip, "in", 2.5)).toBe(1);
    expect(videoAnimationProgress(clip, "out", 2.75)).toBeGreaterThan(0);
  });

  it("resolves slide, zoom, pop, rotate, blur, and wipe visual state", () => {
    expect(resolveVideoAnimation(videoClip(), 2).translateY).toBeGreaterThan(1);
    const zoom = { ...videoClip(), videoAnimations: { in: applyVideoAnimationPreset(undefined, inVideoAnimationPresets.find((preset) => preset.id === "zoom-in")!), out: defaultVideoClipAnimations().out } };
    expect(resolveVideoAnimation(zoom, 2).scale).toBeLessThan(1);
    const pop = { ...videoClip(), videoAnimations: { in: applyVideoAnimationPreset(undefined, inVideoAnimationPresets.find((preset) => preset.id === "pop-in")!), out: defaultVideoClipAnimations().out } };
    expect(resolveVideoAnimation(pop, 2).opacity).toBeCloseTo(0);
    const rotate = { ...videoClip(), videoAnimations: { in: applyVideoAnimationPreset(undefined, inVideoAnimationPresets.find((preset) => preset.id === "rotate-in")!), out: defaultVideoClipAnimations().out } };
    expect(Math.abs(resolveVideoAnimation(rotate, 2).rotation)).toBeGreaterThan(1);
    const blur = { ...videoClip(), videoAnimations: { in: applyVideoAnimationPreset(undefined, inVideoAnimationPresets.find((preset) => preset.id === "blur-in")!), out: defaultVideoClipAnimations().out } };
    expect(resolveVideoAnimation(blur, 2).blur).toBeGreaterThan(1);
    const wipe = { ...videoClip(), videoAnimations: { in: applyVideoAnimationPreset(undefined, inVideoAnimationPresets.find((preset) => preset.id === "wipe-in")!), out: defaultVideoClipAnimations().out } };
    expect(resolveVideoAnimation(wipe, 2).clipPath).toContain("inset");
  });

  it("keeps valid animation settings after trim and split", () => {
    const trimmed = trimClip(videoClip(), "end", -5);
    expect(normalizeVideoClipAnimations(trimmed.videoAnimations).in.duration).toBeGreaterThan(0);
    const split = splitClip(videoClip(), 4);
    expect(split).not.toBeNull();
    expect(normalizeVideoClipAnimations(split![0].videoAnimations).in.enabled).toBe(true);
    expect(normalizeVideoClipAnimations(split![1].videoAnimations).out.enabled).toBe(true);
  });

  it("normalizes missing animation data during save/load", () => {
    const project = createProject();
    const clip = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video" });
    const next: Project = { ...project, timeline: addClipToTimeline(project.timeline, clip) };
    const parsed = parseProject(serializeProject(next));
    expect(normalizeVideoClipAnimations(allClips(parsed.timeline)[0].videoAnimations).in.enabled).toBe(false);
  });

  it("exports visual animation data and warns for compositor-only types", () => {
    const project = createProject();
    const asset = { id: "asset-1", path: "C:/clip.mp4", name: "clip.mp4", type: "video" as const, duration: 6, importedAt: new Date().toISOString() };
    const clip = { ...videoClip(), assetId: asset.id };
    const next: Project = { ...project, assets: { [asset.id]: asset }, timeline: addClipToTimeline(project.timeline, clip) };
    const plan = buildExportPlan(next);
    expect(plan.clips[0].sourceType).toBe("video");
    expect(plan.clips[0].videoAnimations?.in.type).toBe("slide");
    expect(plan.warnings.join(" ")).toContain("require the next compositor pass");
  });

  it("supports undo/redo for inspector video animation edits", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add video clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video" }))
    }));
    useEditorStore.getState().applySelectedVideoAnimationPreset("in", "fade-in");
    expect(normalizeVideoClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].videoAnimations).in.enabled).toBe(true);
    useEditorStore.getState().undo();
    expect(normalizeVideoClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].videoAnimations).in.enabled).toBe(false);
    useEditorStore.getState().redo();
    expect(normalizeVideoClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].videoAnimations).in.type).toBe("fade");
  });
});
