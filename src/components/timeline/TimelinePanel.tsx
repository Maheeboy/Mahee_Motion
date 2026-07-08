import { CSSProperties, DragEvent, memo, MouseEvent, PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Diamond, Eye, EyeOff, Lock, LockOpen, Maximize2, Music2, Pause, Play, RotateCcw, Search, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { MediaAsset, TimelineClip, TimelineTrack, TransitionInstance } from "../../types/editor";
import { formatTimecode, framesToSeconds, pixelsToSeconds, secondsToFrames, secondsToPixels } from "../../utils/time";
import { canCreateCompoundClip, canExtractAudioFromClip, canUncompoundClip, findClip, getClipEnd, getMagneticSnapTargets, isClipCompatibleWithTrack, resolveMagneticSnap, textClipPreviewLabel } from "../../utils/timeline";
import { mediaPathToSrc } from "../../utils/mediaPaths";
import { transitionDefinition, transitionDropZone } from "../../utils/transitions";

const labelWidth = 164;
const DRAG_THRESHOLD_PX = 3;

type TimelineDrag =
  | { mode: "marquee"; pointerId: number; startX: number; startY: number; currentX: number; currentY: number }
  | { mode: "pan"; pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number }
  | { mode: "scrub"; pointerId: number };

type TimelineContextMenu =
  | { type: "clip"; x: number; y: number; clipId: string }
  | { type: "track"; x: number; y: number; trackId: string }
  | { type: "empty"; x: number; y: number; time: number }
  | { type: "transition"; x: number; y: number; transitionId: string }
  | { type: "marker"; x: number; y: number; markerId: string };

type ClipKeyframeKind = "transform" | "audio" | "speed" | "color";
type TimelineKeyframeMarker =
  | { id: string; time: number; kind: ClipKeyframeKind }
  | { id: string; time: number; kind: "mask"; maskId: string };

type SnapGuide = { time: number; edge?: "start" | "end" } | null;

function rectFromPoints(startX: number, startY: number, currentX: number, currentY: number) {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY)
  };
}

function transitionTypeFromTransfer(dataTransfer: globalThis.DataTransfer) {
  const explicit = dataTransfer.getData("application/x-mahee-transition");
  if (explicit) return explicit;
  const plain = dataTransfer.getData("text/plain");
  return plain.startsWith("mahee-transition:") ? plain.replace("mahee-transition:", "") : "";
}

function assetIdFromTransfer(dataTransfer: globalThis.DataTransfer) {
  const explicit = dataTransfer.getData("application/x-mahee-asset");
  if (explicit) return explicit;
  const plain = dataTransfer.getData("text/plain");
  return plain.startsWith("mahee-asset:") ? plain.replace("mahee-asset:", "") : "";
}

function hasTransitionPayload(dataTransfer: globalThis.DataTransfer) {
  const types = Array.from(dataTransfer.types);
  return types.includes("application/x-mahee-transition")
    || Boolean(transitionTypeFromTransfer(dataTransfer));
}

function hasAssetPayload(dataTransfer: globalThis.DataTransfer) {
  const types = Array.from(dataTransfer.types);
  return types.includes("application/x-mahee-asset")
    || Boolean(assetIdFromTransfer(dataTransfer));
}

