/* global AudioBuffer, AudioContext, File, HTMLAudioElement, Image, URL */
import { ChangeEvent, DragEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, ChevronDown, Filter, Folder, Grid2X2, Import, List, Pause, Play, Plus, Scissors, Search, Trash2, X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { MediaAsset, MediaType } from "../../types/editor";
import { formatTimecode } from "../../utils/time";
import { mediaPathToSrc } from "../../utils/mediaPaths";
import { beginTimelinePointerDrag } from "../../utils/timelineDomDrop";
import { clampTrimRange, formatTrimTime, frameStep, MIN_TRIM_DURATION, parseTrimTime, trimDuration as selectedDurationOf, validateTrimRange } from "../../utils/trim";

type ProbeResult = {
  id: string;
  path: string;
  name: string;
  mediaType: MediaType;
  duration: number;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  thumbnailPath?: string;
  waveform: number[];
};

const extensions = [
  "mp4", "mov", "mkv", "webm",
  "mp3", "m4a", "wav", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif",
  "png", "jpg", "jpeg", "webp", "bmp", "gif"
];

function isImportedMediaAsset(asset: MediaAsset): boolean {
  return !asset.id.startsWith("sticker-");
}

export function MediaPanel() {
  const assetMap = useEditorStore((state) => state.project.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const mediaUi = useEditorStore((state) => state.mediaUi);
  const addAsset = useEditorStore((state) => state.addAsset);
  const removeAsset = useEditorStore((state) => state.removeAsset);
  const selectAsset = useEditorStore((state) => state.selectAsset);
  const previewAsset = useEditorStore((state) => state.previewAsset);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addAssetRangeToTimeline = useEditorStore((state) => state.addAssetRangeToTimeline);
  const addToast = useEditorStore((state) => state.addToast);
  const setMediaFilter = useEditorStore((state) => state.setMediaFilter);
  const setMediaSort = useEditorStore((state) => state.setMediaSort);
  const setMediaView = useEditorStore((state) => state.setMediaView);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<"Project Media" | "Stock" | "Brand Kit">("Project Media");
  const [failed, setFailed] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const [trimAssetId, setTrimAssetId] = useState<string | null>(null);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(1);
  const [trimPlayhead, setTrimPlayhead] = useState(0);
  const [trimPlaying, setTrimPlaying] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [trimInputFocus, setTrimInputFocus] = useState(false);
  const [dragMode, setDragMode] = useState<"playhead" | "in" | "out" | null>(null);
  const suppressClickRef = useRef(false);
  const trimVideoRef = useRef<HTMLVideoElement | null>(null);
  const trimAudioRef = useRef<HTMLAudioElement | null>(null);
  const trimStripRef = useRef<HTMLDivElement | null>(null);
  const webFileInputRef = useRef<HTMLInputElement | null>(null);
  const assets = useMemo(() => Object.values(assetMap).filter(isImportedMediaAsset), [assetMap]);
  const contextAsset = contextMenu ? assetMap[contextMenu.assetId] : undefined;
  const trimAsset = trimAssetId ? assetMap[trimAssetId] : undefined;
  const isTauri = "__TAURI_INTERNALS__" in window;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((asset) => mediaUi.filter === "all" || asset.type === mediaUi.filter)
      .filter((asset) => q ? asset.name.toLowerCase().includes(q) : true)
      .sort((a, b) => {
        if (mediaUi.sort === "date") return b.importedAt.localeCompare(a.importedAt);
        if (mediaUi.sort === "type") return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        if (mediaUi.sort === "duration") return (b.duration ?? 0) - (a.duration ?? 0);
        return a.name.localeCompare(b.name);
      });
  }, [assets, mediaUi.filter, mediaUi.sort, query]);

  const importPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    if (!isTauri) {
      addToast("error", "Use local file upload in the web editor.");
      return;
    }
    setImporting(true);
    setFailed([]);
    const failures: string[] = [];
    try {
      for (const path of paths) {
        try {
          const result = await invoke<ProbeResult>("probe_media", { path });
          if (result.mediaType === "unknown") throw new Error("Unsupported media type");
          addAsset(toAsset(result));
        } catch (error) {
          failures.push(`${path}: ${String(error)}`);
        }
      }
      if (failures.length) {
        setFailed(failures);
        addToast("error", `${failures.length} file${failures.length === 1 ? "" : "s"} failed to import.`);
      }
      const imported = paths.length - failures.length;
      if (imported > 0) addToast("success", `Imported ${imported} file${imported === 1 ? "" : "s"}.`);
    } finally {
      setImporting(false);
    }
  };

  const importMedia = async () => {
    if (!isTauri) {
      webFileInputRef.current?.click();
      return;
    }
    const selected = await open({
      multiple: true,
      filters: [{ name: "Media", extensions }]
    });
    await importPaths(Array.isArray(selected) ? selected : selected ? [selected] : []);
  };

  const importWebFiles = async (files: File[]) => {
    const supported = files.filter(isSupportedBrowserFile);
    if (!supported.length) {
      addToast("error", "Choose a supported video, audio, or image file.");
      return;
    }
    setImporting(true);
    setFailed([]);
    const failures: string[] = [];
    try {
      for (const file of supported) {
        try {
          addAsset(await browserFileToAsset(file));
        } catch (error) {
          failures.push(`${file.name}: ${String(error)}`);
        }
      }
      if (failures.length) {
        setFailed(failures);
        addToast("error", `${failures.length} file${failures.length === 1 ? "" : "s"} failed to import.`);
      }
      const imported = supported.length - failures.length;
      if (imported > 0) addToast("success", `Imported ${imported} local file${imported === 1 ? "" : "s"}.`);
    } finally {
      setImporting(false);
    }
  };

  const addLibraryAssetToTimeline = (asset: MediaAsset) => {
    previewAsset(asset.id);
    addAssetToTimeline(asset.id);
    addToast("success", `${asset.name} added to the timeline.`);
  };

  const openTrimDialog = (asset: MediaAsset) => {
    if (asset.type === "image") return;
    const duration = Math.max(MIN_TRIM_DURATION, asset.duration ?? MIN_TRIM_DURATION);
    const range = clampTrimRange({ inPoint: asset.trimIn ?? 0, outPoint: asset.trimOut ?? duration }, duration);
    setTrimAssetId(asset.id);
    setTrimIn(range.inPoint);
    setTrimOut(range.outPoint);
    setTrimPlayhead(range.inPoint);
    setTrimPlaying(false);
    setTrimError(null);
    setContextMenu(null);
  };

  const deleteImportedAsset = (asset: MediaAsset) => {
    setContextMenu(null);
    if (!window.confirm(`Delete "${asset.name}" from Project Media?`)) return;
    removeAsset(asset.id);
  };

  const confirmTrimRange = () => {
    if (!trimAsset) return;
    const error = validateTrimRange({ inPoint: clampedTrimIn, outPoint: clampedTrimOut }, trimDuration);
    if (error) {
      setTrimError(error);
      return;
    }
    addAssetRangeToTimeline(trimAsset.id, clampedTrimIn, clampedTrimOut);
    addToast("success", "Trimmed clip added to timeline.");
    setTrimAssetId(null);
  };

  const useFullClip = () => {
    if (!trimAsset) return;
    const duration = Math.max(MIN_TRIM_DURATION, trimAsset.duration ?? MIN_TRIM_DURATION);
    addAssetRangeToTimeline(trimAsset.id, 0, duration);
    addToast("success", "Full clip added to timeline.");
    setTrimAssetId(null);
  };

  const trimDuration = Math.max(MIN_TRIM_DURATION, trimAsset?.duration ?? MIN_TRIM_DURATION);
  const clamped = clampTrimRange({ inPoint: trimIn, outPoint: trimOut }, trimDuration);
  const clampedTrimIn = clamped.inPoint;
  const clampedTrimOut = clamped.outPoint;
  const selectedTrimDuration = selectedDurationOf({ inPoint: clampedTrimIn, outPoint: clampedTrimOut });
  const clampedPlayhead = Math.max(0, Math.min(trimPlayhead, trimDuration));
  const validationError = trimError ?? validateTrimRange({ inPoint: clampedTrimIn, outPoint: clampedTrimOut }, trimDuration);
  const activeRangeLeft = `${(clampedTrimIn / trimDuration) * 100}%`;
  const activeRangeWidth = `${((clampedTrimOut - clampedTrimIn) / trimDuration) * 100}%`;
  const playheadLeft = `${(clampedPlayhead / trimDuration) * 100}%`;

  const setTrimInClamped = (value: number) => {
    setTrimError(null);
    setTrimIn(Math.max(0, Math.min(value, clampedTrimOut - MIN_TRIM_DURATION)));
  };

  const setTrimOutClamped = (value: number) => {
    setTrimError(null);
    setTrimOut(Math.max(clampedTrimIn + MIN_TRIM_DURATION, Math.min(value, trimDuration)));
  };

  const seekTrimPlayhead = (value: number) => {
    const next = Math.max(0, Math.min(value, trimDuration));
    setTrimPlayhead(next);
    const media = trimVideoRef.current ?? trimAudioRef.current;
    if (media) media.currentTime = next;
  };

  const pointerTime = (event: PointerEvent<HTMLElement>) => {
    const rect = trimStripRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(trimDuration, ((event.clientX - rect.left) / Math.max(1, rect.width)) * trimDuration));
  };

  const moveTrimPointer = (event: PointerEvent<HTMLElement>) => {
    if (!dragMode || event.buttons !== 1) return;
    const time = pointerTime(event);
    if (dragMode === "in") setTrimInClamped(time);
    if (dragMode === "out") setTrimOutClamped(time);
    if (dragMode === "playhead") seekTrimPlayhead(time);
  };

  const setInAtPlayhead = () => setTrimInClamped(Math.min(clampedPlayhead, clampedTrimOut - MIN_TRIM_DURATION));
  const setOutAtPlayhead = () => setTrimOutClamped(Math.max(clampedPlayhead, clampedTrimIn + MIN_TRIM_DURATION));

  const applyManualTime = (kind: "in" | "out", value: string) => {
    const parsed = parseTrimTime(value);
    if (parsed === null) {
      setTrimError("Use seconds or HH:MM:SS.ss time format.");
      return;
    }
    if (kind === "in") setTrimInClamped(parsed);
    else setTrimOutClamped(parsed);
  };

  const toggleTrimPlayback = () => {
    const media = trimVideoRef.current ?? trimAudioRef.current;
    if (!media) return;
    if (trimPlaying) {
      media.pause();
      setTrimPlaying(false);
      return;
    }
    if (media.currentTime < clampedTrimIn || media.currentTime >= clampedTrimOut) media.currentTime = clampedTrimIn;
    void media.play().then(() => setTrimPlaying(true)).catch(() => setTrimPlaying(false));
  };

  const handleTrimKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (trimInputFocus) return;
    if (event.key === " ") {
      event.preventDefault();
      toggleTrimPlayback();
    } else if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      setInAtPlayhead();
    } else if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      setOutAtPlayhead();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekTrimPlayhead(clampedPlayhead - (event.shiftKey ? 1 : frameStep(trimAsset?.fps)));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seekTrimPlayhead(clampedPlayhead + (event.shiftKey ? 1 : frameStep(trimAsset?.fps)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      confirmTrimRange();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTrimAssetId(null);
    }
  };

  useEffect(() => {
    if (!trimAsset) return undefined;
    const media = trimVideoRef.current ?? trimAudioRef.current;
    if (!media) return undefined;
    const syncToTrimIn = () => {
      if (Number.isFinite(clampedTrimIn)) media.currentTime = clampedTrimIn;
    };
    const loopTrimRange = () => {
      setTrimPlayhead(media.currentTime);
      if (media.currentTime < clampedTrimIn || media.currentTime >= clampedTrimOut) {
        media.currentTime = clampedTrimIn;
        setTrimPlayhead(clampedTrimIn);
        if (trimPlaying) void media.play().catch(() => undefined);
      }
    };
    const pauseState = () => setTrimPlaying(false);
    syncToTrimIn();
    media.addEventListener("loadedmetadata", syncToTrimIn);
    media.addEventListener("timeupdate", loopTrimRange);
    media.addEventListener("pause", pauseState);
    media.addEventListener("ended", pauseState);
    return () => {
      media.removeEventListener("loadedmetadata", syncToTrimIn);
      media.removeEventListener("timeupdate", loopTrimRange);
      media.removeEventListener("pause", pauseState);
      media.removeEventListener("ended", pauseState);
    };
  }, [clampedTrimIn, clampedTrimOut, trimAsset, trimPlaying]);

  const onDropImport = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!isTauri) {
      await importWebFiles(Array.from(event.dataTransfer.files));
      return;
    }
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => "path" in file ? String((file as { path?: string }).path ?? "") : "")
      .filter(Boolean);
    await importPaths(paths);
  };

  const folders: Array<[string, typeof mediaUi.filter, number]> = [
    ["All Media", "all", assets.length],
    ["Footage", "video", assets.filter((asset) => asset.type === "video").length],
    ["Audio", "audio", assets.filter((asset) => asset.type === "audio").length],
    ["Images", "image", assets.filter((asset) => asset.type === "image").length]
  ];

  return (
    <aside className="media-panel" onDrop={onDropImport} onDragOver={(event) => event.preventDefault()} onClick={() => setContextMenu(null)}>
      <input
        ref={webFileInputRef}
        className="web-file-input"
        type="file"
        accept={extensions.map((extension) => `.${extension}`).join(",")}
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void importWebFiles(files);
        }}
      />
      <div className="panel-tabs">
        {(["Project Media", "Stock", "Brand Kit"] as const).map((name) => (
          <button className={tab === name ? "active" : ""} key={name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className="media-actions">
        <button className="import-button" onClick={importMedia} disabled={importing}>
          <Import size={16} /> {importing ? "Importing..." : "Import"} <ChevronDown size={15} />
        </button>
        <div className="view-actions">
          <button className={mediaUi.view === "grid" ? "active" : ""} title="Grid view" onClick={() => setMediaView("grid")}><Grid2X2 size={17} /></button>
          <button className={mediaUi.view === "list" ? "active" : ""} title="List view" onClick={() => setMediaView("list")}><List size={17} /></button>
          <button title="Type filters are in the folder list"><Filter size={17} /></button>
        </div>
      </div>
      <label className="search-box">
        <Search size={15} />
        <input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search media..." />
      </label>
      <div className="media-browser">
        <div className="folders">
          <span>Folders</span>
          {folders.map(([name, filter, count]) => (
            <button className={mediaUi.filter === filter ? "active" : ""} key={name} onClick={() => setMediaFilter(filter)}>
              <Folder size={16} />
              <span>{name}</span>
              <em>{count}</em>
            </button>
          ))}
        </div>
        <div className="media-grid-wrap">
          <div className="media-sort">
            <strong>Sort</strong>
            <select value={mediaUi.sort} onChange={(event) => setMediaSort(event.target.value as typeof mediaUi.sort)}>
              <option value="name">Name</option>
              <option value="date">Date imported</option>
              <option value="type">Type</option>
              <option value="duration">Duration</option>
            </select>
          </div>
          {failed.length > 0 && (
            <div className="import-errors">
              {failed.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
            </div>
          )}
          {tab !== "Project Media" ? (
            <div className="empty-media">
              <Import size={24} />
              <strong>{tab}</strong>
              <span>{tab === "Stock" ? "Stock media is staged for the asset-library pass." : "Brand fonts, colors, and logos will be managed here."}</span>
            </div>
          ) : filtered.length === 0 ? (
            <button className="empty-media empty-media-button" type="button" onDoubleClick={() => void importMedia()} onClick={() => void importMedia()}>
              <Import size={24} />
              <strong>Import local media</strong>
              <span>Drop files here, click to import, or double-click to choose media.</span>
            </button>
          ) : (
            <div className={`media-grid media-${mediaUi.view}`}>
              {filtered.map((asset) => (
                <button
                  className={`media-card ${selectedAssetId === asset.id ? "selected" : ""}`}
                  key={asset.id}
                  draggable
                  onPointerDown={(event) => {
                    beginTimelinePointerDrag(
                      event,
                      asset.name,
                      (drop) => addAssetToTimeline(asset.id, drop.time, drop.trackId),
                      () => addToast("error", "Drop media onto a timeline layer."),
                      (dragging) => {
                        if (dragging) suppressClickRef.current = true;
                        else setTimeout(() => { suppressClickRef.current = false; }, 0);
                      }
                    );
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.clearData();
                    event.dataTransfer.setData("application/x-mahee-asset", asset.id);
                    event.dataTransfer.setData("text/plain", `mahee-asset:${asset.id}`);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    selectAsset(asset.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectAsset(asset.id);
                    setContextMenu({ assetId: asset.id, x: event.clientX, y: event.clientY });
                  }}
                  onDoubleClick={() => {
                    addLibraryAssetToTimeline(asset);
                  }}
                  title="Double-click to add this media to the timeline"
                >
                  <MediaThumb asset={asset} selected={selectedAssetId === asset.id} />
                  <span>{asset.name}</span>
                  <small>{asset.type}{asset.width && asset.height ? ` / ${asset.width}x${asset.height}` : ""}</small>
                  {asset.type !== "image" && (asset.trimIn !== undefined || asset.trimOut !== undefined) && (
                    <small className="asset-trim-label">
                      Trim {formatTimecode(asset.trimIn ?? 0, asset.fps ?? 30, false)} - {formatTimecode(asset.trimOut ?? asset.duration ?? 0, asset.fps ?? 30, false)}
                    </small>
                  )}
                  <button
                    className="add-mini"
                    title="Add to timeline"
                    onClick={(event) => {
                      event.stopPropagation();
                      addLibraryAssetToTimeline(asset);
                    }}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    className="delete-mini"
                    title="Delete imported asset"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteImportedAsset(asset);
                    }}
                  >
                    <X size={13} />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {contextMenu && contextAsset && (
        <div
          className="media-context-menu"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 230), top: Math.min(contextMenu.y, window.innerHeight - 190) }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={() => addLibraryAssetToTimeline(contextAsset)}><Plus size={14} /> Add to Timeline</button>
          {contextAsset.type !== "image" && <button onClick={() => openTrimDialog(contextAsset)}><Scissors size={14} /> Trim Before Insert</button>}
          <button onClick={() => previewAsset(contextAsset.id)}><Import size={14} /> Preview Asset</button>
          <hr />
          <button className="danger" onClick={() => deleteImportedAsset(contextAsset)}><Trash2 size={14} /> Delete from Project Media</button>
        </div>
      )}
      {trimAsset && createPortal(
        <div className="modal-backdrop media-trim-backdrop">
          <section className="media-trim-dialog" tabIndex={-1} onKeyDown={handleTrimKeyDown}>
            <header>
              <div>
                <h2>Trim Before Timeline</h2>
                <span>{trimAsset.name}</span>
              </div>
              <button onClick={() => setTrimAssetId(null)}><X size={18} /></button>
            </header>
            <div className="media-trim-preview">
              {trimAsset.type === "video" ? (
                <video ref={trimVideoRef} src={mediaPathToSrc(trimAsset.path)} />
              ) : (
                <>
                  <AudioThumb peaks={trimAsset.waveformPeaks ?? []} />
                  <audio ref={trimAudioRef} src={mediaPathToSrc(trimAsset.path)} />
                </>
              )}
            </div>
            <div className="trim-playback-row">
              <button onClick={toggleTrimPlayback}>{trimPlaying ? <Pause size={16} /> : <Play size={16} />} {trimPlaying ? "Pause" : "Play"}</button>
              <strong>{formatTrimTime(clampedPlayhead)}</strong>
              <span>/ {formatTrimTime(trimDuration)}</span>
              <button onClick={setInAtPlayhead}>Set In</button>
              <button onClick={setOutAtPlayhead}>Set Out</button>
            </div>
            <div className="trim-live-summary">
              <strong>Selected duration: {formatTrimTime(selectedTrimDuration)}</strong>
              <span>Only the highlighted range will be added to the timeline.</span>
            </div>
            <div
              className={`trim-timeline ${trimAsset.type === "audio" ? "audio" : "video"}`}
              onPointerMove={moveTrimPointer}
              onPointerUp={() => setDragMode(null)}
              onPointerCancel={() => setDragMode(null)}
              onPointerLeave={() => setDragMode(null)}
            >
              <div className="trim-range-header">
                <span>Start: {formatTimecode(clampedTrimIn, trimAsset.fps ?? 30, false)}</span>
                <span>End: {formatTimecode(clampedTrimOut, trimAsset.fps ?? 30, false)}</span>
              </div>
              <div
                className="trim-strip"
                ref={trimStripRef}
                onPointerMove={moveTrimPointer}
                onPointerUp={() => setDragMode(null)}
                onPointerCancel={() => setDragMode(null)}
                onPointerDown={(event) => {
                  setDragMode("playhead");
                  event.currentTarget.setPointerCapture(event.pointerId);
                  seekTrimPlayhead(pointerTime(event));
                }}
              >
                {trimAsset.type === "audio" ? (
                  <AudioThumb peaks={trimAsset.waveformPeaks ?? []} />
                ) : (
                  <div className="trim-thumbnail-strip" style={{ backgroundImage: trimAsset.thumbnailPath ? `url("${mediaPathToSrc(trimAsset.thumbnailPath)}")` : undefined }} />
                )}
                <i className="trim-dim left" style={{ width: activeRangeLeft }} />
                <i className="trim-dim right" style={{ left: `calc(${activeRangeLeft} + ${activeRangeWidth})` }} />
                <i className="trim-selected-range" style={{ left: activeRangeLeft, width: activeRangeWidth }} />
                <button
                  className="trim-handle in"
                  style={{ left: activeRangeLeft }}
                  onPointerMove={moveTrimPointer}
                  onPointerUp={() => setDragMode(null)}
                  onPointerCancel={() => setDragMode(null)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDragMode("in");
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                >
                  <span>In</span>
                </button>
                <button
                  className="trim-handle out"
                  style={{ left: `calc(${activeRangeLeft} + ${activeRangeWidth})` }}
                  onPointerMove={moveTrimPointer}
                  onPointerUp={() => setDragMode(null)}
                  onPointerCancel={() => setDragMode(null)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDragMode("out");
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                >
                  <span>Out</span>
                </button>
                <i className="trim-playhead" style={{ left: playheadLeft }} />
              </div>
            </div>
            <div className="trim-nudge-row">
              <button onClick={() => setTrimInClamped(clampedTrimIn - 0.1)}>-0.1s In</button>
              <button onClick={() => setTrimInClamped(clampedTrimIn + 0.1)}>+0.1s In</button>
              <button onClick={() => setTrimOutClamped(clampedTrimOut - 0.1)}>-0.1s Out</button>
              <button onClick={() => setTrimOutClamped(clampedTrimOut + 0.1)}>+0.1s Out</button>
              <button onClick={() => setTrimInClamped(clampedTrimIn - frameStep(trimAsset.fps))}>-1 frame In</button>
              <button onClick={() => setTrimInClamped(clampedTrimIn + frameStep(trimAsset.fps))}>+1 frame In</button>
              <button onClick={() => setTrimOutClamped(clampedTrimOut - frameStep(trimAsset.fps))}>-1 frame Out</button>
              <button onClick={() => setTrimOutClamped(clampedTrimOut + frameStep(trimAsset.fps))}>+1 frame Out</button>
            </div>
            <div className="trim-fields">
              <label>
                <span>In</span>
                <input key={`in-${clampedTrimIn.toFixed(2)}`} onFocus={() => setTrimInputFocus(true)} onBlur={(event) => { setTrimInputFocus(false); applyManualTime("in", event.target.value); }} defaultValue={formatTrimTime(clampedTrimIn)} />
              </label>
              <label>
                <span>Out</span>
                <input key={`out-${clampedTrimOut.toFixed(2)}`} onFocus={() => setTrimInputFocus(true)} onBlur={(event) => { setTrimInputFocus(false); applyManualTime("out", event.target.value); }} defaultValue={formatTrimTime(clampedTrimOut)} />
              </label>
              <label>
                <span>Selected</span>
                <output>{formatTrimTime(selectedTrimDuration)}</output>
              </label>
              <label>
                <span>Original</span>
                <output>{formatTrimTime(trimDuration)}</output>
              </label>
            </div>
            {validationError && <div className="trim-validation">{validationError}</div>}
            <footer>
              <button onClick={useFullClip}>Use Full Clip</button>
              <button onClick={() => setTrimAssetId(null)}>Cancel</button>
              <button className="primary" disabled={Boolean(validationError)} onClick={confirmTrimRange}>Add Trimmed Clip</button>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </aside>
  );
}

function toAsset(result: ProbeResult): MediaAsset {
  return {
    id: result.id,
    path: result.path,
    name: result.name,
    type: result.mediaType === "audio" ? "audio" : result.mediaType === "image" ? "image" : "video",
    duration: result.duration,
    width: result.width,
    height: result.height,
    fps: result.frameRate,
    sampleRate: result.sampleRate,
    channels: result.channels,
    thumbnailPath: result.thumbnailPath,
    waveformPeaks: result.waveform,
    importedAt: new Date().toISOString()
  };
}

function isSupportedBrowserFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extensions.includes(extension);
}

function browserMediaType(file: File): Exclude<MediaType, "unknown"> {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif"].includes(extension)) return "audio";
  if (["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(extension)) return "image";
  return "video";
}

async function browserFileToAsset(file: File): Promise<MediaAsset> {
  const type = browserMediaType(file);
  const url = URL.createObjectURL(file);
  const metadata = type === "image"
    ? await readImageMetadata(url)
    : type === "audio"
      ? await readAudioMetadata(file, url)
      : await readVideoMetadata(url);
  return {
    id: `web-${crypto.randomUUID()}`,
    path: url,
    name: file.name,
    type,
    duration: type === "image" ? undefined : metadata.duration,
    width: metadata.width,
    height: metadata.height,
    fps: type === "video" ? 30 : undefined,
    sampleRate: metadata.sampleRate,
    channels: metadata.channels,
    thumbnailPath: metadata.thumbnailPath,
    waveformPeaks: metadata.waveformPeaks,
    importedAt: new Date().toISOString()
  };
}

function readImageMetadata(url: string): Promise<Partial<MediaAsset>> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, thumbnailPath: url });
    image.onerror = () => reject(new Error("Could not read image metadata."));
    image.src = url;
  });
}

function readVideoMetadata(url: string): Promise<Partial<MediaAsset>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (thumbnailPath?: string) => {
      if (settled) return;
      settled = true;
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 5,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        thumbnailPath
      });
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(0.25, Math.max(0, video.duration / 8));
      } else {
        finish();
      }
    };
    video.onseeked = () => finish(captureVideoFrame(video));
    video.onerror = () => reject(new Error("Could not read video metadata."));
    window.setTimeout(() => finish(), 1800);
    video.src = url;
  });
}

