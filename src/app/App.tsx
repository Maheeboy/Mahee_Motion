/* global Blob, File, FileSystemDirectoryHandle, MediaRecorder, URL, navigator */
import type { CSSProperties, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { TopBar } from "../components/layout/TopBar";
import { Sidebar } from "../components/layout/Sidebar";
import { MediaPanel } from "../components/media/MediaPanel";
import { FeaturePanel } from "../components/media/FeaturePanel";
import { PreviewPanel } from "../components/preview/PreviewPanel";
import { InspectorPanel } from "../components/inspector/InspectorPanel";
import { TimelineToolbar } from "../components/toolbar/TimelineToolbar";
import { TimelinePanel } from "../components/timeline/TimelinePanel";
import { Toasts } from "../components/layout/Toasts";
import { ExportDialog } from "../components/modals/ExportDialog";
import { SettingsDialog } from "../components/settings/SettingsDialog";
import { useEditorStore } from "../store/editorStore";
import type { MediaAsset, MediaType } from "../types/editor";
import { sortRecoveryCandidates } from "../utils/persistence";
import { isLikelyMobileDevice, isTauriRuntime } from "../utils/runtime";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const TIMELINE_RESIZER_HEIGHT = 6;
const MIN_TIMELINE_HEIGHT = 190;
const MAX_TIMELINE_HEIGHT = 520;
const DEFAULT_PANEL_SIZES = { media: 572, inspector: 458, timeline: 254 };

interface AutosaveInfo {
  id: string;
  projectId: string;
  projectName: string;
  projectPath?: string;
  updatedAt: string;
  filePath: string;
}

interface ProbeResult {
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
}

interface RecordingCandidate {
  path: string;
  name: string;
  modifiedMs: number;
  size: number;
}

interface RecorderMonitor {
  outputDir: string;
  sinceMs: number;
  seen: string[];
}

const RECORDER_OUTPUT_DIR_KEY = "mahee-motion-recorder-output-dir";

function maxTimelineHeight() {
  if (typeof window === "undefined") return MAX_TIMELINE_HEIGHT;
  const compact = window.innerHeight <= 720;
  const topBarHeight = compact ? 48 : 54;
  const toolbarHeight = compact ? 40 : 44;
  const minWorkspaceHeight = compact ? 220 : 260;
  return Math.max(
    MIN_TIMELINE_HEIGHT,
    Math.min(MAX_TIMELINE_HEIGHT, window.innerHeight - topBarHeight - TIMELINE_RESIZER_HEIGHT - toolbarHeight - minWorkspaceHeight)
  );
}

export function App() {
  const isTauri = isTauriRuntime();
  const isMobileDevice = isLikelyMobileDevice();
  const [panelSizes, setPanelSizes] = useState(DEFAULT_PANEL_SIZES);
  const [recoveries, setRecoveries] = useState<AutosaveInfo[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recorderMonitor, setRecorderMonitor] = useState<RecorderMonitor>();
  const [recorderPrompt, setRecorderPrompt] = useState<RecordingCandidate>();
  const [recorderOpening, setRecorderOpening] = useState(false);
  const [webRecordingActive, setWebRecordingActive] = useState(false);
  const [webRecorderPrompt, setWebRecorderPrompt] = useState<{ file: File; savedName: string }>();
  const [recorderOutputDir, setRecorderOutputDir] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(RECORDER_OUTPUT_DIR_KEY) ?? "";
  });
  const browserRecorderRef = useRef<MediaRecorder | null>(null);
  const browserRecorderChunksRef = useRef<Blob[]>([]);
  const browserRecorderDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const project = useEditorStore((state) => state.project);
  const projectJson = useEditorStore((state) => state.projectJson);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const currentProjectPath = useEditorStore((state) => state.currentProjectPath);
  const loadProjectJson = useEditorStore((state) => state.loadProjectJson);
  const setCurrentProjectPath = useEditorStore((state) => state.setCurrentProjectPath);
  const markAutosaved = useEditorStore((state) => state.markAutosaved);
  const setExportProgress = useEditorStore((state) => state.setExportProgress);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const addToast = useEditorStore((state) => state.addToast);
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const copySelectedClipProperties = useEditorStore((state) => state.copySelectedClipProperties);
  const pasteClipProperties = useEditorStore((state) => state.pasteClipProperties);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setZoom = useEditorStore((state) => state.setZoom);
  const toggleTimelineSnapping = useEditorStore((state) => state.toggleTimelineSnapping);
  const stepPlayhead = useEditorStore((state) => state.stepPlayhead);
  const activePanel = useEditorStore((state) => state.activePanel);
  const addAsset = useEditorStore((state) => state.addAsset);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);

  useEffect(() => {
    if (!isTauri) return;
    void invoke<AutosaveInfo[]>("list_project_recoveries")
      .then((items) => setRecoveries(sortRecoveryCandidates(items).slice(0, 1)))
      .catch(() => undefined);
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri || saveStatus !== "Unsaved changes") return;
    const timeout = window.setTimeout(() => {
      void invoke<AutosaveInfo>("write_project_autosave", {
        json: projectJson(),
        projectId: project.id,
        projectPath: currentProjectPath,
        projectName: project.name
      })
        .then(() => markAutosaved())
        .catch(() => undefined);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [currentProjectPath, isTauri, markAutosaved, project, projectJson, saveStatus]);

  const recoverProject = async (recovery: AutosaveInfo) => {
    const json = await invoke<string>("load_project_autosave", { autosaveId: recovery.id });
    loadProjectJson(json);
    setCurrentProjectPath(recovery.projectPath);
    await invoke("clear_project_autosave", { autosaveId: recovery.id });
    setRecoveries((items) => items.filter((item) => item.id !== recovery.id));
    addToast("success", "Recovered autosaved project.");
  };

  const discardRecovery = async (recovery: AutosaveInfo) => {
    await invoke("clear_project_autosave", { autosaveId: recovery.id });
    setRecoveries((items) => items.filter((item) => item.id !== recovery.id));
    setRecoveryOpen(false);
  };

  const configureScreenRecorderPath = useCallback(async () => {
    if (!isTauri) {
      if (window.showDirectoryPicker) {
        try {
          const directory = await window.showDirectoryPicker({ mode: "readwrite" });
          browserRecorderDirectoryRef.current = directory;
          const label = `Browser folder: ${directory.name}`;
          window.localStorage.setItem(RECORDER_OUTPUT_DIR_KEY, label);
          setRecorderOutputDir(label);
          window.dispatchEvent(new window.CustomEvent("screen-recorder-path-updated", { detail: label }));
          addToast("success", "Screen recording folder configured for this browser session.");
        } catch (error) {
          if (!String(error).includes("AbortError")) addToast("error", String(error));
        }
        return;
      }
      const label = "Browser Downloads";
      window.localStorage.setItem(RECORDER_OUTPUT_DIR_KEY, label);
      setRecorderOutputDir(label);
      window.dispatchEvent(new window.CustomEvent("screen-recorder-path-updated", { detail: label }));
      addToast("info", "This browser will save recordings through Downloads.");
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose where Mahee Motion should save screen recordings"
      });
      if (!selected || Array.isArray(selected)) return;
      window.localStorage.setItem(RECORDER_OUTPUT_DIR_KEY, selected);
      setRecorderOutputDir(selected);
      window.dispatchEvent(new window.CustomEvent("screen-recorder-path-updated", { detail: selected }));
      addToast("success", "Screen recording folder updated.");
    } catch (error) {
      addToast("error", String(error));
    }
  }, [addToast, isTauri]);

  const openScreenRecorder = useCallback(async () => {
    if (!isTauri) {
      if (recorderOpening || webRecordingActive) return;
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
        addToast("error", "This browser does not support screen recording. Use Chrome, Edge, or the Windows app.");
        return;
      }
      if (!recorderOutputDir) {
        const label = window.showDirectoryPicker ? "Choose a browser recording folder first." : "Browser Downloads";
        if (window.showDirectoryPicker) {
          addToast("error", label);
          return;
        }
        window.localStorage.setItem(RECORDER_OUTPUT_DIR_KEY, label);
        setRecorderOutputDir(label);
        window.dispatchEvent(new window.CustomEvent("screen-recorder-path-updated", { detail: label }));
      }
      setRecorderOpening(true);
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true
        });
        const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
          .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        browserRecorderChunksRef.current = [];
        browserRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) browserRecorderChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(browserRecorderChunksRef.current, { type: mimeType || "video/webm" });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const file = new File([blob], `mahee-recording-${stamp}.webm`, { type: blob.type });
          void saveBrowserRecording(file, browserRecorderDirectoryRef.current)
            .then((savedName) => {
              setWebRecorderPrompt({ file, savedName });
              addToast("success", "Screen recording saved.");
            })
            .catch((error) => addToast("error", `Recording saved in memory, but browser save failed: ${String(error)}`))
            .finally(() => {
              setWebRecordingActive(false);
              browserRecorderRef.current = null;
              browserRecorderChunksRef.current = [];
            });
        };
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
        });
        recorder.start(250);
        setWebRecordingActive(true);
        addToast("success", "Screen recording started. Stop sharing or use the Stop Recording button when finished.");
      } catch (error) {
        if (!String(error).includes("AbortError")) addToast("error", String(error));
      } finally {
        setRecorderOpening(false);
      }
      return;
    }
    if (recorderOpening) return;
    const outputDir = recorderOutputDir || window.localStorage.getItem(RECORDER_OUTPUT_DIR_KEY) || "";
    if (!outputDir) {
      addToast("error", "Choose a recording folder before opening the recorder.");
      return;
    }
    setRecorderOpening(true);
    try {
      const sinceMs = Date.now();
      await invoke("launch_screen_recorder", { outputDir });
      setRecorderMonitor((current) => ({
        outputDir,
        sinceMs: current?.outputDir === outputDir ? Math.min(current.sinceMs, sinceMs) : sinceMs,
        seen: current?.outputDir === outputDir ? current.seen : []
      }));
      addToast("success", "Screen recorder opened.");
    } catch (error) {
      addToast("error", String(error));
    } finally {
      setRecorderOpening(false);
    }
  }, [addToast, isTauri, recorderOpening, recorderOutputDir, webRecordingActive]);

  const stopBrowserRecording = useCallback(() => {
    const recorder = browserRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stream.getTracks().forEach((track) => track.stop());
    recorder.stop();
  }, []);

  const importWebRecording = useCallback(async (file: File) => {
    try {
      const asset = await browserRecordingFileToAsset(file);
      addAsset(asset);
      addAssetToTimeline(asset.id);
      setWebRecorderPrompt(undefined);
      addToast("success", "Recording imported into the timeline.");
    } catch (error) {
      addToast("error", `Could not import recording: ${String(error)}`);
    }
  }, [addAsset, addAssetToTimeline, addToast]);

  const importRecording = useCallback(async (recording: RecordingCandidate) => {
    try {
      const result = await invoke<ProbeResult>("probe_media", { path: recording.path });
      if (result.mediaType === "unknown") throw new Error("Unsupported recording type");
      const asset = probeResultToAsset(result);
      addAsset(asset);
      addAssetToTimeline(asset.id);
      setRecorderPrompt(undefined);
      addToast("success", "Recording imported into the timeline.");
    } catch (error) {
      addToast("error", `Could not import recording: ${String(error)}`);
    }
  }, [addAsset, addAssetToTimeline, addToast]);

  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<{ progress: number; message: string }>("export-progress", (event) => {
      setExportProgress(event.payload);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [isTauri, setExportProgress]);

  useEffect(() => {
    const onOpenRecorder = () => {
      void openScreenRecorder();
    };
    const onConfigureRecorder = () => {
      void configureScreenRecorderPath();
    };
    window.addEventListener("open-screen-recorder", onOpenRecorder);
    window.addEventListener("configure-screen-recorder-path", onConfigureRecorder);
    return () => {
      window.removeEventListener("open-screen-recorder", onOpenRecorder);
      window.removeEventListener("configure-screen-recorder-path", onConfigureRecorder);
    };
  }, [configureScreenRecorderPath, openScreenRecorder]);

  useEffect(() => {
    if (!recorderMonitor || !isTauri) return;
    const interval = window.setInterval(() => {
      void invoke<RecordingCandidate[]>("recent_recordings", {
        outputDir: recorderMonitor.outputDir,
        sinceMs: recorderMonitor.sinceMs
      })
        .then((recordings) => {
          const next = recordings.find((recording) => !recorderMonitor.seen.includes(recording.path));
          if (!next) return;
          setRecorderMonitor((current) => current
            ? { ...current, seen: [...current.seen, next.path] }
            : current);
          setRecorderPrompt((current) => current ?? next);
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [isTauri, recorderMonitor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || Boolean(target.closest("[role='menu'], .settings-dialog"));
      if (editing) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying(!useEditorStore.getState().isPlaying);
      }
      if (event.ctrlKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey && event.key.toLowerCase() === "y") || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        redo();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelectedClipProperties();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteClipProperties();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.dispatchEvent(new Event("save-project"));
      }
      if (event.ctrlKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        window.dispatchEvent(new Event("open-project"));
      }
      if (event.ctrlKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        window.dispatchEvent(new Event("open-export-dialog"));
      }
      if (event.key.toLowerCase() === "s" && !event.ctrlKey) splitSelected();
      if ((event.key === "Delete" || event.key === "Backspace") && !(document.activeElement as HTMLElement | null)?.closest(".timeline-keyframe")) {
        deleteSelected();
      }
      if (event.key === "+" || event.key === "=") setZoom(useEditorStore.getState().project.timeline.zoom + 1);
      if (event.key === "-" || event.key === "_") setZoom(useEditorStore.getState().project.timeline.zoom - 1);
      if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        toggleTimelineSnapping();
      }
      if (event.key === "ArrowLeft") stepPlayhead(event.shiftKey ? -10 : -1);
      if (event.key === "ArrowRight") stepPlayhead(event.shiftKey ? 10 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelectedClipProperties, deleteSelected, duplicateSelected, pasteClipProperties, redo, setPlaying, setZoom, splitSelected, stepPlayhead, toggleTimelineSnapping, undo]);

  useEffect(() => {
    const onResize = () => {
      setPanelSizes((sizes) => ({ ...sizes, timeline: clamp(sizes.timeline, MIN_TIMELINE_HEIGHT, maxTimelineHeight()) }));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const beginResize = (event: PointerEvent<HTMLDivElement>, target: "media" | "inspector" | "timeline") => {
    const startX = event.clientX;
    const startY = event.clientY;
    const start = panelSizes[target];
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (target === "media") {
        setPanelSizes((sizes) => ({ ...sizes, media: clamp(start + moveEvent.clientX - startX, 300, 620) }));
      } else if (target === "inspector") {
        setPanelSizes((sizes) => ({ ...sizes, inspector: clamp(start - (moveEvent.clientX - startX), 280, 520) }));
      } else {
        setPanelSizes((sizes) => ({ ...sizes, timeline: clamp(start - (moveEvent.clientY - startY), MIN_TIMELINE_HEIGHT, maxTimelineHeight()) }));
      }
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (isMobileDevice) return <MobileUnsupported />;

  return (
    <div
      className="app-shell"
      style={{
        "--media-width": `${panelSizes.media}px`,
        "--inspector-width": `${panelSizes.inspector}px`,
        "--timeline-height": `${panelSizes.timeline}px`
      } as CSSProperties}
    >
      <TopBar recoveryCount={recoveries.length} onOpenRecoveries={() => setRecoveryOpen((open) => !open)} />
      <main className="workspace">
        <Sidebar />
        {activePanel === "Media" ? <MediaPanel /> : <FeaturePanel />}
        <div className="panel-resizer panel-resizer-x" title="Resize media and preview panels" onPointerDown={(event) => beginResize(event, "media")} />
        <section className="center-column">
          <PreviewPanel />
        </section>
        <div className="panel-resizer panel-resizer-x" title="Resize preview and inspector panels" onPointerDown={(event) => beginResize(event, "inspector")} />
        <InspectorPanel />
      </main>
      <div className="panel-resizer panel-resizer-y" title="Resize timeline" onPointerDown={(event) => beginResize(event, "timeline")} />
      <TimelineToolbar />
      <TimelinePanel />
      <Toasts />
      <ExportDialog />
      <SettingsDialog />
      {recoveryOpen && recoveries.length > 0 && (
        <div className="modal-backdrop">
          <section className="recovery-dialog">
            <header>
              <span>Autosave Recovery</span>
              <strong>Recover unsaved work?</strong>
            </header>
            <div className="recovery-list">
              {recoveries.map((recovery) => (
                <article className="recovery-card" key={recovery.id}>
                  <div>
                    <strong>{recovery.projectName}</strong>
                    <span>{recovery.projectPath ?? "Unsaved project"}</span>
                  </div>
                  <button className="secondary" onClick={() => void discardRecovery(recovery)}>Discard</button>
                  <button className="primary" onClick={() => void recoverProject(recovery)}>Recover</button>
                </article>
              ))}
            </div>
            <button className="ghost-button" onClick={() => setRecoveryOpen(false)}>Close</button>
          </section>
        </div>
      )}
      {recorderPrompt && (
        <div className="modal-backdrop">
          <section className="recovery-dialog recorder-import-dialog">
            <header>
              <span>Screen Recording</span>
              <strong>Import this recording?</strong>
            </header>
            <p>{recorderPrompt.name} was saved to your recording folder. Add it to Mahee Motion now?</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setRecorderPrompt(undefined)}>Keep Saved Only</button>
              <button className="primary" onClick={() => void importRecording(recorderPrompt)}>Import to Timeline</button>
            </div>
          </section>
        </div>
      )}
      {webRecordingActive && (
        <div className="modal-backdrop recorder-active-backdrop">
          <section className="recovery-dialog recorder-import-dialog">
            <header>
              <span>Screen Recording</span>
              <strong>Recording in progress</strong>
            </header>
            <p>Keep this tab open. Stop sharing from the browser, or use the button below to finish and save the recording.</p>
            <div className="modal-actions">
              <button className="primary" onClick={stopBrowserRecording}>Stop Recording</button>
            </div>
          </section>
        </div>
      )}
      {webRecorderPrompt && (
        <div className="modal-backdrop">
          <section className="recovery-dialog recorder-import-dialog">
            <header>
              <span>Screen Recording</span>
              <strong>Import this recording?</strong>
            </header>
            <p>{webRecorderPrompt.savedName} was saved by your browser. Add it to Mahee Motion now?</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setWebRecorderPrompt(undefined)}>Keep Saved Only</button>
              <button className="primary" onClick={() => void importWebRecording(webRecorderPrompt.file)}>Import to Timeline</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MobileUnsupported() {
  return (
    <main className="mobile-blocker">
      <section>
        <span>Mahee Motion</span>
        <h1>PC or laptop required</h1>
        <p>
          This editor needs a desktop-size timeline, precise pointer controls, local media access,
          and browser APIs that are unreliable on phones.
        </p>
        <p>
          Please open this URL on a Windows PC, laptop, Mac, or Chromebook. Your clips, recorder controls,
          export options, and timeline editing tools will behave properly there.
        </p>
      </section>
    </main>
  );
}

function probeResultToAsset(result: ProbeResult): MediaAsset {
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

async function saveBrowserRecording(file: File, directory: FileSystemDirectoryHandle | null): Promise<string> {
  if (directory) {
    const handle = await directory.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return `${directory.name}/${file.name}`;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return `Downloads/${file.name}`;
}

function browserRecordingFileToAsset(file: File): Promise<MediaAsset> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({
        id: `web-recording-${crypto.randomUUID()}`,
        path: url,
        name: file.name,
        type: "video",
        duration: Number.isFinite(video.duration) ? video.duration : 5,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        fps: 30,
        importedAt: new Date().toISOString(),
        thumbnailPath: captureBrowserVideoFrame(video),
        waveformPeaks: []
      });
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.25, video.duration / 10);
      else finish();
    };
    video.onseeked = finish;
    video.onerror = () => reject(new Error("Could not read recording metadata."));
    window.setTimeout(finish, 1800);
    video.src = url;
  });
}

function captureBrowserVideoFrame(video: HTMLVideoElement): string | undefined {
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
