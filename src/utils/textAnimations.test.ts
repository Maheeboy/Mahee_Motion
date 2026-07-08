import { describe, expect, it } from "vitest";
import { useEditorStore } from "../store/editorStore";
import type { Project } from "../types/editor";
import { addClipToTimeline, allClips, buildExportPlan, createClip, createProject, defaultTextSettings, parseProject, serializeProject } from "./timeline";
import {
  applyTextAnimationPreset,
  defaultTextClipAnimations,
  inTextAnimationPresets,
  normalizeTextClipAnimations,
  outTextAnimationPresets,
  resolveTextAnimation,
  textAnimationProgress
} from "./textAnimations";

function textClip() {
  return createClip({
    trackId: "layer-1",
    type: "text",
    name: "Title",
    timelineStart: 2,
    duration: 4,
    text: { ...defaultTextSettings(), text: "Hi 👋\nWorld", fontFamily: "Satoshi", fontSize: 64, fontWeight: 700, color: "#fff", background: "transparent", align: "center" },
    textAnimations: {
      in: applyTextAnimationPreset(defaultTextClipAnimations().in, inTextAnimationPresets.find((preset) => preset.id === "slide-up")!),
      out: applyTextAnimationPreset(defaultTextClipAnimations().out, outTextAnimationPresets.find((preset) => preset.id === "fade-out")!)
    }
  });
}

describe("text animation utilities", () => {
  it("calculates in/out progress from clip-relative time with delay", () => {
    const clip = {
      ...textClip(),
      textAnimations: {
        in: { ...textClip().textAnimations!.in, duration: 1, delay: 0.5 },
        out: { ...textClip().textAnimations!.out, duration: 1, delay: 0.25 }
      }
    };
    expect(textAnimationProgress(clip, "in", 2.25)).toBe(0);
    expect(textAnimationProgress(clip, "in", 3)).toBeCloseTo(0.5);
    expect(textAnimationProgress(clip, "out", 4.75)).toBe(0);
    expect(textAnimationProgress(clip, "out", 5.25)).toBeCloseTo(0.5);
  });

  it("clamps overlapping in and out windows inside short clips", () => {
    const clip = {
      ...textClip(),
      duration: 1,
      textAnimations: {
        in: { ...textClip().textAnimations!.in, duration: 2, delay: 0 },
        out: { ...textClip().textAnimations!.out, duration: 2, delay: 0 }
      }
    };
    expect(textAnimationProgress(clip, "in", 2.5)).toBe(1);
    expect(textAnimationProgress(clip, "out", 2.75)).toBeGreaterThan(0);
  });

  it("composes slide, pop, zoom, and blur without changing base text state", () => {
    const slide = resolveTextAnimation(textClip(), 2, "Title");
    expect(slide.translateY).toBeGreaterThan(1);
    const popClip = { ...textClip(), textAnimations: { in: applyTextAnimationPreset(undefined, inTextAnimationPresets.find((preset) => preset.id === "pop-in")!), out: defaultTextClipAnimations().out } };
    expect(resolveTextAnimation(popClip, 2, "Title").scaleX).toBeLessThan(1);
    const blurClip = { ...textClip(), textAnimations: { in: applyTextAnimationPreset(undefined, inTextAnimationPresets.find((preset) => preset.id === "blur-in")!), out: defaultTextClipAnimations().out } };
    expect(resolveTextAnimation(blurClip, 2, "Title").blur).toBeGreaterThan(1);
  });

  it("reveals Unicode and multiline text by grapheme for typewriter", () => {
    const clip = {
      ...textClip(),
      textAnimations: {
        in: { ...applyTextAnimationPreset(undefined, inTextAnimationPresets.find((preset) => preset.id === "typewriter")!), duration: 1 },
        out: defaultTextClipAnimations().out
      }
    };
    const early = resolveTextAnimation(clip, 2.25, "A👋\nB").visibleText ?? "";
    expect(early.length).toBeGreaterThan(0);
    expect(early).not.toContain("B");
    expect(resolveTextAnimation(clip, 3.1, "A👋\nB").visibleText).toBe("A👋\nB");
  });

  it("normalizes missing animation data during save/load", () => {
    const project = createProject();
    const clip = createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Text" });
    const next: Project = { ...project, timeline: addClipToTimeline(project.timeline, clip) };
    const parsed = parseProject(serializeProject(next));
    expect(normalizeTextClipAnimations(allClips(parsed.timeline)[0].textAnimations).in.enabled).toBe(false);
  });

  it("warns when animated text cannot be burned into MVP export", () => {
    const project = createProject();
    const clip = textClip();
    const next: Project = { ...project, timeline: addClipToTimeline(project.timeline, clip) };
    expect(buildExportPlan(next).warnings.join(" ")).toContain("Text animations preview and save");
  });

  it("supports undo/redo for inspector text animation edits", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add text clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Text" }))
    }));
    useEditorStore.getState().applySelectedTextAnimationPreset("in", "fade-in");
    expect(normalizeTextClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].textAnimations).in.enabled).toBe(true);
    useEditorStore.getState().undo();
    expect(normalizeTextClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].textAnimations).in.enabled).toBe(false);
    useEditorStore.getState().redo();
    expect(normalizeTextClipAnimations(allClips(useEditorStore.getState().project.timeline)[0].textAnimations).in.type).toBe("fade");
  });
});