async function readAudioMetadata(file: File, url: string): Promise<Partial<MediaAsset>> {
  const elementMetadata = await new Promise<Partial<MediaAsset>>((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve({ duration: Number.isFinite(audio.duration) ? audio.duration : 5 });
    audio.onerror = () => resolve({ duration: 5 });
    window.setTimeout(() => resolve({ duration: Number.isFinite(audio.duration) ? audio.duration : 5 }), 1600);
    audio.src = url;
  });
  try {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return { ...elementMetadata, waveformPeaks: [] };
    const context = new AudioContextCtor();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const peaks = waveformFromAudioBuffer(buffer);
    await context.close();
    return {
      ...elementMetadata,
      duration: buffer.duration || elementMetadata.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      waveformPeaks: peaks
    };
  } catch {
    return { ...elementMetadata, waveformPeaks: [] };
  }
}

function captureVideoFrame(video: HTMLVideoElement): string | undefined {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return undefined;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 360 / Math.max(width, height));
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function waveformFromAudioBuffer(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const bars = 64;
  const block = Math.max(1, Math.floor(data.length / bars));
  return Array.from({ length: bars }, (_, index) => {
    let sum = 0;
    const start = index * block;
    for (let cursor = 0; cursor < block && start + cursor < data.length; cursor += 1) {
      sum += Math.abs(data[start + cursor]);
    }
    return Math.min(1, Math.max(0.08, (sum / block) * 2.6));
  });
}

