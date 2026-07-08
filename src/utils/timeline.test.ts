import { describe, expect, it } from "vitest";
import { formatTimecode, framesToSeconds, secondsToFrames } from "./time";
import {
  addExtractedAudioClip,
  addClipToTimeline,
  addTimelineMarker,
  allClips,
  buildAudioExportPlan,
  buildExportPlan,
  centerTransform,
  canCreateCompoundClip,
  canExtractAudioFromClip,
  canUncompoundClip,
  createClip,
  createCompoundClipFromSelection,
  createProject,
  defaultAudioSettings,
  defaultColorSettings,
  defaultTextSettings,
  defaultTransform,
  duplicateSelectedClips,
  evaluateAudioAtTime,
  evaluateColorAtTime,
  evaluateSpeedAtTime,
  evaluateTransformAtTime,
  getAudibleClipsAtTime,
  getClipEnd,
  getMagneticSnapTargets,
  getVisibleClipsAtTime,
  isClipCompatibleWithTrack,
  migrateProject,
  moveClip,
  parseProject,
  removeTimelineMarker,
  resolveMagneticSnap,
  resetTransformForTimeline,
  scaleTransformToFit,
  serializeProject,
  setSelectedClips,
  setClipSpeed,
  snapTime,
  sourceTimeAtTimelineTime,
  textClipPreviewLabel,
  trackForAsset,
  splitClip,
  trimClip,
  uncompoundClip,
  upsertAudioKeyframe,
  upsertColorKeyframe,
  upsertSpeedKeyframe,
  upsertTransformKeyframe
} from "./timeline";
import type { AspectRatioPreset, Project } from "../types/editor";
import { useEditorStore } from "../store/editorStore";
import { shouldOfferRecovery, sortRecoveryCandidates } from "./persistence";
import { buildColorFilter, effectiveBasicSettings, exportColorGrade, normalizeColorSettings } from "./colorGrade";
import { createEffectFromPreset, effectCategories, exportFilterForEffect, normalizeEffects, unsupportedExportEffects } from "./effects";
import { colorFilterPresets } from "./filters";
import { textStylePresets } from "./textStylePresets";
import { buildMaskDataUrl, defaultMask, evaluateMaskAtTime, maskShapePath, normalizeMasks, upsertMaskKeyframe } from "./masks";
import { animatedStickerPresets, staticStickerPresets } from "./stickers";

describe("time utilities", () => {
  it("formats timecode with the supplied fps", () => {
    expect(formatTimecode(12.5, 30)).toBe("00:00:12:15");
    expect(formatTimecode(1.5, 24)).toBe("00:00:01:12");
  });

  it("converts seconds and frames", () => {
    expect(secondsToFrames(2.5, 30)).toBe(75);
    expect(framesToSeconds(48, 24)).toBe(2);
  });
});