export function TimelinePanel() {
  const project = useEditorStore((state) => state.project);
  const selectClip = useEditorStore((state) => state.selectClip);
  const selectClips = useEditorStore((state) => state.selectClips);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setZoom = useEditorStore((state) => state.setZoom);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const toggleTrackHidden = useEditorStore((state) => state.toggleTrackHidden);
  const toggleTrackMuted = useEditorStore((state) => state.toggleTrackMuted);
  const toggleTrackLocked = useEditorStore((state) => state.toggleTrackLocked);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const createCompoundFromSelected = useEditorStore((state) => state.createCompoundFromSelected);
  const uncompoundClip = useEditorStore((state) => state.uncompoundClip);
  const extractAudioFromClip = useEditorStore((state) => state.extractAudioFromClip);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const copySelectedClipProperties = useEditorStore((state) => state.copySelectedClipProperties);
  const pasteClipProperties = useEditorStore((state) => state.pasteClipProperties);
  const applySpeedPreset = useEditorStore((state) => state.applySpeedPreset);
  const applyTransformAction = useEditorStore((state) => state.applyTransformAction);
  const addTimelineTrack = useEditorStore((state) => state.addTimelineTrack);
  const addTextPreset = useEditorStore((state) => state.addTextPreset);
  const addMarker = useEditorStore((state) => state.addMarker);
  const removeMarker = useEditorStore((state) => state.removeMarker);
  const addTransitionToTimeline = useEditorStore((state) => state.addTransitionToTimeline);
  const selectTransition = useEditorStore((state) => state.selectTransition);
  const removeSelectedTransition = useEditorStore((state) => state.removeSelectedTransition);
  const copySelectedTransition = useEditorStore((state) => state.copySelectedTransition);
  const pasteTransitionSettings = useEditorStore((state) => state.pasteTransitionSettings);
  const snappingEnabled = useEditorStore((state) => state.timelineUi.snapping);
  const pxPerSecond = project.timeline.zoom * 10;
  const contentWidth = secondsToPixels(project.timeline.duration, pxPerSecond);
  const stageHeight = 24 + project.timeline.tracks.reduce((total, track) => total + track.height, 0);
  const selectedClipIds = project.timeline.selectedClipIds;
  const compoundEligible = canCreateCompoundClip(project.timeline);
  const timelineRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDrag | null>(null);
  const [snapGuide, setSnapGuide] = useState<SnapGuide>(null);
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null);
  const [transitionDrop, setTransitionDrop] = useState<ReturnType<typeof transitionDropZone> | null>(null);
  const [contextMenu, setContextMenu] = useState<TimelineContextMenu | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const ticks = useMemo(() => {
    const step = project.timeline.zoom > 18 ? 2 : 5;
    const count = Math.ceil(project.timeline.duration / step);
    return Array.from({ length: count + 1 }, (_, index) => index * step);
  }, [project.timeline.duration, project.timeline.zoom]);

  const seekFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const scroll = timelineRef.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const x = event.clientX - rect.left + scroll.scrollLeft - labelWidth;
    setPlayhead(pixelsToSeconds(Math.max(0, x), pxPerSecond));
  };

  const timeFromEvent = (event: PointerEvent<HTMLDivElement> | DragEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
    const scroll = timelineRef.current;
    if (!scroll) return 0;
    const rect = scroll.getBoundingClientRect();
    return pixelsToSeconds(Math.max(0, event.clientX - rect.left + scroll.scrollLeft - labelWidth), pxPerSecond);
  };

  const trackIdFromPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    return element?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
  };

  const transitionDropFromEvent = (event: DragEvent<HTMLDivElement>) => {
    const transitionType = transitionTypeFromTransfer(event.dataTransfer);
    if (!transitionType) return null;
    const trackId = trackIdFromPoint(event.clientX, event.clientY);
    const time = Math.max(0, timeFromEvent(event));
    return transitionDropZone(project.timeline, trackId, time, transitionDefinition(transitionType).defaultDuration);
  };

  const selectClipsInRect = (selection: ReturnType<typeof rectFromPoints>, append: boolean) => {
    const scroll = timelineRef.current;
    if (!scroll) return;
    const selected = Array.from(scroll.querySelectorAll<HTMLElement>(".timeline-clip[data-clip-id]"))
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < selection.left + selection.width
          && bounds.right > selection.left
          && bounds.top < selection.top + selection.height
          && bounds.bottom > selection.top;
      })
      .map((element) => element.dataset.clipId)
      .filter((id): id is string => Boolean(id));
    selectClips(selected, append);
  };

  const marquee = timelineDrag?.mode === "marquee" ? rectFromPoints(timelineDrag.startX, timelineDrag.startY, timelineDrag.currentX, timelineDrag.currentY) : null;
  const fitTimeline = () => {
    const visibleWidth = Math.max(240, (timelineRef.current?.clientWidth ?? 900) - labelWidth - 24);
    setZoom(visibleWidth / Math.max(1, project.timeline.duration) / 10);
  };
  const menuTrack = contextMenu?.type === "track" ? project.timeline.tracks.find((track) => track.id === contextMenu.trackId) : undefined;
  const menuClip = contextMenu?.type === "clip" ? findClip(project.timeline, contextMenu.clipId) : undefined;
  const menuTransition = contextMenu?.type === "transition" ? (project.timeline.transitions ?? []).find((transition) => transition.id === contextMenu.transitionId) : undefined;
  const uncompoundEligible = contextMenu?.type === "clip" ? canUncompoundClip(project.timeline, contextMenu.clipId) : false;
  const extractAudioEligible = contextMenu?.type === "clip" ? canExtractAudioFromClip(project.timeline, project.assets, contextMenu.clipId) : false;

  useLayoutEffect(() => {
    if (!contextMenu) return undefined;
    const menu = contextMenuRef.current;
    if (!menu) return undefined;
    const margin = 8;
    const placeMenu = () => {
      const rect = menu.getBoundingClientRect();
      setContextMenuPosition({
        x: Math.max(margin, Math.min(contextMenu.x, window.innerWidth - rect.width - margin)),
        y: Math.max(margin, Math.min(contextMenu.y, window.innerHeight - rect.height - margin))
      });
    };
    placeMenu();
    const observer = new window.ResizeObserver(placeMenu);
    observer.observe(menu);
    window.addEventListener("resize", placeMenu);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", placeMenu);
    };
  }, [contextMenu, speedMenuOpen]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    setSpeedMenuOpen(false);
    const close = (event: globalThis.PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as globalThis.Node)) setContextMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  useEffect(() => {
    const preventNativeDrag = (event: globalThis.DragEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".timeline-scroll")) event.preventDefault();
    };
    document.addEventListener("dragstart", preventNativeDrag);
    return () => {
      document.body.classList.remove("timeline-dragging");
      document.removeEventListener("dragstart", preventNativeDrag);
    };
  }, []);

  return (
    <section className="timeline-panel">
      <div className="timeline-top-strip">
        <div className="timeline-transport">
          <button title="Go to start" onClick={() => setPlayhead(0)}><SkipBack size={16} /></button>
          <button title={isPlaying ? "Pause timeline" : "Play timeline"} onClick={() => setPlaying(!isPlaying)} className="timeline-play">
            {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
          </button>
          <button title="Jump forward 5 seconds" onClick={() => setPlayhead(project.timeline.playhead + 5)}><SkipForward size={16} /></button>
          <button title="Reset zoom" onClick={() => setZoom(10)}><RotateCcw size={15} /></button>
          <strong>{formatTimecode(project.timeline.playhead, project.timeline.fps)}</strong>
          <span>{formatTimecode(project.timeline.duration, project.timeline.fps)}</span>
        </div>
        <div className="timeline-mini-tools">
          <button title="Layer audio controls"><Music2 size={17} /></button>
          <button title="Layer mute buttons are active in each row"><Volume2 size={17} /></button>
          <button title="Fit timeline" onClick={fitTimeline}><Maximize2 size={17} /></button>
          <button title="Timeline search - Coming soon" disabled><Search size={17} /></button>
          <input aria-label="Timeline zoom" type="range" min={5} max={28} value={project.timeline.zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </div>
      </div>
      <div
        className={`timeline-scroll ${timelineDrag?.mode === "pan" ? "panning" : ""}`}
        ref={timelineRef}
        onContextMenu={(event) => {
          event.preventDefault();
          const target = event.target as HTMLElement;
          const marker = target.closest<HTMLElement>("[data-marker-id]");
          if (marker?.dataset.markerId) {
            setContextMenu({ type: "marker", x: event.clientX, y: event.clientY, markerId: marker.dataset.markerId });
            return;
          }
          const clip = target.closest<HTMLElement>("[data-clip-id]");
          if (clip?.dataset.clipId) {
            if (!selectedClipIds.includes(clip.dataset.clipId)) selectClip(clip.dataset.clipId);
            setContextMenu({ type: "clip", x: event.clientX, y: event.clientY, clipId: clip.dataset.clipId });
            return;
          }
          const transition = target.closest<HTMLElement>("[data-transition-id]");
          if (transition?.dataset.transitionId) {
            selectTransition(transition.dataset.transitionId);
            setContextMenu({ type: "transition", x: event.clientX, y: event.clientY, transitionId: transition.dataset.transitionId });
            return;
          }
          const track = target.closest<HTMLElement>("[data-track-id]");
          if (track?.dataset.trackId && target.closest(".track-label")) {
            setContextMenu({ type: "track", x: event.clientX, y: event.clientY, trackId: track.dataset.trackId });
            return;
          }
          setContextMenu({ type: "empty", x: event.clientX, y: event.clientY, time: timeFromEvent(event) });
        }}
        onPointerDownCapture={() => setContextMenu(null)}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.button === 1 || target.classList.contains("timeline-scroll")) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setTimelineDrag({ mode: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop });
            return;
          }
          if (target.classList.contains("ruler")) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromEvent(event);
            setTimelineDrag({ mode: "scrub", pointerId: event.pointerId });
            return;
          }
          if (target.classList.contains("track-lane")) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setTimelineDrag({ mode: "marquee", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
            if (!event.shiftKey) clearSelection();
          }
        }}
        onPointerMove={(event) => {
          if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
          if (timelineDrag.mode === "pan") {
            event.currentTarget.scrollLeft = timelineDrag.scrollLeft - (event.clientX - timelineDrag.startX);
            event.currentTarget.scrollTop = timelineDrag.scrollTop - (event.clientY - timelineDrag.startY);
            return;
          }
          if (timelineDrag.mode === "scrub") {
            seekFromEvent(event);
            return;
          }
          setTimelineDrag({ ...timelineDrag, currentX: event.clientX, currentY: event.clientY });
        }}
        onPointerUp={(event) => {
          if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
          if (timelineDrag.mode === "marquee") {
            const rect = rectFromPoints(timelineDrag.startX, timelineDrag.startY, timelineDrag.currentX, timelineDrag.currentY);
            if (rect.width > 4 || rect.height > 4) {
              selectClipsInRect(rect, event.shiftKey);
            } else {
              seekFromEvent(event);
            }
          }
          setTimelineDrag(null);
        }}
        onLostPointerCapture={() => setTimelineDrag(null)}
        onPointerCancel={() => setTimelineDrag(null)}
        onWheel={(event) => {
          if (!timelineRef.current) return;
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.preventDefault();
          timelineRef.current.scrollLeft += event.deltaY;
        }}
        onDrop={(event) => {
          const transitionType = transitionTypeFromTransfer(event.dataTransfer);
          if (transitionType) {
            event.preventDefault();
            const zone = transitionDropFromEvent(event);
            if (zone?.valid) addTransitionToTimeline(transitionType, zone.trackId, zone.time);
            setTransitionDrop(null);
            return;
          }
          const assetId = assetIdFromTransfer(event.dataTransfer);
          if (!assetId) return;
          event.preventDefault();
          const trackId = trackIdFromPoint(event.clientX, event.clientY);
          const start = Math.max(0, timeFromEvent(event));
          setPlayhead(start);
          addAssetToTimeline(assetId, start, trackId);
        }}
        onDragOver={(event) => {
          if (hasTransitionPayload(event.dataTransfer)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setTransitionDrop(transitionDropFromEvent(event));
            return;
          }
          if (hasAssetPayload(event.dataTransfer)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            return;
          }
          event.preventDefault();
        }}
        onDragLeave={() => setTransitionDrop(null)}
      >
        <div className="timeline-stage" style={{ width: labelWidth + contentWidth, height: stageHeight }}>
          <div className="ruler-label" />
          <div className="ruler" style={{ left: labelWidth, width: contentWidth }}>
            {ticks.map((tick) => (
              <span key={tick} style={{ left: secondsToPixels(tick, pxPerSecond) }}>{formatTimecode(tick, project.timeline.fps, false)}</span>
            ))}
            {(project.timeline.markers ?? []).map((marker) => (
              <button
                className="timeline-marker"
                data-marker-id={marker.id}
                key={marker.id}
                style={{ left: secondsToPixels(marker.time, pxPerSecond), color: marker.color }}
                title={`${marker.label} ${formatTimecode(marker.time, project.timeline.fps)}`}
                onClick={() => setPlayhead(marker.time)}
              >
                <Diamond size={12} fill="currentColor" />
              </button>
            ))}
          </div>
          <div className="playhead" style={{ left: labelWidth + secondsToPixels(project.timeline.playhead, pxPerSecond) }}>
            <i />
            <button
              aria-label="Drag playhead"
              className="playhead-hit-area"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                seekFromEvent(event as unknown as PointerEvent<HTMLDivElement>);
                setTimelineDrag({ mode: "scrub", pointerId: event.pointerId });
              }}
            />
          </div>
          <div className="tracks">
            {project.timeline.tracks.map((track) => (
              <TrackRow
                addAssetToTimeline={addAssetToTimeline}
                addTransitionToTimeline={addTransitionToTimeline}
                assets={project.assets}
                contentWidth={contentWidth}
                key={track.id}
                onSelectClip={selectClip}
                onSnapGuide={setSnapGuide}
                onTargetTrack={setTargetTrackId}
                onTransitionDropPreview={setTransitionDrop}
                pxPerSecond={pxPerSecond}
                snappingEnabled={snappingEnabled}
                selectedClipIds={selectedClipIds}
                setPlayhead={setPlayhead}
                toggleTrackHidden={toggleTrackHidden}
                toggleTrackLocked={toggleTrackLocked}
                toggleTrackMuted={toggleTrackMuted}
                track={track}
                targetTrackId={targetTrackId}
              />
            ))}
          </div>
          {(project.timeline.transitions ?? []).map((transition) => (
            <TimelineTransitionBlock
              key={transition.id}
              contentWidth={contentWidth}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTransition(transition.id);
                setContextMenu({ type: "transition", x: event.clientX, y: event.clientY, transitionId: transition.id });
              }}
              onSelect={() => selectTransition(transition.id)}
              pxPerSecond={pxPerSecond}
              selected={project.timeline.selectedTransitionId === transition.id}
              timelineTracks={project.timeline.tracks}
              transition={transition}
            />
          ))}
          {transitionDrop && (
            <TransitionDropPreview
              contentWidth={contentWidth}
              pxPerSecond={pxPerSecond}
              timelineTracks={project.timeline.tracks}
              zone={transitionDrop}
            />
          )}
          {snapGuide && (
            <div
              className={`timeline-snap-guide ${snapGuide.edge ? `edge-${snapGuide.edge}` : ""}`}
              style={{ left: labelWidth + secondsToPixels(snapGuide.time, pxPerSecond) }}
            />
          )}
          {(project.timeline.markers ?? []).map((marker) => (
            <div
              className="timeline-marker-line"
              key={`${marker.id}-line`}
              style={{ left: labelWidth + secondsToPixels(marker.time, pxPerSecond), borderColor: marker.color }}
            />
          ))}
          {marquee && (marquee.width > 2 || marquee.height > 2) && (
            <div
              className="timeline-marquee"
              style={{
                left: marquee.left - (timelineRef.current?.getBoundingClientRect().left ?? 0) + (timelineRef.current?.scrollLeft ?? 0),
                top: marquee.top - (timelineRef.current?.getBoundingClientRect().top ?? 0) + (timelineRef.current?.scrollTop ?? 0),
                width: marquee.width,
                height: marquee.height
              }}
            />
          )}
        </div>
      </div>
      {contextMenu && (
        <div
          className="timeline-context-menu"
          ref={contextMenuRef}
          role="menu"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setContextMenu(null);
            }
          }}
        >
          {contextMenu.type === "clip" && (
            <>
              <button role="menuitem" onClick={() => { duplicateSelected(); setContextMenu(null); }}>Duplicate</button>
              <button
                role="menuitem"
                disabled={!compoundEligible}
                title={compoundEligible ? "Combine selected clips into one non-destructive compound clip" : "Select at least two unlocked clips"}
                onClick={() => { createCompoundFromSelected(); setContextMenu(null); }}
              >
                Create Compound Clip
              </button>
              {menuClip?.type === "compound" && (
                <button
                  role="menuitem"
                  disabled={!uncompoundEligible}
                  title={uncompoundEligible ? "Separate this compound clip back into editable clips" : "This compound clip or its layer is locked"}
                  onClick={() => { uncompoundClip(contextMenu.clipId); setContextMenu(null); }}
                >
                  Uncompound Clip
                </button>
              )}
              {menuClip?.type === "video" && (
                <button
                  role="menuitem"
                  disabled={!extractAudioEligible}
                  title={extractAudioEligible ? "Separate this video audio into its own clip" : "This video has no available audio or is already muted"}
                  onClick={() => { void extractAudioFromClip(contextMenu.clipId); setContextMenu(null); }}
                >
                  Extract Audio
                </button>
              )}
              <button role="menuitem" onClick={() => { splitSelected(); setContextMenu(null); }}>Split at Playhead</button>
              <button role="menuitem" onClick={() => { deleteSelected(); setContextMenu(null); }}>Delete</button>
              <hr />
              <button role="menuitem" onClick={() => { copySelectedClipProperties(); setContextMenu(null); }}>Copy Properties</button>
              <button role="menuitem" onClick={() => { pasteClipProperties(); setContextMenu(null); }}>Paste Properties</button>
              <button role="menuitem" onClick={() => { applyTransformAction("reset"); setContextMenu(null); }}>Reset Transform</button>
              <hr />
              <div
                className={`timeline-context-group ${speedMenuOpen ? "open" : ""}`}
                onMouseEnter={() => setSpeedMenuOpen(true)}
                onMouseLeave={() => setSpeedMenuOpen(false)}
                onFocusCapture={() => setSpeedMenuOpen(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setSpeedMenuOpen(false);
                }}
              >
                <button
                  aria-expanded={speedMenuOpen}
                  aria-haspopup="menu"
                  className="timeline-context-group-trigger"
                  role="menuitem"
                  onClick={() => setSpeedMenuOpen((open) => !open)}
                >
                  <span>Speed Change</span>
                  <ChevronRight size={14} />
                </button>
                {speedMenuOpen && (
                  <div className="timeline-context-group-items" role="menu" aria-label="Speed Change">
                    {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
                      <button role="menuitem" key={speed} onClick={() => { applySpeedPreset(speed); setContextMenu(null); }}>{speed}x</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {contextMenu.type === "track" && menuTrack && (
            <>
              <button role="menuitem" onClick={() => { toggleTrackLocked(menuTrack.id); setContextMenu(null); }}>{menuTrack.locked ? "Unlock" : "Lock"} Layer</button>
              <button role="menuitem" onClick={() => { toggleTrackMuted(menuTrack.id); setContextMenu(null); }}>{menuTrack.muted ? "Unmute" : "Mute"} Layer</button>
              <button role="menuitem" onClick={() => { toggleTrackHidden(menuTrack.id); setContextMenu(null); }}>{menuTrack.hidden ? "Show" : "Hide"} Layer</button>
              <hr />
              <button role="menuitem" onClick={() => { addTimelineTrack(); setContextMenu(null); }}>Add Layer</button>
            </>
          )}
          {contextMenu.type === "empty" && (
            <>
              <button role="menuitem" onClick={() => { addMarker(contextMenu.time); setContextMenu(null); }}>Add Marker</button>
              <button role="menuitem" onClick={() => { pasteClipProperties(); setContextMenu(null); }}>Paste Properties to Selected Clip</button>
              <hr />
              <button role="menuitem" onClick={() => { setPlayhead(contextMenu.time); addTextPreset("title"); setContextMenu(null); }}>Add Title</button>
              <button role="menuitem" onClick={() => { setPlayhead(contextMenu.time); addTextPreset("subtitle"); setContextMenu(null); }}>Add Subtitle</button>
              <button role="menuitem" onClick={() => { setPlayhead(contextMenu.time); addTextPreset("lower-third"); setContextMenu(null); }}>Add Lower Third</button>
              <button role="menuitem" onClick={() => { setPlayhead(contextMenu.time); addTextPreset("caption"); setContextMenu(null); }}>Add Caption</button>
            </>
          )}
          {contextMenu.type === "marker" && (
            <button role="menuitem" onClick={() => { removeMarker(contextMenu.markerId); setContextMenu(null); }}>Delete Marker</button>
          )}
          {contextMenu.type === "transition" && menuTransition && (
            <>
              <button role="menuitem" onClick={() => { copySelectedTransition(); setContextMenu(null); }}>Copy Transition</button>
              <button role="menuitem" onClick={() => { pasteTransitionSettings(); setContextMenu(null); }}>Paste Transition Settings</button>
              <button role="menuitem" onClick={() => { removeSelectedTransition(); setContextMenu(null); }}>Delete Transition</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function trackTop(tracks: TimelineTrack[], trackId: string | undefined) {
  let top = 24;
  for (const track of tracks) {
    if (track.id === trackId) return top;
    top += track.height;
  }
  return undefined;
}

function transitionTrackId(tracks: TimelineTrack[], transition: TransitionInstance) {
  return tracks.find((track) => track.clips.some((clip) => clip.id === transition.leftClipId || clip.id === transition.rightClipId))?.id;
}

function transitionRangeForTracks(tracks: TimelineTrack[], transition: TransitionInstance) {
  const clips = new Map(tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
  const left = transition.leftClipId ? clips.get(transition.leftClipId) : undefined;
  const right = transition.rightClipId ? clips.get(transition.rightClipId) : undefined;
  if (transition.placement === "between" && left && right) {
    const center = (getClipEnd(left) + right.timelineStart) / 2;
    return { start: center - transition.duration / 2, end: center + transition.duration / 2 };
  }
  if (transition.placement === "in" && right) return { start: right.timelineStart, end: right.timelineStart + transition.duration };
  if (transition.placement === "out" && left) {
    const end = getClipEnd(left);
    return { start: end - transition.duration, end };
  }
  return undefined;
}

function TimelineTransitionBlock(props: {
  transition: TransitionInstance;
  timelineTracks: TimelineTrack[];
  pxPerSecond: number;
  contentWidth: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<globalThis.HTMLButtonElement>) => void;
}) {
  const updateSelectedTransition = useEditorStore((state) => state.updateSelectedTransition);
  const range = transitionRangeForTracks(props.timelineTracks, props.transition);
  const trackId = transitionTrackId(props.timelineTracks, props.transition);
  const top = trackTop(props.timelineTracks, trackId);
  if (!range || top === undefined) return null;
  const definition = transitionDefinition(props.transition.type);
  const left = labelWidth + secondsToPixels(Math.max(0, range.start), props.pxPerSecond);
  const width = Math.max(34, Math.min(props.contentWidth, secondsToPixels(Math.max(0.05, range.end - range.start), props.pxPerSecond)));
  const beginDurationDrag = (event: PointerEvent<HTMLSpanElement>, side: "left" | "right") => {
    event.preventDefault();
    event.stopPropagation();
    props.onSelect();
    const target = event.currentTarget;
    const startX = event.clientX;
    const startDuration = props.transition.duration;
    target.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.buttons !== 1) return;
      const direction = side === "right" ? 1 : -1;
      const next = Math.max(0.05, Math.min(60, startDuration + pixelsToSeconds((moveEvent.clientX - startX) * direction, props.pxPerSecond)));
      updateSelectedTransition({ duration: next });
    };
    const cleanup = (endEvent?: globalThis.PointerEvent) => {
      if (endEvent && endEvent.pointerId !== event.pointerId) return;
      if (target.hasPointerCapture?.(event.pointerId)) {
        try { target.releasePointerCapture(event.pointerId); } catch { /* pointer capture may already be gone */ }
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };
  return (
    <button
      className={`timeline-transition-block ${props.selected ? "selected" : ""}`}
      data-transition-id={props.transition.id}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
      onContextMenu={props.onContextMenu}
      style={{ left, top: top + 5, width }}
      title={`${definition.name} transition - ${props.transition.duration.toFixed(2)}s`}
      type="button"
    >
      <span className="transition-resize left" onPointerDown={(event) => beginDurationDrag(event, "left")} />
      <strong>FX</strong>
      <em>{definition.name}</em>
      <span className="transition-resize right" onPointerDown={(event) => beginDurationDrag(event, "right")} />
    </button>
  );
}

function TransitionDropPreview(props: {
  zone: ReturnType<typeof transitionDropZone>;
  timelineTracks: TimelineTrack[];
  pxPerSecond: number;
  contentWidth: number;
}) {
  const top = trackTop(props.timelineTracks, props.zone.trackId);
  if (top === undefined) return null;
  const width = secondsToPixels(Math.max(0.05, props.zone.duration), props.pxPerSecond);
  const left = labelWidth + secondsToPixels(Math.max(0, props.zone.time - (props.zone.placement === "between" ? props.zone.duration / 2 : props.zone.placement === "out" ? props.zone.duration : 0)), props.pxPerSecond);
  return (
    <div
      className={`timeline-transition-drop ${props.zone.valid ? "valid" : "invalid"}`}
      style={{ left, top: top + 5, width: Math.max(34, Math.min(props.contentWidth, width)) }}
      title={props.zone.valid ? "Release to add transition" : props.zone.reason}
    >
      {props.zone.valid ? "Transition" : props.zone.reason}
    </div>
  );
}

function TrackRow(props: {
  track: TimelineTrack;
  targetTrackId: string | null;
  assets: Record<string, MediaAsset>;
  selectedClipIds: string[];
  pxPerSecond: number;
  contentWidth: number;
  onSelectClip: (clipId?: string, append?: boolean) => void;
  onSnapGuide: (guide: SnapGuide) => void;
  onTargetTrack: (trackId: string | null) => void;
  snappingEnabled: boolean;
  setPlayhead: (time: number) => void;
  addAssetToTimeline: (assetId: string, start?: number, trackId?: string) => void;
  addTransitionToTimeline: (type: string, trackId?: string, time?: number) => void;
  onTransitionDropPreview: (zone: ReturnType<typeof transitionDropZone> | null) => void;
  toggleTrackHidden: (trackId: string) => void;
  toggleTrackMuted: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
}) {
  const layerNumber = props.track.order + 1;
  return (
    <div className={`track-row ${props.track.locked ? "locked" : ""} ${props.targetTrackId === props.track.id ? "target-track" : ""}`} data-track-id={props.track.id} style={{ height: props.track.height }}>
      <div className="track-label">
        <strong>L{layerNumber}</strong>
        <span>{props.track.name}</span>
        <button title={props.track.hidden ? "Show layer" : "Hide layer"} onClick={() => props.toggleTrackHidden(props.track.id)}>
          {props.track.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button title={props.track.muted ? "Unmute layer" : "Mute layer"} onClick={() => props.toggleTrackMuted(props.track.id)}>
          {props.track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button title={props.track.locked ? "Unlock layer" : "Lock layer"} onClick={() => props.toggleTrackLocked(props.track.id)}>
          {props.track.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
      <div
        className="track-lane"
        data-px-per-second={props.pxPerSecond}
        data-track-id={props.track.id}
        style={{ width: props.contentWidth }}
        onDrop={(event) => {
          const transitionType = transitionTypeFromTransfer(event.dataTransfer);
          if (transitionType) {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const time = pixelsToSeconds(Math.max(0, event.clientX - rect.left), props.pxPerSecond);
            const zone = transitionDropZone(useEditorStore.getState().project.timeline, props.track.id, time, transitionDefinition(transitionType).defaultDuration);
            if (zone.valid) props.addTransitionToTimeline(transitionType, props.track.id, zone.time);
            else useEditorStore.getState().addToast("error", zone.reason ?? "Drop transitions near a visual cut or clip edge.");
            props.onTransitionDropPreview(null);
            return;
          }
          const assetId = assetIdFromTransfer(event.dataTransfer);
          if (!assetId) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const start = pixelsToSeconds(event.clientX - rect.left + event.currentTarget.scrollLeft, props.pxPerSecond);
          props.setPlayhead(Math.max(0, start));
          props.addAssetToTimeline(assetId, Math.max(0, start), props.track.id);
        }}
        onDragOver={(event) => {
          if (hasTransitionPayload(event.dataTransfer)) {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            const transitionType = transitionTypeFromTransfer(event.dataTransfer) || "cross-dissolve";
            const rect = event.currentTarget.getBoundingClientRect();
            const time = pixelsToSeconds(Math.max(0, event.clientX - rect.left), props.pxPerSecond);
            props.onTransitionDropPreview(transitionDropZone(useEditorStore.getState().project.timeline, props.track.id, time, transitionDefinition(transitionType).defaultDuration));
            return;
          }
          if (hasAssetPayload(event.dataTransfer)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            return;
          }
          event.preventDefault();
        }}
        onDragLeave={() => props.onTransitionDropPreview(null)}
      >
        {props.track.clips.map((clip) => (
          <TimelineClipBlock
            asset={clip.assetId ? props.assets[clip.assetId] : undefined}
            clip={clip}
            key={clip.id}
            pxPerSecond={props.pxPerSecond}
            selected={props.selectedClipIds.includes(clip.id)}
            onSnapGuide={props.onSnapGuide}
            onTargetTrack={props.onTargetTrack}
            trackId={props.track.id}
            trackLocked={props.track.locked}
            snappingEnabled={props.snappingEnabled}
            onSelect={(append) => props.onSelectClip(clip.id, append)}
          />
        ))}
      </div>
    </div>
  );
}

const TimelineClipBlock = memo(function TimelineClipBlock(props: {
  clip: TimelineClip;
  asset?: MediaAsset;
  pxPerSecond: number;
  selected: boolean;
  trackId: string;
  trackLocked: boolean;
  snappingEnabled: boolean;
  onSnapGuide: (guide: SnapGuide) => void;
  onTargetTrack: (trackId: string | null) => void;
  onSelect: (append: boolean) => void;
}) {
  const moveClip = useEditorStore((state) => state.moveClip);
  const trimClipBy = useEditorStore((state) => state.trimClipBy);
  const moveSelectedKeyframe = useEditorStore((state) => state.moveSelectedKeyframe);
  const moveSelectedMaskKeyframe = useEditorStore((state) => state.moveSelectedMaskKeyframe);
  const removeSelectedKeyframe = useEditorStore((state) => state.removeSelectedKeyframe);
  const removeSelectedMaskKeyframe = useEditorStore((state) => state.removeSelectedMaskKeyframe);
  const [movePreview, setMovePreview] = useState<{ start: number; y: number; trackId: string; snapping: boolean; edge?: "start" | "end" } | null>(null);
  const [trimDelta, setTrimDelta] = useState(0);
  const [activeTrimSide, setActiveTrimSide] = useState<"start" | "end" | null>(null);
  const [trimSnapEdge, setTrimSnapEdge] = useState<"start" | "end" | null>(null);
  const [selectedKeyframeKey, setSelectedKeyframeKey] = useState<string | null>(null);
  const [draggedKeyframe, setDraggedKeyframe] = useState<{ key: string; time: number } | null>(null);
  const moveDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originalStart: number;
    originalTrackId: string;
    pending: boolean;
    latestStart: number;
    latestTrackId: string;
    currentSnap: SnapGuide;
    raf: number | null;
  } | null>(null);
  const trimStartX = useRef(0);
  const trimSide = useRef<"start" | "end">("end");
  const trimDeltaRef = useRef(0);
  const trimmingRef = useRef(false);
  const keyframeDragRef = useRef<{ marker: TimelineKeyframeMarker; key: string; pointerId: number; startX: number; startTime: number; nextTime: number; moved: boolean } | null>(null);

  const locked = props.trackLocked || props.clip.locked;

  const trackIdFromPointer = (clientY: number) => Array.from(document.querySelectorAll<HTMLElement>(".track-row[data-track-id]"))
    .find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    })?.dataset.trackId ?? props.trackId;

  const avoidSameTrackOverlap = (start: number, targetTrackId: string) => {
    const timeline = useEditorStore.getState().project.timeline;
    const targetTrack = timeline.tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack) return Math.max(0, start);
    const movingRight = start >= props.clip.timelineStart;
    const duration = props.clip.duration;
    let next = Math.max(0, start);
    const others = targetTrack.clips
      .filter((clip) => clip.id !== props.clip.id)
      .sort((a, b) => a.timelineStart - b.timelineStart);
    for (const other of others) {
      const end = next + duration;
      if (next < getClipEnd(other) && end > other.timelineStart) {
        next = movingRight ? getClipEnd(other) : Math.max(0, other.timelineStart - duration);
      }
    }
    return Math.max(0, next);
  };

  const cleanupMoveDrag = (target?: HTMLElement | null, pointerId?: number) => {
    const drag = moveDragRef.current;
    if (drag?.raf) cancelAnimationFrame(drag.raf);
    if (target && pointerId !== undefined && target.hasPointerCapture?.(pointerId)) {
      try { target.releasePointerCapture(pointerId); } catch { /* pointer capture may already be gone */ }
    }
    moveDragRef.current = null;
    document.body.classList.remove("timeline-dragging");
    props.onSnapGuide(null);
    props.onTargetTrack(null);
  };

  const beginMove = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement | null)?.closest(".timeline-keyframe")) return;
    if ((event.target as HTMLElement | null)?.closest(".trim")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    setSelectedKeyframeKey(null);
    props.onSelect(event.shiftKey);
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: props.clip.timelineStart,
      originalTrackId: props.trackId,
      pending: true,
      latestStart: props.clip.timelineStart,
      latestTrackId: props.trackId,
      currentSnap: null,
      raf: null
    };
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = moveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || locked || trimmingRef.current || keyframeDragRef.current || event.buttons !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.pending && Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
    if (drag.pending) {
      drag.pending = false;
      document.body.classList.add("timeline-dragging");
      window.getSelection()?.removeAllRanges();
    }
    const timeline = useEditorStore.getState().project.timeline;
    const targetTrackId = trackIdFromPointer(event.clientY);
    const targetTrack = timeline.tracks.find((track) => track.id === targetTrackId);
    const validTarget = Boolean(targetTrack && !targetTrack.locked && isClipCompatibleWithTrack(props.clip.type, targetTrack.type));
    const safeTrackId = validTarget ? targetTrackId : drag.originalTrackId;
    const rawStart = Math.max(0, drag.originalStart + pixelsToSeconds(dx, props.pxPerSecond));
    const snapThresholdSeconds = 8 / props.pxPerSecond;
    const snapped = props.snappingEnabled && !event.altKey
      ? resolveMagneticSnap(rawStart, props.clip.duration, getMagneticSnapTargets(timeline, props.clip.id), snapThresholdSeconds)
      : { start: rawStart, snapped: false };
    const nextStart = avoidSameTrackOverlap(snapped.start, safeTrackId);
    drag.latestStart = nextStart;
    drag.latestTrackId = safeTrackId;
    drag.currentSnap = snapped.snapped && snapped.guideTime !== undefined ? { time: snapped.guideTime, edge: snapped.edge } : null;
    props.onSnapGuide(drag.currentSnap);
    props.onTargetTrack(safeTrackId);
    if (drag.raf) cancelAnimationFrame(drag.raf);
    drag.raf = requestAnimationFrame(() => {
      setMovePreview({ start: nextStart, y: dy, trackId: safeTrackId, snapping: Boolean(drag.currentSnap), edge: drag.currentSnap?.edge });
      drag.raf = null;
    });
  };

  const endMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = moveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || trimmingRef.current || keyframeDragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.pending && !locked) {
      const changed = Math.abs(drag.latestStart - drag.originalStart) > 0.001 || drag.latestTrackId !== drag.originalTrackId;
      if (changed) moveClip(props.clip.id, Math.max(0, drag.latestStart), drag.latestTrackId, false);
    }
    setMovePreview(null);
    cleanupMoveDrag(event.currentTarget, event.pointerId);
  };

  const cancelMove = (event: PointerEvent<HTMLDivElement>) => {
    setMovePreview(null);
    cleanupMoveDrag(event.currentTarget, event.pointerId);
  };

  const beginTrim = (event: PointerEvent<HTMLSpanElement>, side: "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    props.onSelect(event.shiftKey);
    if (locked) return;
    trimmingRef.current = true;
    trimSide.current = side;
    setActiveTrimSide(side);
    trimStartX.current = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.buttons !== 1) return;
      moveEvent.preventDefault();
      const rawDelta = pixelsToSeconds(moveEvent.clientX - trimStartX.current, props.pxPerSecond);
      let nextDelta = rawDelta;
      let guide: SnapGuide = null;
      if (props.snappingEnabled && !moveEvent.altKey) {
        const timeline = useEditorStore.getState().project.timeline;
        const targets = getMagneticSnapTargets(timeline, props.clip.id);
        const thresholdSeconds = 8 / props.pxPerSecond;
        if (trimSide.current === "start") {
          const snapped = resolveMagneticSnap(props.clip.timelineStart + rawDelta, 0, targets, thresholdSeconds);
          if (snapped.snapped) {
            nextDelta = snapped.start - props.clip.timelineStart;
            guide = snapped.guideTime !== undefined ? { time: snapped.guideTime, edge: "start" } : null;
          }
        } else {
          const originalEnd = getClipEnd(props.clip);
          const snapped = resolveMagneticSnap(originalEnd + rawDelta, 0, targets, thresholdSeconds);
          if (snapped.snapped) {
            nextDelta = snapped.start - originalEnd;
            guide = snapped.guideTime !== undefined ? { time: snapped.guideTime, edge: "end" } : null;
          }
        }
      }
      trimDeltaRef.current = nextDelta;
      props.onSnapGuide(guide);
      setTrimSnapEdge(guide?.edge ?? null);
      setTrimDelta(trimDeltaRef.current);
    };
    const cleanup = (endEvent?: globalThis.PointerEvent) => {
      if (endEvent && endEvent.pointerId !== event.pointerId) return;
      if (trimDeltaRef.current !== 0) trimClipBy(props.clip.id, trimSide.current, trimDeltaRef.current);
      trimmingRef.current = false;
      trimDeltaRef.current = 0;
      setTrimDelta(0);
      setActiveTrimSide(null);
      setTrimSnapEdge(null);
      props.onSnapGuide(null);
      if (target.hasPointerCapture?.(event.pointerId)) {
        try { target.releasePointerCapture(event.pointerId); } catch { /* pointer capture may already be gone */ }
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  const keyForMarker = (marker: TimelineKeyframeMarker) => `${marker.kind}:${marker.kind === "mask" ? `${marker.maskId}:` : ""}${marker.id}`;

  const removeMarkerKeyframe = (marker: TimelineKeyframeMarker) => {
    if (marker.kind === "mask") {
      removeSelectedMaskKeyframe(marker.maskId, marker.id);
      return;
    }
    removeSelectedKeyframe(marker.kind, marker.id);
  };

  const commitMarkerMove = (marker: TimelineKeyframeMarker, time: number) => {
    if (marker.kind === "mask") {
      moveSelectedMaskKeyframe(marker.maskId, marker.id, time);
      return;
    }
    moveSelectedKeyframe(marker.kind, marker.id, time);
  };

  const beginKeyframeDrag = (event: PointerEvent<HTMLElement>, marker: TimelineKeyframeMarker) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    props.onSelect(false);
    const key = keyForMarker(marker);
    setSelectedKeyframeKey(key);
    if (locked) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    keyframeDragRef.current = { marker, key, pointerId: event.pointerId, startX: event.clientX, startTime: marker.time, nextTime: marker.time, moved: false };

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const drag = keyframeDragRef.current;
      if (!drag || moveEvent.pointerId !== drag.pointerId || moveEvent.buttons !== 1) return;
      const rawTime = Math.min(props.clip.duration, Math.max(0, drag.startTime + pixelsToSeconds(moveEvent.clientX - drag.startX, props.pxPerSecond)));
      const fps = useEditorStore.getState().project.timeline.fps;
      const nextTime = Math.min(props.clip.duration, framesToSeconds(secondsToFrames(rawTime, fps), fps));
      drag.nextTime = nextTime;
      drag.moved = drag.moved || Math.abs(nextTime - drag.startTime) > 0.001;
      setDraggedKeyframe({ key: drag.key, time: nextTime });
    };

    const cleanup = (endEvent?: globalThis.PointerEvent) => {
      const drag = keyframeDragRef.current;
      if (!drag || (endEvent && endEvent.pointerId !== drag.pointerId)) return;
      if (endEvent?.type === "pointerup" && drag.moved) commitMarkerMove(drag.marker, drag.nextTime);
      if (target.hasPointerCapture?.(drag.pointerId)) {
        try { target.releasePointerCapture(drag.pointerId); } catch { /* pointer capture may already be gone */ }
      }
      keyframeDragRef.current = null;
      setDraggedKeyframe(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  useEffect(() => {
    if (!props.selected) setSelectedKeyframeKey(null);
  }, [props.selected]);

  const effectiveStart = (movePreview?.start ?? props.clip.timelineStart) + (activeTrimSide === "start" ? trimDelta : 0);
  const effectiveDuration = props.clip.duration + (activeTrimSide === "end" ? trimDelta : activeTrimSide === "start" ? -trimDelta : 0);
  const left = secondsToPixels(Math.max(0, effectiveStart), props.pxPerSecond);
  const width = Math.max(34, secondsToPixels(Math.max(0.25, effectiveDuration), props.pxPerSecond));
  const keyframes: TimelineKeyframeMarker[] = props.selected ? [
    ...(props.clip.keyframes?.transform ?? []).map((keyframe) => ({ ...keyframe, kind: "transform" as const })),
    ...(props.clip.keyframes?.audio ?? []).map((keyframe) => ({ ...keyframe, kind: "audio" as const })),
    ...(props.clip.keyframes?.speed ?? []).map((keyframe) => ({ ...keyframe, kind: "speed" as const })),
    ...(props.clip.keyframes?.color ?? []).map((keyframe) => ({ ...keyframe, kind: "color" as const })),
    ...(props.clip.masks ?? []).flatMap((mask) => mask.keyframes.map((keyframe) => ({ id: keyframe.id, maskId: mask.id, time: keyframe.time, kind: "mask" as const })))
  ].sort((a, b) => a.time - b.time) : [];
  const isAudioClip = props.clip.type === "audio" || props.asset?.type === "audio";
  const isVisualClip = props.clip.type === "video" || props.clip.type === "image" || props.asset?.type === "video" || props.asset?.type === "image";
  const isCompoundClip = props.clip.type === "compound";
  const textPreview = textClipPreviewLabel(props.clip);
  const displayClipName = isCompoundClip ? "Compound Clip" : props.clip.name;
  const thumbnailSource = props.asset?.thumbnailPath ?? (props.asset?.type === "image" ? props.asset.path : undefined);
  const thumbnailUrl = mediaPathToSrc(thumbnailSource);
  const clipStyle = {
    left,
    width,
    backgroundColor: props.clip.color,
    transform: movePreview?.y ? `translateY(${movePreview.y}px)` : undefined,
    "--clip-thumbnail": thumbnailUrl ? `url("${thumbnailUrl}")` : undefined
  } as CSSProperties;

  return (
    <div
      className={`timeline-clip clip-${props.clip.type} ${props.selected ? "selected" : ""} ${locked ? "locked" : ""} ${movePreview ? "drag-preview" : ""} ${movePreview?.snapping || trimSnapEdge ? "snapping" : ""} ${movePreview?.edge ? `snap-${movePreview.edge}` : ""} ${trimSnapEdge ? `snap-${trimSnapEdge}` : ""}`}
      data-clip-id={props.clip.id}
      style={clipStyle}
      onPointerDown={beginMove}
      onPointerMove={onMove}
      onPointerUp={endMove}
      onPointerCancel={cancelMove}
      onLostPointerCapture={cancelMove}
      title={locked ? `${displayClipName} is locked` : displayClipName}
    >
      <span className="trim trim-left" onPointerDown={(event) => beginTrim(event, "start")} />
      <div className="clip-capcut-header">
        <strong>{displayClipName}</strong>
        <em>{formatTimecode(props.clip.duration)}</em>
      </div>
      {isAudioClip ? (
        <div className="clip-audio-body">
          <Waveform bars={props.asset?.waveformPeaks ?? []} pixelWidth={width} variant="audio" />
        </div>
      ) : (
        <div className={`clip-thumb-strip ${isVisualClip ? "has-media" : "no-media"}`}>
          {!thumbnailUrl && (
            <span>{props.clip.type === "effect" ? "FX" : props.clip.type === "filter" ? "Filter" : props.clip.type === "text" ? textPreview : isCompoundClip ? `${props.clip.compound?.clips.length ?? 0} clips` : props.clip.type}</span>
          )}
        </div>
      )}
      {!isAudioClip && props.asset?.type === "video" && !props.clip.audio?.muted ? (
        <div className="clip-audio-ribbon">
          <Waveform bars={props.asset?.waveformPeaks ?? []} pixelWidth={width} variant="ribbon" />
        </div>
      ) : null}
      {keyframes.map((keyframe) => (
        <button
          className={`timeline-keyframe timeline-keyframe-${keyframe.kind} ${selectedKeyframeKey === keyForMarker(keyframe) ? "selected" : ""}`}
          key={keyForMarker(keyframe)}
          type="button"
          data-keyframe-id={keyframe.id}
          style={{ left: `${Math.min(100, Math.max(0, (((draggedKeyframe?.key === keyForMarker(keyframe) ? draggedKeyframe.time : keyframe.time) / props.clip.duration) * 100)))}%` }}
          title={`${keyframe.kind} keyframe ${keyframe.time.toFixed(2)}s. Drag to retime, press Delete to remove.`}
          onPointerDown={(event) => beginKeyframeDrag(event, keyframe)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (locked) return;
            removeMarkerKeyframe(keyframe);
            setSelectedKeyframeKey(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Delete" && event.key !== "Backspace") return;
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            if (locked) return;
            removeMarkerKeyframe(keyframe);
            setSelectedKeyframeKey(null);
          }}
        >
          <Diamond size={9} fill="currentColor" />
        </button>
      ))}
      <span className="trim trim-right" onPointerDown={(event) => beginTrim(event, "end")} />
    </div>
  );
});

function waveformFallback(index: number, count: number) {
  const phase = index / Math.max(1, count - 1);
  return Math.min(1, Math.max(0.08, Math.abs(Math.sin(index * 0.77)) * 0.38 + Math.abs(Math.sin(phase * Math.PI * 7)) * 0.42));
}

function waveformSamples(bars: number[], count: number) {
  if (!bars.length) return Array.from({ length: count }, (_, index) => waveformFallback(index, count));
  if (bars.length === 1) return Array.from({ length: count }, () => Math.min(1, Math.max(0, bars[0])));
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = (index / Math.max(1, count - 1)) * (bars.length - 1);
    const left = Math.floor(sourceIndex);
    const right = Math.min(bars.length - 1, left + 1);
    const mix = sourceIndex - left;
    const value = bars[left] * (1 - mix) + bars[right] * mix;
    return Math.min(1, Math.max(0.04, value));
  });
}

function Waveform({ bars, pixelWidth, variant = "audio" }: { bars: number[]; pixelWidth: number; variant?: "audio" | "ribbon" }) {
  const sampleCount = Math.min(1800, Math.max(64, Math.ceil(pixelWidth / (variant === "audio" ? 2.2 : 3.2))));
  const samples = useMemo(() => waveformSamples(bars, sampleCount), [bars, sampleCount]);
  return (
    <div className={`waveform waveform-${variant}`}>
      {samples.map((value, index) => (
        <i
          className={value > 0.72 ? "hot" : value > 0.48 ? "warm" : undefined}
          key={index}
          style={{ "--amp": value } as CSSProperties}
        />
      ))}
    </div>
  );
}