function MediaThumb({ asset, selected }: { asset: MediaAsset; selected: boolean }) {
  const imageSrc = asset.type === "image"
    ? mediaPathToSrc(asset.path)
    : asset.thumbnailPath
      ? mediaPathToSrc(asset.thumbnailPath)
      : undefined;
  return (
    <div className={`thumb thumb-${asset.type}`}>
      {asset.type === "audio" ? (
        <AudioThumb peaks={asset.waveformPeaks ?? []} />
      ) : imageSrc ? (
        <img src={imageSrc} alt="" />
      ) : (
        <span>{asset.type}</span>
      )}
      <em>{asset.type === "image" ? "Image" : formatTimecode(asset.duration ?? 0, asset.fps ?? 30, false)}</em>
      {selected && <i><Check size={13} /></i>}
    </div>
  );
}

function AudioThumb({ peaks }: { peaks: number[] }) {
  const bars = (peaks.length ? peaks : Array.from({ length: 48 }, (_, index) => 0.22 + Math.abs(Math.sin(index * 0.47)) * 0.68)).slice(0, 64);
  return (
    <div className="audio-thumb-waveform" aria-hidden="true">
      {bars.map((value, index) => (
        <span key={index} style={{ height: `${Math.max(12, Math.min(100, value * 100))}%` }} />
      ))}
    </div>
  );
}