describe("timeline math", () => {
  const videoAsset = {
    id: "video-asset",
    path: "C:/media/lake.mp4",
    name: "Lake.mp4",
    type: "video" as const,
    duration: 12,
    sampleRate: 48000,
    channels: 2,
    waveformPeaks: [0.2, 0.8, 0.5],
    importedAt: "2026-01-01T00:00:00.000Z"
  };
  const extractedAudioAsset = {
    id: "audio-asset",
    path: "C:/media/lake-audio.m4a",
    name: "Lake audio.m4a",
    type: "audio" as const,
    duration: 12,
    sampleRate: 48000,
    channels: 2,
    waveformPeaks: [0.25, 0.9, 0.45],
    importedAt: "2026-01-01T00:00:01.000Z"
  };

  it("resolves magnetic snapping to the nearest clip edge, playhead, marker, or start", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "First", timelineStart: 0, duration: 5 });
    const second = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Second", timelineStart: 10, duration: 4 });
    let timeline = addClipToTimeline(project.timeline, first);
    timeline = addClipToTimeline(timeline, second);
    timeline = addTimelineMarker({ ...timeline, playhead: 8 }, 14, "Beat");
    const targets = getMagneticSnapTargets(timeline, second.id);

    expect(resolveMagneticSnap(5.07, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 5, edge: "start" });
    expect(resolveMagneticSnap(4.94, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 5, edge: "start" });
    expect(resolveMagneticSnap(4.03, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 4, edge: "end" });
    expect(resolveMagneticSnap(7.95, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 8, edge: "start" });
    expect(resolveMagneticSnap(13.96, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 14, edge: "start" });
    expect(resolveMagneticSnap(-0.04, second.duration, targets, 8 / 100)).toMatchObject({ snapped: true, start: 0, edge: "start" });
  });

  it("uses a zoom-dependent snap threshold and supports bypassing snap by skipping the resolver", () => {
    const targets = [{ time: 5, kind: "clip-end" as const, clipId: "a" }];

    expect(resolveMagneticSnap(4.7, 3, targets, 8 / 10).snapped).toBe(true);
    expect(resolveMagneticSnap(4.7, 3, targets, 8 / 100).snapped).toBe(false);

    const rawStart = Math.max(0, 4.7);
    expect(rawStart).toBe(4.7);
  });

  it("defaults imported visual media to layer 3 and audio media to layer 4", () => {
    const project = createProject();

    expect(trackForAsset(project.timeline, videoAsset)?.id).toBe(project.timeline.tracks[2].id);
    expect(trackForAsset(project.timeline, extractedAudioAsset)?.id).toBe(project.timeline.tracks[3].id);
  });

  it("creates a non-destructive compound clip from selected clips across layers", () => {
    const project = createProject();
    const video = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video", timelineStart: 2, duration: 6 });
    const audio = createClip({ trackId: project.timeline.tracks[1].id, type: "audio", name: "Audio", timelineStart: 1, duration: 8 });
    const text = createClip({ trackId: project.timeline.tracks[2].id, type: "text", name: "Text", timelineStart: 3, duration: 2 });
    let timeline = addClipToTimeline(project.timeline, video);
    timeline = addClipToTimeline(timeline, audio);
    timeline = addClipToTimeline(timeline, text);
    timeline = setSelectedClips(timeline, [video.id, audio.id, text.id]);

    expect(canCreateCompoundClip(timeline)).toBe(true);
    const compounded = createCompoundClipFromSelection(timeline);
    const clips = allClips(compounded);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ type: "compound", timelineStart: 1, duration: 8 });
    expect(clips[0].compound?.clips.map((item) => item.clip.timelineStart)).toEqual([1, 0, 2]);
    expect(compounded.selectedClipIds).toEqual([clips[0].id]);
    expect(getVisibleClipsAtTime(compounded, 3.5).map(({ clip }) => clip.name)).toEqual(["Text", "Video"]);
    expect(getAudibleClipsAtTime(compounded, 3.5).map(({ clip }) => clip.name)).toContain("Audio");
  });

  it("allows multiple effect clips to be combined into a compound clip", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "effect", name: "Fine Film", duration: 3 });
    const second = createClip({ trackId: project.timeline.tracks[1].id, type: "effect", name: "Soft Focus", timelineStart: 1, duration: 5 });
    let timeline = addClipToTimeline(project.timeline, first);
    timeline = addClipToTimeline(timeline, second);
    timeline = setSelectedClips(timeline, [first.id, second.id]);

    expect(canCreateCompoundClip(timeline)).toBe(true);
    const compounded = createCompoundClipFromSelection(timeline);
    expect(allClips(compounded)).toHaveLength(1);
    expect(allClips(compounded)[0]).toMatchObject({ type: "compound", duration: 6 });
    expect(allClips(compounded)[0].compound?.clips.map((item) => item.clip.type)).toEqual(["effect", "effect"]);
  });

  it("keeps compound contents aligned when trimming and duplicates nested clip identities", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "First", timelineStart: 0, duration: 4 });
    const second = createClip({ trackId: project.timeline.tracks[1].id, type: "image", name: "Second", timelineStart: 4, duration: 4 });
    let timeline = addClipToTimeline(project.timeline, first);
    timeline = addClipToTimeline(timeline, second);
    timeline = createCompoundClipFromSelection(setSelectedClips(timeline, [first.id, second.id]));
    const compound = allClips(timeline)[0];
    const trimmed = trimClip(compound, "start", 2);

    expect(trimmed.timelineStart).toBe(2);
    expect(trimmed.duration).toBe(6);
    expect(trimmed.sourceIn).toBe(2);
    const trimmedTimeline = {
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === compound.id ? trimmed : clip)
      }))
    };
    expect(getVisibleClipsAtTime(trimmedTimeline, 2.5).map(({ clip }) => clip.name)).toEqual(["First"]);

    const duplicated = duplicateSelectedClips(setSelectedClips(trimmedTimeline, [compound.id]));
    const compounds = allClips(duplicated).filter((clip) => clip.type === "compound");
    expect(compounds).toHaveLength(2);
    expect(compounds[1].compound?.clips[0].clip.id).not.toBe(compounds[0].compound?.clips[0].clip.id);
  });

  it("uncompounds the clicked compound clip back onto layer-colored child clips", () => {
    const project = createProject();
    const video = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video", timelineStart: 2, duration: 6 });
    const audio = createClip({ trackId: project.timeline.tracks[1].id, type: "audio", name: "Audio", timelineStart: 1, duration: 8 });
    let timeline = addClipToTimeline(project.timeline, video);
    timeline = addClipToTimeline(timeline, audio);
    timeline = createCompoundClipFromSelection(setSelectedClips(timeline, [video.id, audio.id]));
    const compound = allClips(timeline)[0];

    expect(canUncompoundClip(timeline, compound.id)).toBe(true);
    const restored = uncompoundClip(timeline, compound.id);
    const clips = allClips(restored);

    expect(clips.map((clip) => clip.type).sort()).toEqual(["audio", "video"]);
    expect(clips.map((clip) => clip.name).sort()).toEqual(["Audio", "Video"]);
    expect(restored.selectedClipIds.sort()).toEqual([audio.id, video.id].sort());
    expect(restored.tracks[0].clips.map((clip) => clip.id)).toEqual([video.id]);
    expect(restored.tracks[1].clips.map((clip) => clip.id)).toEqual([audio.id]);
    expect(restored.tracks[0].clips[0]).toMatchObject({ timelineStart: 2, duration: 6 });
    expect(restored.tracks[1].clips[0]).toMatchObject({ timelineStart: 1, duration: 8 });
  });

  it("uncompounds only the visible child windows after compound trimming", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "First", timelineStart: 0, duration: 4, sourceIn: 0, sourceOut: 4 });
    const second = createClip({ trackId: project.timeline.tracks[1].id, type: "image", name: "Second", timelineStart: 4, duration: 4, sourceIn: 0, sourceOut: 4 });
    let timeline = addClipToTimeline(project.timeline, first);
    timeline = addClipToTimeline(timeline, second);
    timeline = createCompoundClipFromSelection(setSelectedClips(timeline, [first.id, second.id]));
    const compound = allClips(timeline)[0];
    const trimmed = trimClip(compound, "start", 2);
    timeline = {
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === compound.id ? trimmed : clip)
      }))
    };

    const restored = uncompoundClip(timeline, compound.id);
    const clips = allClips(restored).sort((a, b) => a.timelineStart - b.timelineStart);

    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ name: "First", timelineStart: 2, duration: 2, sourceIn: 2, sourceOut: 4 });
    expect(clips[1]).toMatchObject({ name: "Second", timelineStart: 4, duration: 4, sourceIn: 0, sourceOut: 4 });
  });

  it("creates compound clips through undoable store history", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "First", duration: 3 });
    const second = createClip({ trackId: project.timeline.tracks[1].id, type: "audio", name: "Second", duration: 3 });
    project.timeline = setSelectedClips(addClipToTimeline(addClipToTimeline(project.timeline, first), second), [first.id, second.id]);
    useEditorStore.getState().setProject(project);

    useEditorStore.getState().createCompoundFromSelected();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(1);
    expect(allClips(useEditorStore.getState().project.timeline)[0].type).toBe("compound");
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(2);
    useEditorStore.getState().redo();
    expect(allClips(useEditorStore.getState().project.timeline)[0].type).toBe("compound");
  });

  it("uncompounds through undoable store history", () => {
    const project = createProject();
    const first = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "First", duration: 3 });
    const second = createClip({ trackId: project.timeline.tracks[1].id, type: "audio", name: "Second", duration: 3 });
    project.timeline = createCompoundClipFromSelection(setSelectedClips(addClipToTimeline(addClipToTimeline(project.timeline, first), second), [first.id, second.id]));
    useEditorStore.getState().setProject(project);
    const compound = allClips(useEditorStore.getState().project.timeline)[0];

    useEditorStore.getState().uncompoundClip(compound.id);
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(2);
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)[0].type).toBe("compound");
    useEditorStore.getState().redo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(2);
  });

  it("extracts audio into a separate aligned clip and mutes the source video", () => {
    const project = createProject();
    const video = createClip({
      trackId: project.timeline.tracks[0].id,
      assetId: videoAsset.id,
      type: "video",
      name: "Lake",
      timelineStart: 4,
      duration: 5,
      sourceIn: 2,
      sourceOut: 7,
      speed: 1.5
    });
    const assets = { [videoAsset.id]: videoAsset };
    const timeline = addClipToTimeline(project.timeline, video);

    expect(canExtractAudioFromClip(timeline, assets, video.id)).toBe(true);
    const extracted = addExtractedAudioClip(timeline, assets, video.id, extractedAudioAsset);
    const clips = allClips(extracted);
    const mutedVideo = clips.find((clip) => clip.id === video.id);
    const audio = clips.find((clip) => clip.type === "audio");

    expect(mutedVideo?.audio?.muted).toBe(true);
    expect(audio).toMatchObject({
      assetId: extractedAudioAsset.id,
      type: "audio",
      timelineStart: 4,
      duration: 5,
      sourceIn: 2,
      sourceOut: 7,
      speed: 1.5
    });
    expect(extracted.selectedClipIds).toEqual([audio?.id]);
  });

  it("does not extract from locked clips or locked layers", () => {
    const project = createProject();
    const lockedClip = createClip({ trackId: project.timeline.tracks[0].id, assetId: videoAsset.id, type: "video", name: "Locked", locked: true });
    const assets = { [videoAsset.id]: videoAsset };
    const lockedClipTimeline = addClipToTimeline(project.timeline, lockedClip);
    const unlockedVideo = createClip({ trackId: project.timeline.tracks[0].id, assetId: videoAsset.id, type: "video", name: "Video" });
    const lockedTrackTimeline = {
      ...addClipToTimeline(project.timeline, unlockedVideo),
      tracks: project.timeline.tracks.map((track, index) => index === 0 ? { ...track, locked: true, clips: [unlockedVideo] } : track)
    };

    expect(canExtractAudioFromClip(lockedClipTimeline, assets, lockedClip.id)).toBe(false);
    expect(addExtractedAudioClip(lockedClipTimeline, assets, lockedClip.id, extractedAudioAsset)).toEqual(lockedClipTimeline);
    expect(canExtractAudioFromClip(lockedTrackTimeline, assets, unlockedVideo.id)).toBe(false);
  });

  it("extracts audio through undoable store history", () => {
    const project = createProject();
    const video = createClip({ trackId: project.timeline.tracks[0].id, assetId: videoAsset.id, type: "video", name: "Lake", duration: 6, sourceIn: 1, sourceOut: 7 });
    project.assets = { [videoAsset.id]: videoAsset };
    project.timeline = addClipToTimeline(project.timeline, video);
    useEditorStore.getState().setProject(project);

    useEditorStore.getState().executeCommand("Extract audio", (draft) => ({
      ...draft,
      assets: { ...draft.assets, [extractedAudioAsset.id]: extractedAudioAsset },
      timeline: addExtractedAudioClip(draft.timeline, draft.assets, video.id, extractedAudioAsset)
    }));

    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(2);
    expect(allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === video.id)?.audio?.muted).toBe(true);
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(1);
    expect(allClips(useEditorStore.getState().project.timeline)[0].audio?.muted).toBe(false);
    useEditorStore.getState().redo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(2);
  });

  it("builds live five-character text timeline previews", () => {
    const blank = createClip({ trackId: "layer-1", type: "text", name: "Text", text: { ...defaultTextSettings(), text: "   " } });
    const hello = createClip({ trackId: "layer-1", type: "text", name: "Text", text: { ...defaultTextSettings(), text: "Hello world" } });
    const journey = createClip({ trackId: "layer-1", type: "text", name: "Text", text: { ...defaultTextSettings(), text: "Live the Journey" } });

    expect(textClipPreviewLabel(blank)).toBe("Text");
    expect(textClipPreviewLabel(hello)).toBe("Hello");
    expect(textClipPreviewLabel(journey)).toBe("Livet");
  });

  it("updates text preview after inspector text changes", () => {
    const project = createProject();
    const text = createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Text" });
    project.timeline = addClipToTimeline(project.timeline, text);
    useEditorStore.getState().setProject(project);

    useEditorStore.getState().updateSelectedText({ text: "Premium title" });
    const updated = allClips(useEditorStore.getState().project.timeline)[0];

    expect(textClipPreviewLabel(updated)).toBe("Premi");
  });

  it("splits a clip at the playhead", () => {
    const clip = createClip({ trackId: "v1", type: "video", name: "Lake", duration: 10, timelineStart: 2 });
    const result = splitClip(clip, 6);
    expect(result).not.toBeNull();
    expect(result?.[0].duration).toBe(4);
    expect(result?.[1].timelineStart).toBe(6);
    expect(result?.[1].duration).toBe(6);
  });

  it("trims a clip start without allowing negative duration", () => {
    const clip = createClip({ trackId: "v1", type: "video", name: "Lake", duration: 10, sourceIn: 2 });
    const trimmed = trimClip(clip, "start", 9.9);
    expect(trimmed.duration).toBeCloseTo(0.25);
  });

  it("allows still images to be extended beyond their original source duration", () => {
    const clip = createClip({ trackId: "v1", type: "image", name: "Poster", duration: 5, sourceIn: 0, sourceOut: 5 });
    const trimmed = trimClip(clip, "end", 95);
    expect(trimmed.duration).toBe(100);
    expect(trimmed.sourceOut).toBe(100);
  });

  it("moves and duplicates selected clips on track-owned timelines", () => {
    const project = createProject();
    const trackId = project.timeline.tracks[0].id;
    const clip = createClip({ trackId, type: "video", name: "Lake", duration: 10 });
    const withClip = addClipToTimeline(project.timeline, clip);
    const moved = moveClip(withClip, clip.id, 4);
    expect(moved.tracks.find((track) => track.id === trackId)?.clips[0].timelineStart).toBe(4);
    const selected = setSelectedClips(moved, [clip.id]);
    const duplicated = duplicateSelectedClips(selected);
    expect(duplicated.tracks.find((track) => track.id === trackId)?.clips).toHaveLength(2);
  });

  it("duplicates clips with properties and keyframes intact", () => {
    const project = createProject();
    const trackId = project.timeline.tracks[0].id;
    let clip = createClip({
      trackId,
      type: "video",
      name: "Animated Lake",
      duration: 10,
      transform: { ...defaultTransform(), x: 111, y: 222, scale: 1.4, rotation: 8, opacity: 0.7, blendMode: "screen" },
      audio: { volume: 0.45, muted: false, fadeIn: 1, fadeOut: 2 },
      colorAdjustments: normalizeColorSettings({ ...defaultColorSettings(), basic: { ...normalizeColorSettings(defaultColorSettings()).basic, contrast: 16, saturation: 8, temperature: 12, tint: -4, fade: 12, highlights: -20, vibrance: 14 } }),
      crop: { left: 5, top: 6, right: 7, bottom: 8 }
    });
    clip = upsertTransformKeyframe(clip, 2, { ...defaultTransform(), x: 200, y: 100, scale: 1.2, rotation: 0, opacity: 1, blendMode: "normal" });
    const timeline = setSelectedClips(addClipToTimeline(project.timeline, clip), [clip.id]);
    const duplicated = duplicateSelectedClips(timeline);
    const clips = allClips(duplicated);
    const copy = clips.find((item) => item.id !== clip.id);
    expect(copy?.name).toBe("Animated Lake");
    expect(copy?.transform).toEqual(clip.transform);
    expect(copy?.audio).toEqual(clip.audio);
    expect(copy?.colorAdjustments).toEqual(clip.colorAdjustments);
    expect(copy?.crop).toEqual(clip.crop);
    expect(copy?.keyframes?.transform?.[0].x).toBe(200);
  });

  it("allows video, audio, and image media on any generic layer", () => {
    const project = createProject();
    const [firstLayer, secondLayer] = project.timeline.tracks;
    expect(project.timeline.tracks.map((track) => track.name)).toEqual(expect.arrayContaining(["Layer 1", "Layer 2"]));
    for (const track of [firstLayer, secondLayer]) {
      expect(isClipCompatibleWithTrack("video", track.type)).toBe(true);
      expect(isClipCompatibleWithTrack("audio", track.type)).toBe(true);
      expect(isClipCompatibleWithTrack("image", track.type)).toBe(true);
    }
    const video = createClip({ trackId: firstLayer.id, type: "video", name: "Lake", duration: 5 });
    const audio = createClip({ trackId: firstLayer.id, type: "audio", name: "Music", duration: 5 });
    const image = createClip({ trackId: secondLayer.id, type: "image", name: "Poster", duration: 5 });
    const timeline = addClipToTimeline(addClipToTimeline(addClipToTimeline(project.timeline, video), audio), image);
    expect(timeline.tracks.find((track) => track.id === firstLayer.id)?.clips.map((clip) => clip.type)).toEqual(["video", "audio"]);
    expect(timeline.tracks.find((track) => track.id === secondLayer.id)?.clips.map((clip) => clip.type)).toEqual(["image"]);
  });

  it("uses the requested centered default visual transform", () => {
    expect(defaultTransform()).toMatchObject({ x: 960, y: 540 });
    expect(defaultTransform({ width: 1280, height: 720, fps: 30, sampleRate: 48000 })).toMatchObject({ x: 640, y: 360 });
    expect(createClip({ trackId: "layer-1", type: "video", name: "Lake" }).transform).toMatchObject({ x: 960, y: 540 });
    expect(createClip({ trackId: "layer-1", type: "image", name: "Poster" }).transform).toMatchObject({ x: 960, y: 540 });
    expect(createClip({ trackId: "layer-1", type: "text", name: "Title" }).transform).toMatchObject({ x: 960, y: 540 });
  });

  it("calculates ends, snapping, and active clips", () => {
    const project = createProject();
    const [layerOne, layerTwo, layerThree] = project.timeline.tracks;
    const video = createClip({ trackId: layerTwo.id, type: "video", name: "Lake", timelineStart: 2, duration: 5 });
    const text = createClip({ trackId: layerOne.id, type: "text", name: "Title", timelineStart: 3, duration: 2 });
    const audio = createClip({ trackId: layerThree.id, type: "audio", name: "Music", timelineStart: 0, duration: 10 });
    const timeline = addClipToTimeline(addClipToTimeline(addClipToTimeline(project.timeline, video), text), audio);
    expect(getClipEnd(video)).toBe(7);
    expect(snapTime(1.95, [0, 2, 7], 0.1)).toBe(2);
    expect(getVisibleClipsAtTime(timeline, 3.5).map(({ clip }) => clip.name)).toEqual(["Lake", "Title"]);
    expect(getAudibleClipsAtTime(timeline, 4).map(({ clip }) => clip.name)).toEqual(["Lake", "Music"]);
  });

  it("stores markers in seconds and keeps them independent of split and trim edits", () => {
    const project = createProject();
    const trackId = project.timeline.tracks[0].id;
    const clip = createClip({ trackId, type: "video", name: "Lake", timelineStart: 0, duration: 10 });
    const timeline = addTimelineMarker(addClipToTimeline(project.timeline, clip), 4.25, "Beat");
    expect(timeline.markers?.[0]).toMatchObject({ time: 4.25, label: "Beat" });
    const selected = setSelectedClips(timeline, [clip.id]);
    const split = splitClip(selected.tracks[0].clips[0], 5);
    expect(split).not.toBeNull();
    expect(timeline.markers?.[0].time).toBe(4.25);
    const trimmed = trimClip(clip, "start", 1);
    expect(trimmed.timelineStart).toBe(1);
    expect(timeline.markers?.[0].time).toBe(4.25);
    const removed = removeTimelineMarker(timeline, timeline.markers?.[0].id ?? "");
    expect(removed.markers).toEqual([]);
  });

  it("calculates fit, fill, center, and reset transforms in project units", () => {
    const project = createProject();
    const asset = { id: "a1", path: "a.mp4", name: "a.mp4", type: "video" as const, width: 3840, height: 2160, importedAt: "now" };
    const moved = { ...defaultTransform(project.timeline), x: 120, y: 240, scale: 3, rotation: 12, opacity: 0.5, blendMode: "multiply" as const };
    expect(centerTransform(moved, project.timeline)).toMatchObject({ x: 960, y: 540, scale: 3 });
    expect(scaleTransformToFit(moved, project.timeline, asset, "fit").scale).toBeCloseTo(0.5);
    expect(scaleTransformToFit(moved, { ...project.timeline, width: 1080, height: 1080 }, asset, "fill").scale).toBeCloseTo(0.5);
    expect(resetTransformForTimeline(project.timeline)).toEqual(defaultTransform(project.timeline));
  });

  it("interpolates visual and audio keyframes", () => {
    let clip = createClip({ trackId: "layer-1", type: "video", name: "Lake", duration: 10, timelineStart: 5 });
    clip = upsertTransformKeyframe(clip, 5, { ...defaultTransform(), x: 100, y: 100, scale: 1, rotation: 0, opacity: 1, blendMode: "normal" });
    clip = upsertTransformKeyframe(clip, 15, { ...defaultTransform(), x: 300, y: 500, scale: 2, rotation: 0, opacity: 0.2, blendMode: "normal" });
    clip = upsertAudioKeyframe(clip, 5, { volume: 0.2, muted: false, fadeIn: 0, fadeOut: 0 });
    clip = upsertAudioKeyframe(clip, 15, { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 });
    expect(evaluateTransformAtTime(clip, 10).x).toBeCloseTo(200);
    expect(evaluateTransformAtTime(clip, 10).y).toBeCloseTo(300);
    expect(evaluateTransformAtTime(clip, 10).scale).toBeCloseTo(1.5);
    expect(evaluateTransformAtTime(clip, 10).opacity).toBeCloseTo(0.6);
    expect(evaluateAudioAtTime(clip, 10).volume).toBeCloseTo(0.6);
  });

  it("keeps keyframes clip-local across trim and split edits", () => {
    let clip = createClip({ trackId: "layer-1", type: "video", name: "Lake", duration: 10, timelineStart: 0, sourceIn: 0, sourceOut: 10 });
    clip = upsertTransformKeyframe(clip, 2, { ...defaultTransform(), x: 200, y: 100, scale: 1, rotation: 0, opacity: 1, blendMode: "normal" });
    clip = upsertTransformKeyframe(clip, 8, { ...defaultTransform(), x: 800, y: 100, scale: 1, rotation: 0, opacity: 1, blendMode: "normal" });
    const trimmed = trimClip(clip, "start", 1);
    expect(trimmed.keyframes?.transform?.map((keyframe) => keyframe.time)).toEqual([1, 7]);
    const split = splitClip(trimmed, 5);
    expect(split?.[0].keyframes?.transform?.map((keyframe) => keyframe.time)).toEqual([1]);
    expect(split?.[1].keyframes?.transform?.map((keyframe) => keyframe.time)).toEqual([3]);
  });

  it("changes timeline duration from speed while preserving full source playback", () => {
    const clip = createClip({ trackId: "layer-1", type: "video", name: "Six Seconds", duration: 6, sourceIn: 0, sourceOut: 6 });
    const fast = setClipSpeed(clip, 2);
    expect(fast.duration).toBe(3);
    expect(fast.sourceIn).toBe(0);
    expect(fast.sourceOut).toBe(6);
    expect(sourceTimeAtTimelineTime(fast, fast.timelineStart + 3)).toBe(6);
    const slow = setClipSpeed(clip, 0.5);
    expect(slow.duration).toBe(12);
    expect(sourceTimeAtTimelineTime(slow, slow.timelineStart + 12)).toBe(6);
  });

  it("trims and splits speed-adjusted clips using source-time math", () => {
    const clip = setClipSpeed(createClip({ trackId: "layer-1", type: "video", name: "Fast", duration: 10, sourceIn: 0, sourceOut: 10 }), 2);
    expect(clip.duration).toBe(5);
    const trimmed = trimClip(clip, "start", 1);
    expect(trimmed.timelineStart).toBe(1);
    expect(trimmed.duration).toBe(4);
    expect(trimmed.sourceIn).toBe(2);
    const split = splitClip(clip, 2);
    expect(split?.[0].duration).toBe(2);
    expect(split?.[0].sourceOut).toBe(4);
    expect(split?.[1].duration).toBe(3);
    expect(split?.[1].sourceIn).toBe(4);
  });

  it("interpolates speed keyframes", () => {
    let clip = createClip({ trackId: "layer-1", type: "video", name: "Speed Ramp", duration: 10, timelineStart: 0, sourceIn: 0, sourceOut: 10 });
    clip = upsertSpeedKeyframe(clip, 0, 0.5);
    clip = upsertSpeedKeyframe(clip, 10, 2);
    expect(evaluateSpeedAtTime(clip, 5)).toBeCloseTo(1.25);
    expect(sourceTimeAtTimelineTime(clip, 5)).toBeCloseTo(4.375);
  });

  it("normalizes color grading controls and builds a concrete preview filter", () => {
    const normalized = normalizeColorSettings({
      contrast: 3,
      saturation: -1,
      temperature: 120,
      tint: -130,
      fadedBlacks: 2,
      highlightReduction: -1,
      tealOrange: 2
    });
    expect(normalized.basic).toMatchObject({
      contrast: 100,
      saturation: -100,
      temperature: 100,
      tint: -100,
      fade: 100,
      highlights: 100,
      hue: -16
    });
    const filter = buildColorFilter(normalized);
    expect(filter).toContain("contrast(");
    expect(filter).toContain("saturate(");
    expect(filter).toContain("hue-rotate");
    expect(exportColorGrade(normalized)).toMatchObject({ enabled: true, compatibility: "fully-supported" });
  });

  it("interpolates color keyframes for animated color grading", () => {
    let clip = createClip({ trackId: "layer-1", type: "video", name: "Color Ramp", duration: 10, timelineStart: 0 });
    const base = normalizeColorSettings(defaultColorSettings());
    clip = upsertColorKeyframe(clip, 0, { ...base, basic: { ...base.basic, contrast: 0, saturation: 0, temperature: 0 } });
    clip = upsertColorKeyframe(clip, 10, { ...base, basic: { ...base.basic, contrast: 100, saturation: 50, temperature: -40 } });
    const mid = normalizeColorSettings(evaluateColorAtTime(clip, 5));
    expect(mid.basic.contrast).toBeCloseTo(50);
    expect(mid.basic.saturation).toBeCloseTo(25);
    expect(mid.basic.temperature).toBeCloseTo(-20);
  });

  it("translates advanced color modules into preview and export corrections", () => {
    const grade = normalizeColorSettings({
      ...defaultColorSettings(),
      lut: { enabled: true, lutId: "warm-film", intensity: 0.8 },
      hsl: {
        enabled: true,
        ranges: {
          ...normalizeColorSettings(defaultColorSettings()).hsl.ranges,
          orange: { hue: 12, saturation: 40, luminance: 8, rangeWidth: 45, feathering: 0.45 }
        }
      },
      curves: {
        ...normalizeColorSettings(defaultColorSettings()).curves,
        enabled: true,
        master: [{ x: 0, y: 0 }, { x: 0.5, y: 0.62 }, { x: 1, y: 1 }]
      },
      wheels: {
        ...normalizeColorSettings(defaultColorSettings()).wheels,
        enabled: true,
        highlights: { hue: 28, saturation: 0.4, luminance: 14 }
      },
      match: { enabled: true, strength: 0.5, exposure: 0.4, temperature: -12, tint: 4, contrast: 10, saturation: 8, preserveSkinTones: true, preserveBlacks: true, preserveHighlights: true }
    });
    const effective = effectiveBasicSettings(grade);
    expect(effective.temperature).not.toBe(0);
    expect(effective.saturation).toBeGreaterThan(0);
    expect(buildColorFilter(grade)).toContain("brightness(");
    expect(exportColorGrade(grade)).toMatchObject({ enabled: true, compatibility: "fully-supported" });
  });

  it("defines professional effect presets and normalizes ordered clip effects", () => {
    expect(effectCategories).toHaveLength(9);
    expect(effectCategories.find((category) => category.type === "film-grain")?.presets.map((preset) => preset.name)).toEqual([
      "Fine Film",
      "16mm",
      "35mm",
      "Rough Vintage"
    ]);
    const clip = createClip({ trackId: "layer-1", type: "video", name: "Lake", duration: 8 });
    const grain = createEffectFromPreset("fine-film", clip);
    const shake = createEffectFromPreset("impact", { ...clip, effects: [grain] });
    const normalized = normalizeEffects([{ ...shake, order: 0 }, { ...grain, order: 1 }], clip.duration);
    expect(normalized.map((effect) => effect.order)).toEqual([0, 1]);
    expect(normalized[0].seed).toBe(shake.seed);
    expect(exportFilterForEffect(grain)).toContain("noise");
    expect(unsupportedExportEffects([shake])).toEqual(["Impact"]);
  });

  it("normalizes masks and interpolates mask keyframes", () => {
    const project = createProject();
    let mask = defaultMask("rectangle", project.timeline);
    mask = { ...mask, width: -10, height: 0, feather: 999, opacity: 2, position: { x: 960, y: 540 } };
    const normalized = normalizeMasks([mask], project.timeline)[0];
    expect(normalized.width).toBeGreaterThanOrEqual(4);
    expect(normalized.height).toBeGreaterThanOrEqual(4);
    expect(normalized.feather).toBe(200);
    expect(normalized.opacity).toBe(1);

    const clip = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Masked", duration: 10 });
    let animated = { ...defaultMask("ellipse", project.timeline), position: { x: 100, y: 100 }, width: 200, height: 120, feather: 0, opacity: 1 };
    animated = upsertMaskKeyframe(animated, clip, 0, project.timeline);
    animated = upsertMaskKeyframe({ ...animated, position: { x: 500, y: 300 }, width: 400, height: 240, feather: 40, opacity: 0.4 }, clip, 10, project.timeline);
    const mid = evaluateMaskAtTime(animated, clip, 5);
    expect(mid.position.x).toBeCloseTo(300);
    expect(mid.position.y).toBeCloseTo(200);
    expect(mid.width).toBeCloseTo(300);
    expect(mid.feather).toBeCloseTo(20);
    expect(mid.opacity).toBeCloseTo(0.7);
  });

  it("builds non-rectangular alpha masks for preview composition", () => {
    const project = createProject();
    const clip = createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Masked", duration: 10 });
    const rectangle = defaultMask("rectangle", project.timeline);
    const circle = defaultMask("circle", project.timeline);
    const custom = {
      ...defaultMask("bezier", project.timeline),
      draft: false,
      points: [
        { id: "p1", x: 140, y: 120 },
        { id: "p2", x: 520, y: 170 },
        { id: "p3", x: 460, y: 520 },
        { id: "p4", x: 130, y: 430 }
      ]
    };
    const subtract = { ...defaultMask("rounded-rectangle", project.timeline), blendMode: "subtract" as const };
    const intersect = { ...defaultMask("ellipse", project.timeline), blendMode: "intersect" as const };

    expect(maskShapePath(custom)).not.toEqual(maskShapePath(rectangle));
    expect(maskShapePath(circle)).toContain("A ");
    expect(maskShapePath(custom).split("L").length).toBeGreaterThan(2);
    expect(buildMaskDataUrl([defaultMask("bezier", project.timeline)], clip, project.timeline, 0)).toBeUndefined();
    expect(buildMaskDataUrl([{ ...custom, draft: true }], clip, project.timeline, 0)).toBeUndefined();

    const dataUrl = buildMaskDataUrl([custom, subtract, intersect], clip, project.timeline, 0) ?? "";
    const encoded = dataUrl.replace(/^url\("data:image\/svg\+xml,/, "").replace(/"\)$/, "");
    const svg = decodeURIComponent(encoded);
    expect(svg).toContain('<mask id="clip-mask"');
    expect(svg).toContain('<mask id="intersect-mask"');
    expect(svg).toContain('mask="url(#clip-mask)"');
    expect(svg).toContain('fill="black"');
  });
});

