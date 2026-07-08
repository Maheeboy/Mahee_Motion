import { describe, expect, it } from "vitest";
import { createTransition, nearestTransitionDropZone, transitionDropZone } from "./transitions";
import { addClipToTimeline, buildExportPlan, createClip, createProject, normalizeTimeline, parseProject, serializeProject } from "./timeline";

function transitionFixture() {
  const project = createProject("Transition Test");
  const trackId = project.timeline.tracks[0].id;
  const left = createClip({
    id: "left-clip",
    trackId,
    type: "video",
    name: "Left.mp4",
    assetId: "left-asset",
    timelineStart: 0,
    duration: 4,
    sourceOut: 4
  });
  const right = createClip({
    id: "right-clip",
    trackId,
    type: "video",
    name: "Right.mp4",
    assetId: "right-asset",
    timelineStart: 4,
    duration: 4,
    sourceOut: 4
  });
  project.assets[left.assetId!] = { id: left.assetId!, name: "Left.mp4", path: "C:/media/left.mp4", type: "video", duration: 4, importedAt: "2026-01-01T00:00:00.000Z" };
  project.assets[right.assetId!] = { id: right.assetId!, name: "Right.mp4", path: "C:/media/right.mp4", type: "video", duration: 4, importedAt: "2026-01-01T00:00:00.000Z" };
  project.timeline = addClipToTimeline(addClipToTimeline(project.timeline, left), right);
  return { project, trackId, left, right };
}

describe("timeline transitions", () => {
  it("detects adjacent visual cut drop zones", () => {
    const { project, trackId, left, right } = transitionFixture();
    const zone = transitionDropZone(project.timeline, trackId, 4.02, 0.8);

    expect(zone.valid).toBe(true);
    expect(zone.placement).toBe("between");
    expect(zone.leftClipId).toBe(left.id);
    expect(zone.rightClipId).toBe(right.id);
    expect(zone.time).toBe(4);
  });

  it("finds the nearest transition cut for plus-button insertion", () => {
    const { project, trackId, left, right } = transitionFixture();
    const zone = nearestTransitionDropZone(project.timeline, 3.8, 0.8);

    expect(zone).toMatchObject({
      valid: true,
      trackId,
      placement: "between",
      leftClipId: left.id,
      rightClipId: right.id,
      time: 4
    });
  });

  it("allows start and end edge transitions on visual clips", () => {
    const { project, trackId, left, right } = transitionFixture();

    expect(transitionDropZone(project.timeline, trackId, 0.05, 0.8)).toMatchObject({ valid: true, placement: "in", rightClipId: left.id });
    expect(transitionDropZone(project.timeline, trackId, 8, 0.8)).toMatchObject({ valid: true, placement: "out", leftClipId: right.id });
  });

  it("rejects audio-only layers and unlocked misses", () => {
    const { project } = transitionFixture();
    const audioTrack = project.timeline.tracks[1].id;

    expect(transitionDropZone(project.timeline, audioTrack, 2, 0.8)).toMatchObject({ valid: false });
    expect(transitionDropZone(project.timeline, undefined, 2, 0.8)).toMatchObject({ valid: false });
  });

  it("clamps transition duration to connected clip duration and cleans orphaned transitions", () => {
    const { project, trackId, left } = transitionFixture();
    const zone = transitionDropZone(project.timeline, trackId, 4, 10);
    const transition = createTransition("cross-dissolve", zone);

    const withTransition = normalizeTimeline({ ...project.timeline, transitions: [transition] });
    expect(withTransition.transitions?.[0].duration).toBe(4);

    const withoutLeft = normalizeTimeline({
      ...withTransition,
      tracks: withTransition.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== left.id) }))
    });
    expect(withoutLeft.transitions).toEqual([]);
  });

  it("serializes transitions and includes export mapping warnings", () => {
    const { project, trackId } = transitionFixture();
    const transition = createTransition("slide-left", transitionDropZone(project.timeline, trackId, 4, 0.75));
    project.timeline = normalizeTimeline({ ...project.timeline, transitions: [transition], selectedTransitionId: transition.id });

    const restored = parseProject(serializeProject(project));
    expect(restored.timeline.transitions?.[0]).toMatchObject({ id: transition.id, type: "slide-left", placement: "between" });
    expect(restored.timeline.selectedTransitionId).toBe(transition.id);

    const plan = buildExportPlan(restored);
    expect(plan.transitions[0]).toMatchObject({ type: "slide-left", ffmpegXfade: "slideleft", compatibility: "fully-supported" });
    expect(plan.warnings.join(" ")).toContain("transitions are mapped");
  });
});