describe("project schema", () => {
  it("round trips v2 project JSON", () => {
    const project = createProject();
    const masked = createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Title", masks: [defaultMask("circle", project.timeline)] });
    const parsed = parseProject(serializeProject({ ...project, timeline: addClipToTimeline(project.timeline, masked) }));
    expect(parsed.version).toBe(2);
    expect(parsed.timeline.tracks[0].clips[0].masks?.[0].type).toBe("circle");
  });

  it("migrates v1 project JSON with global clips", () => {
    const v1 = {
      id: "p1",
      name: "Wanderlust Journey",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
      assets: {
        a1: {
          id: "a1",
          path: "lake.mp4",
          name: "lake.mp4",
          mediaType: "video",
          duration: 12,
          waveform: [],
          importedAt: "2026-06-15T00:00:00.000Z"
        }
      },
      timeline: {
        duration: 90,
        playhead: 0,
        zoom: 9,
        tracks: [],
        clips: {
          c1: { id: "c1", trackId: "v1", assetId: "a1", type: "video", name: "Lake", timelineStart: 0, duration: 5, sourceIn: 0, sourceOut: 5, volume: 1, speed: 1 }
        }
      },
      exportSettings: {
        outputPath: "",
        resolution: "1080p",
        frameRate: 30,
        videoBitrate: "8M",
        audioBitrate: "192k"
      }
    };
    const migrated = migrateProject(v1 as unknown as Project);
    expect(migrated.version).toBe(2);
    const [migratedClip] = allClips(migrated.timeline);
    expect(migratedClip.name).toBe("Lake");
    expect(migrated.timeline.tracks.some((track) => track.id === migratedClip.trackId && track.name.startsWith("Layer "))).toBe(true);
    expect(migrated.assets.a1.type).toBe("video");
  });

  it("creates export warnings from unsupported clips", () => {
    const project = createProject();
    const text = createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Title" });
    const next: Project = { ...project, timeline: addClipToTimeline(project.timeline, text) };
    expect(buildExportPlan(next).warnings.join(" ")).toContain("Text");
  });

  it("exports source duration plus speed for speed-adjusted video clips", () => {
    const project = createProject();
    const asset = { id: "a1", path: "lake.mp4", name: "lake.mp4", type: "video" as const, duration: 6, importedAt: "now" };
    const clip = setClipSpeed(createClip({ trackId: project.timeline.tracks[0].id, assetId: asset.id, type: "video", name: "Lake", duration: 6, sourceIn: 0, sourceOut: 6 }), 2);
    const next: Project = { ...project, assets: { [asset.id]: asset }, timeline: addClipToTimeline(project.timeline, clip) };
    expect(buildExportPlan(next).clips[0]).toMatchObject({ duration: 6, speed: 2 });
  });

  it("includes enabled practical effects in export clips and warns about preview-only effects", () => {
    const project = createProject();
    const asset = { id: "a1", path: "lake.mp4", name: "lake.mp4", type: "video" as const, duration: 6, importedAt: "now" };
    const base = createClip({ trackId: project.timeline.tracks[0].id, assetId: asset.id, type: "video", name: "Lake", duration: 6 });
    const grain = createEffectFromPreset("fine-film", base);
    const shake = createEffectFromPreset("impact", { ...base, effects: [grain] });
    const clip = { ...base, effects: [grain, shake] };
    const next: Project = { ...project, assets: { [asset.id]: asset }, timeline: addClipToTimeline(project.timeline, clip) };
    const plan = buildExportPlan(next);
    expect(plan.clips[0].effects?.map((effect) => effect.name)).toEqual(["Fine Film", "Impact"]);
    expect(plan.warnings.join(" ")).toContain("Impact");
    expect(plan.warnings.join(" ")).toContain("Supported effect filters");
    const masked: Project = { ...project, assets: { [asset.id]: asset }, timeline: addClipToTimeline(project.timeline, { ...clip, masks: [defaultMask("circle", project.timeline)] }) };
    expect(buildExportPlan(masked).warnings.join(" ")).toContain("Masks preview and save");
  });

  it("warns that separate timeline effect clips are preview-only for MVP export", () => {
    const project = createProject();
    const effect = createEffectFromPreset("fine-film", { effects: [], duration: 5 });
    const effectClip = createClip({ trackId: project.timeline.tracks[0].id, type: "effect", name: "Fine Film", duration: 5, effects: [effect] });
    const next: Project = { ...project, timeline: addClipToTimeline(project.timeline, effectClip) };
    expect(buildExportPlan(next).warnings.join(" ")).toContain("Text, effects, filters, and legacy transition clips");
  });
});

describe("command history", () => {
  it("undoes and redoes command-based edits", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add text clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Text" }))
    }));
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(0);
    useEditorStore.getState().redo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(1);
  });

  it("persists inspector-backed transform, audio, speed, and text controls", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add text clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "text", name: "Text" }))
    }));
    useEditorStore.getState().updateSelectedTransform({ x: 320, y: 240, scale: 1.4, rotation: -12, opacity: 0.7, blendMode: "screen" });
    useEditorStore.getState().updateSelectedAudio({ volume: 0.35, fadeIn: 1.5, fadeOut: 0.75, muted: true });
    useEditorStore.getState().updateSelectedSpeed(1.75);
    useEditorStore.getState().updateSelectedText({ text: "Premium", fontSize: 64, color: "#ffcc00" });
    const clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip?.transform?.x).toBe(320);
    expect(clip?.transform?.blendMode).toBe("screen");
    expect(clip?.audio?.volume).toBe(0.35);
    expect(clip?.audio?.muted).toBe(true);
    expect(clip?.speed).toBe(1.75);
    expect(clip?.text?.text).toBe("Premium");
    expect(clip?.text?.fontSize).toBe(64);
  });

  it("adds and updates transform and volume keyframes from the store", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video", duration: 10 }))
    }));
    useEditorStore.getState().setPlayhead(0);
    useEditorStore.getState().updateSelectedTransform({ x: 100, y: 100, scale: 1, opacity: 1 });
    useEditorStore.getState().updateSelectedAudio({ volume: 0.25 });
    useEditorStore.getState().addSelectedTransformKeyframe();
    useEditorStore.getState().addSelectedAudioKeyframe();
    useEditorStore.getState().setPlayhead(5);
    useEditorStore.getState().updateSelectedTransform({ x: 500, y: 300, scale: 2, opacity: 0.5 });
    useEditorStore.getState().updateSelectedAudio({ volume: 1 });
    useEditorStore.getState().addSelectedTransformKeyframe();
    useEditorStore.getState().addSelectedAudioKeyframe();
    const clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.keyframes?.transform).toHaveLength(2);
    expect(clip.keyframes?.audio).toHaveLength(2);
    expect(evaluateTransformAtTime(clip, 2.5).x).toBeCloseTo(300);
    expect(evaluateAudioAtTime(clip, 2.5).volume).toBeCloseTo(0.625);
  });

  it("updates the active transform keyframe during preview drag when keyframes are enabled", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video", duration: 10 }))
    }));
    useEditorStore.getState().setPlayhead(0);
    useEditorStore.getState().updateSelectedTransform({ x: 100, y: 100, scale: 1, rotation: 0, opacity: 1 });
    useEditorStore.getState().addSelectedTransformKeyframe();
    useEditorStore.getState().setPlayhead(5);
    useEditorStore.getState().updateSelectedTransform({ x: 500, y: 300, scale: 1.5, rotation: 10, opacity: 0.8 });

    let clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(evaluateTransformAtTime(clip, 5).x).toBe(500);

    useEditorStore.getState().setClipTransformTransient(clip.id, { x: 720, y: 420 });
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.keyframes?.transform).toHaveLength(2);
    expect(evaluateTransformAtTime(clip, 5).x).toBe(720);
    expect(evaluateTransformAtTime(clip, 5).y).toBe(420);
  });

  it("retimes keyframes to exact frames and deletes them without deleting the clip", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Video", duration: 10 }))
    }));
    useEditorStore.getState().setPlayhead(1);
    useEditorStore.getState().addSelectedTransformKeyframe();

    let clip = allClips(useEditorStore.getState().project.timeline)[0];
    const keyframeId = clip.keyframes?.transform?.[0]?.id;
    expect(keyframeId).toBeTruthy();

    useEditorStore.getState().moveSelectedKeyframe("transform", keyframeId!, 2.517);
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.keyframes?.transform?.[0]?.time).toBeCloseTo(76 / 30);

    useEditorStore.getState().removeSelectedKeyframe("transform", keyframeId!);
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(1);
    expect(clip.keyframes?.transform).toHaveLength(0);

    useEditorStore.getState().undo();
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.keyframes?.transform).toHaveLength(1);
  });

  it("enables and persists crop settings on selected visual clips", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Lake Morning.mp4", duration: 6 }))
    }));
    useEditorStore.getState().applyTimelineTool("crop");
    let clip = allClips(useEditorStore.getState().project.timeline).find((item) => item.type === "video");
    expect(clip?.crop).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    useEditorStore.getState().updateSelectedCrop({ left: 12, top: 8, right: 200, bottom: 100 });
    clip = allClips(useEditorStore.getState().project.timeline).find((item) => item.type === "video");
    expect(clip?.crop).toEqual({ left: 12, top: 8, right: 45, bottom: 45 });
    useEditorStore.getState().updateSelectedCrop(undefined);
    clip = allClips(useEditorStore.getState().project.timeline).find((item) => item.type === "video");
    expect(clip?.crop).toBeUndefined();
  });

  it("copies and pastes clip properties through command history", () => {
    const project = createProject();
    const trackId = project.timeline.tracks[0].id;
    const source = createClip({
      trackId,
      type: "video",
      name: "Source",
      duration: 5,
      transform: { ...defaultTransform(), x: 123, y: 456, scale: 1.8, rotation: 15, opacity: 0.6, blendMode: "overlay" },
      colorAdjustments: normalizeColorSettings({ ...defaultColorSettings(), basic: { ...normalizeColorSettings(defaultColorSettings()).basic, contrast: 22, saturation: 35, temperature: 16, tint: -6, fade: 18, highlights: -32, vibrance: 18 } }),
      audio: { volume: 0.3, muted: false, fadeIn: 1.2, fadeOut: 0.6 }
    });
    const target = createClip({ trackId, type: "video", name: "Target", duration: 5, timelineStart: 6 });
    useEditorStore.getState().setProject({
      ...project,
      timeline: setSelectedClips(addClipToTimeline(addClipToTimeline(project.timeline, source), target), [source.id])
    });
    useEditorStore.getState().copySelectedClipProperties();
    useEditorStore.getState().selectClip(target.id);
    useEditorStore.getState().pasteClipProperties();
    const pasted = allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === target.id);
    expect(pasted?.transform?.x).toBe(123);
    expect(pasted?.transform?.blendMode).toBe("overlay");
    expect(normalizeColorSettings(pasted?.colorAdjustments).basic.contrast).toBe(22);
    expect(normalizeColorSettings(pasted?.colorAdjustments).basic.vibrance).toBe(18);
    expect(pasted?.audio?.volume).toBe(0.3);
    useEditorStore.getState().undo();
    const undone = allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === target.id);
    expect(undone?.transform?.x).not.toBe(123);
  });

  it("persists color inspector controls on selected visual clips", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Lake", duration: 6 }))
    }));
    useEditorStore.getState().updateSelectedColor({
      basic: {
        ...normalizeColorSettings(defaultColorSettings()).basic,
        contrast: 18,
        saturation: 28,
        temperature: 14,
        tint: -7,
        fade: 16,
        highlights: -24,
        vibrance: 20
      }
    });
    const clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(normalizeColorSettings(clip.colorAdjustments).basic).toMatchObject({
      contrast: 18,
      saturation: 28,
      temperature: 14,
      tint: -7,
      fade: 16,
      highlights: -24,
      vibrance: 20
    });
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)[0].colorAdjustments).toEqual(defaultColorSettings());
  });

  it("adds color filter presets as separate timeline clips", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[1].id, type: "video", name: "Lake", duration: 6, timelineStart: 2 }))
    }));
    useEditorStore.getState().setPlayhead(4);
    useEditorStore.getState().applyColorFilterPresetToSelected("cinematic-teal");
    const clips = allClips(useEditorStore.getState().project.timeline);
    const source = clips.find((clip) => clip.type === "video");
    const clip = clips.find((item) => item.type === "filter");
    const preset = colorFilterPresets.find((item) => item.id === "cinematic-teal");
    expect(source?.colorAdjustments).toEqual(defaultColorSettings());
    expect(clip?.name).toBe("Cinematic Teal");
    expect(clip?.timelineStart).toBe(4);
    expect(clip?.duration).toBe(5);
    expect(normalizeColorSettings(clip!.colorAdjustments).basic).toMatchObject(normalizeColorSettings(preset?.grade).basic);
    expect(buildColorFilter(clip!.colorAdjustments)).toContain("contrast(");
  });

  it("adds styled text presets with editable text effects", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().addTextStylePresetToTimeline("bubble-curve");
    const clip = allClips(useEditorStore.getState().project.timeline).find((item) => item.type === "text");
    const preset = textStylePresets.find((item) => item.id === "bubble-curve");
    expect(clip?.name).toBe(preset?.name);
    expect(clip?.text?.stroke.enabled).toBe(true);
    expect(clip?.text?.glow.enabled).toBe(true);
    expect(clip?.text?.curve.enabled).toBe(true);
    useEditorStore.getState().selectClip(clip?.id);
    useEditorStore.getState().updateSelectedText({ text: "Hello world", shadow: { ...clip!.text!.shadow, enabled: true, opacity: 0.7 } });
    const updated = allClips(useEditorStore.getState().project.timeline).find((item) => item.id === clip?.id);
    expect(updated?.text?.text).toBe("Hello world");
    expect(updated?.text?.shadow.enabled).toBe(true);
    expect(updated?.text?.shadow.opacity).toBe(0.7);
  });

  it("adds effect presets as separate timeline clips and supports effect clip editing", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[1].id, type: "video", name: "Lake", duration: 6, timelineStart: 2 }))
    }));
    useEditorStore.getState().setPlayhead(4);
    useEditorStore.getState().addEffectPresetToSelected("fine-film");
    useEditorStore.getState().addEffectPresetToSelected("soft-focus");
    let clips = allClips(useEditorStore.getState().project.timeline);
    const effectClips = clips.filter((clip) => clip.type === "effect");
    expect(effectClips.map((clip) => clip.name)).toEqual(["Fine Film", "Soft Focus"]);
    expect(effectClips.every((clip) => clip.timelineStart === 4)).toBe(true);
    expect(effectClips.every((clip) => clip.trackId === useEditorStore.getState().project.timeline.tracks[0].id)).toBe(true);
    const firstEffectClip = effectClips[0];
    useEditorStore.getState().selectClip(firstEffectClip.id);
    const firstId = firstEffectClip.effects?.[0].id ?? "";
    useEditorStore.getState().updateSelectedEffect(firstId, { intensity: 0.44, startTime: 1, duration: 3 });
    useEditorStore.getState().toggleSelectedEffect(firstId);
    clips = allClips(useEditorStore.getState().project.timeline);
    let edited = clips.find((clip) => clip.id === firstEffectClip.id);
    expect(edited?.effects?.[0]).toMatchObject({ id: firstId, enabled: false, intensity: 0.44, startTime: 1, duration: 3, order: 0 });
    useEditorStore.getState().copySelectedEffects();
    useEditorStore.getState().removeSelectedEffect(firstId);
    edited = allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === firstEffectClip.id);
    expect(edited?.effects).toHaveLength(0);
    useEditorStore.getState().pasteEffectsToSelected();
    edited = allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === firstEffectClip.id);
    expect(edited?.effects).toHaveLength(1);
    useEditorStore.getState().undo();
    edited = allClips(useEditorStore.getState().project.timeline).find((clip) => clip.id === firstEffectClip.id);
    expect(edited?.effects).toHaveLength(0);
  });

  it("adds panel items at a dropped timeline layer and time", () => {
    useEditorStore.getState().setProject(createProject());
    const timeline = useEditorStore.getState().project.timeline;
    const targetTrack = timeline.tracks[2];

    useEditorStore.getState().addTextStylePresetToTimeline("bubble-curve", 1.25, targetTrack.id);
    useEditorStore.getState().addStickerToTimeline(staticStickerPresets[0], 2.5, targetTrack.id);
    useEditorStore.getState().addEffectPresetToSelected("fine-film", 3.75, targetTrack.id);
    useEditorStore.getState().applyColorFilterPresetToSelected("cinematic-teal", 5, targetTrack.id);

    const clips = allClips(useEditorStore.getState().project.timeline);
    expect(clips.find((clip) => clip.type === "text")).toMatchObject({ trackId: targetTrack.id, timelineStart: 1.25 });
    expect(clips.find((clip) => clip.name === staticStickerPresets[0].label)).toMatchObject({ trackId: targetTrack.id, timelineStart: 2.5 });
    expect(clips.find((clip) => clip.type === "effect")).toMatchObject({ trackId: targetTrack.id, timelineStart: 3.75 });
    expect(clips.find((clip) => clip.type === "filter")).toMatchObject({ trackId: targetTrack.id, timelineStart: 5 });
  });

  it("edits masks through command history", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().executeCommand("Add clip", (project) => ({
      ...project,
      timeline: addClipToTimeline(project.timeline, createClip({ trackId: project.timeline.tracks[0].id, type: "video", name: "Lake", duration: 6 }))
    }));
    useEditorStore.getState().addMaskToSelected("rounded-rectangle");
    let clip = allClips(useEditorStore.getState().project.timeline)[0];
    const maskId = clip.masks?.[0].id ?? "";
    expect(clip.masks?.[0].type).toBe("rounded-rectangle");
    useEditorStore.getState().updateSelectedMask(maskId, { position: { x: 321, y: 222 }, feather: 24, inverted: true });
    useEditorStore.getState().addSelectedMaskKeyframe(maskId);
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.masks?.[0]).toMatchObject({ feather: 24, inverted: true });
    expect(clip.masks?.[0].keyframes).toHaveLength(1);
    useEditorStore.getState().setPlayhead(3);
    useEditorStore.getState().updateSelectedMask(maskId, { position: { x: 640, y: 360 }, scale: 1.8 });
    clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.masks?.[0].keyframes).toHaveLength(2);
    expect(evaluateMaskAtTime(clip.masks?.[0] ?? defaultMask("rectangle", useEditorStore.getState().project.timeline), clip, 3)).toMatchObject({
      position: { x: 640, y: 360 },
      scale: 1.8
    });
    useEditorStore.getState().duplicateSelectedMask(maskId);
    expect(allClips(useEditorStore.getState().project.timeline)[0].masks).toHaveLength(2);
    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)[0].masks).toHaveLength(1);
  });

  it("adds markers and applies export presets through undoable commands", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().setPlayhead(12.5);
    useEditorStore.getState().addMarker();
    expect(useEditorStore.getState().project.timeline.markers?.[0].time).toBe(12.5);
    const markerId = useEditorStore.getState().project.timeline.markers?.[0].id ?? "";
    useEditorStore.getState().removeMarker(markerId);
    expect(useEditorStore.getState().project.timeline.markers).toEqual([]);
    useEditorStore.getState().applyExportAspectPreset("9:16");
    useEditorStore.getState().applyExportResolutionPreset("720p");
    expect(useEditorStore.getState().project.timeline.width).toBe(720);
    expect(useEditorStore.getState().project.timeline.height).toBe(1280);
    expect(useEditorStore.getState().project.exportSettings.aspectRatio).toBe("9:16");
  });

  it("supports the complete preview aspect-ratio preset set", () => {
    const expected: Array<[Exclude<AspectRatioPreset, "original" | "custom">, number]> = [
      ["16:9", 1920],
      ["4:3", 1440],
      ["2.35:1", 2538],
      ["2:1", 2160],
      ["1.85:1", 1998],
      ["9:16", 1080],
      ["3:4", 1080],
      ["5.8-inch", 1080],
      ["1:1", 1080]
    ];
    for (const [preset, width] of expected) {
      useEditorStore.getState().setProject(createProject());
      useEditorStore.getState().applyExportAspectPreset(preset);
      const expectedHeight = preset === "9:16" ? 1920 : preset === "3:4" ? 1440 : preset === "5.8-inch" ? 2340 : 1080;
      expect(useEditorStore.getState().project.timeline).toMatchObject({ width, height: expectedHeight });
      expect(useEditorStore.getState().project.exportSettings.aspectRatio).toBe(preset);
    }
    useEditorStore.getState().applyExportAspectPreset("custom", { width: 1001, height: 777 });
    expect(useEditorStore.getState().project.timeline).toMatchObject({ width: 1002, height: 778 });
  });

  it("keeps visual clip positions centered when export resolution changes", () => {
    const project = createProject();
    const trackId = project.timeline.tracks[0].id;
    let clip = createClip({
      trackId,
      type: "video",
      name: "Centered clip",
      duration: 6,
      transform: { ...defaultTransform(project.timeline), x: 960, y: 540 }
    });
    clip = upsertTransformKeyframe(clip, 1, { ...defaultTransform(project.timeline), x: 960, y: 540, scale: 1.2 });
    useEditorStore.getState().setProject({
      ...project,
      timeline: addClipToTimeline(project.timeline, clip)
    });

    useEditorStore.getState().applyExportResolutionPreset("720p");

    const resized = allClips(useEditorStore.getState().project.timeline)[0];
    expect(useEditorStore.getState().project.timeline.width).toBe(1280);
    expect(useEditorStore.getState().project.timeline.height).toBe(720);
    expect(resized.transform).toMatchObject({ x: 640, y: 360 });
    expect(resized.keyframes?.transform?.[0]).toMatchObject({ x: 640, y: 360, scale: 1.2 });
  });

  it("adds static stickers as selected transparent image clips through the store", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().setPlayhead(4);
    useEditorStore.getState().addStickerToTimeline(staticStickerPresets[0]);

    const state = useEditorStore.getState();
    const clip = allClips(state.project.timeline)[0];
    const asset = clip.assetId ? state.project.assets[clip.assetId] : undefined;
    expect(asset).toMatchObject({
      path: "/stickers/static/mahee-heart-pop.png",
      type: "image",
      thumbnailPath: "/stickers/static/mahee-heart-pop.png"
    });
    expect(clip).toMatchObject({
      type: "image",
      name: "Heart Pop",
      timelineStart: 4,
      duration: 5,
      sourceOut: 5
    });
    expect(clip.transform?.scale).toBeGreaterThan(0);
    expect(state.project.timeline.selectedClipIds).toEqual([clip.id]);

    useEditorStore.getState().undo();
    expect(allClips(useEditorStore.getState().project.timeline)).toHaveLength(0);
  });

  it("adds animated stickers with loop metadata through the store", () => {
    useEditorStore.getState().setProject(createProject());
    useEditorStore.getState().addStickerToTimeline(animatedStickerPresets[0]);

    const state = useEditorStore.getState();
    const clip = allClips(state.project.timeline)[0];
    const asset = clip.assetId ? state.project.assets[clip.assetId] : undefined;
    expect(asset?.path).toBe("/stickers/static/mahee-heart-pop.png");
    expect(clip).toMatchObject({
      type: "image",
      name: "Heart Pop Loop",
      stickerAnimation: "heart-pop",
      duration: 5,
      sourceOut: 5
    });
  });

  it("uses imported media trim ranges when adding assets to the timeline", () => {
    const project = createProject();
    useEditorStore.getState().setProject({
      ...project,
      assets: {
        video: {
          id: "video",
          path: "C:/media/source.mp4",
          name: "source.mp4",
          type: "video",
          duration: 12,
          trimIn: 2,
          trimOut: 7.5,
          importedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });

    useEditorStore.getState().addAssetToTimeline("video");

    const clip = allClips(useEditorStore.getState().project.timeline)[0];
    expect(clip.sourceIn).toBe(2);
    expect(clip.sourceOut).toBe(7.5);
    expect(clip.duration).toBe(5.5);
  });

  it("updates and serializes imported media trim ranges", () => {
    const project = createProject();
    useEditorStore.getState().setProject({
      ...project,
      assets: {
        audio: {
          id: "audio",
          path: "C:/media/song.m4a",
          name: "song.m4a",
          type: "audio",
          duration: 8,
          importedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });

    useEditorStore.getState().updateAssetTrim("audio", { trimIn: 1.25, trimOut: 5.75 });
    const parsed = parseProject(useEditorStore.getState().projectJson());

    expect(parsed.assets.audio.trimIn).toBe(1.25);
    expect(parsed.assets.audio.trimOut).toBe(5.75);
  });

  it("builds audio-only export plans from audible audio and video clips", () => {
    const project = createProject();
    const [videoTrack, audioTrack] = project.timeline.tracks;
    const videoAsset = { id: "v", path: "C:/clip.mp4", name: "clip.mp4", type: "video" as const, duration: 10, importedAt: "now" };
    const audioAsset = { id: "a", path: "C:/music.m4a", name: "music.m4a", type: "audio" as const, duration: 8, importedAt: "now" };
    const video = createClip({
      trackId: videoTrack.id,
      assetId: videoAsset.id,
      type: "video",
      name: "Video",
      timelineStart: 2,
      duration: 4,
      sourceIn: 1,
      sourceOut: 5,
      audio: { ...defaultAudioSettings(), volume: 0.8, fadeIn: 0.5, fadeOut: 0.4 }
    });
    const audio = createClip({
      trackId: audioTrack.id,
      assetId: audioAsset.id,
      type: "audio",
      name: "Music",
      timelineStart: 0,
      duration: 6,
      sourceIn: 0,
      sourceOut: 6,
      audio: { ...defaultAudioSettings(), volume: 0.5 }
    });
    const next = {
      ...project,
      assets: { v: videoAsset, a: audioAsset },
      timeline: addClipToTimeline(addClipToTimeline(project.timeline, video), audio)
    };

    const plan = buildAudioExportPlan(next);

    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.map((clip) => clip.sourcePath)).toEqual(["C:/music.m4a", "C:/clip.mp4"]);
    expect(plan.clips[1]).toMatchObject({ timelineStart: 2, sourceIn: 1, duration: 4, volume: 0.8, fadeIn: 0.5, fadeOut: 0.4 });
  });

  it("excludes muted tracks from audio-only export plans", () => {
    const project = createProject();
    const track = { ...project.timeline.tracks[0], muted: true };
    const asset = { id: "a", path: "C:/music.m4a", name: "music.m4a", type: "audio" as const, duration: 8, importedAt: "now" };
    const clip = createClip({ trackId: track.id, assetId: asset.id, type: "audio", name: "Music", duration: 4 });
    const next = {
      ...project,
      assets: { a: asset },
      timeline: { ...project.timeline, tracks: [{ ...track, clips: [clip] }, ...project.timeline.tracks.slice(1)] }
    };

    expect(buildAudioExportPlan(next).clips).toHaveLength(0);
  });
});

describe("autosave recovery helpers", () => {
  it("sorts recovery candidates and decides whether recovery is newer than manual save", () => {
    const sorted = sortRecoveryCandidates([
      { id: "old", updatedAt: "100" },
      { id: "new", updatedAt: "300" },
      { id: "mid", updatedAt: "200" }
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["new", "mid", "old"]);
    expect(shouldOfferRecovery("300", new Date(200).toISOString())).toBe(true);
    expect(shouldOfferRecovery("100", new Date(200).toISOString())).toBe(false);
    expect(shouldOfferRecovery("100")).toBe(true);
  });
});
