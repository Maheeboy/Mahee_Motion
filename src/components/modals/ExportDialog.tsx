/* global FileSystemFileHandle */
import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Download, X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { buildAudioExportPlan, buildExportPlan } from "../../utils/timeline";
import { formatTimecode } from "../../utils/time";
import type { AspectRatioPreset, ExportSettings } from "../../types/editor";
import { isTauriRuntime } from "../../utils/runtime";
import { exportAudioInBrowser, exportVideoInBrowser } from "../../utils/browserExport";

const aspectPresets: Array<{ value: AspectRatioPreset; label: string; shape: "wide" | "classic" | "cinema" | "portrait" | "square" }> = [
  { value: "16:9", label: "16:9", shape: "wide" },
  { value: "4:3", label: "4:3", shape: "classic" },
  { value: "2.35:1", label: "2.35", shape: "cinema" },
  { value: "2:1", label: "2:1", shape: "cinema" },
  { value: "1.85:1", label: "1.85", shape: "wide" },
  { value: "9:16", label: "9:16", shape: "portrait" },
  { value: "3:4", label: "3:4", shape: "portrait" },
  { value: "5.8-inch", label: "5.8", shape: "portrait" },
  { value: "1:1", label: "1:1", shape: "square" }
];

export function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [browserFileHandle, setBrowserFileHandle] = useState<FileSystemFileHandle>();
  const isTauri = isTauriRuntime();
  const project = useEditorStore((state) => state.project);
  const updateExportSettings = useEditorStore((state) => state.updateExportSettings);
  const applyExportAspectPreset = useEditorStore((state) => state.applyExportAspectPreset);
  const applyExportResolutionPreset = useEditorStore((state) => state.applyExportResolutionPreset);
  const exportProgress = useEditorStore((state) => state.exportProgress);
  const setExportProgress = useEditorStore((state) => state.setExportProgress);
  const addToast = useEditorStore((state) => state.addToast);

  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener("open-export-dialog", listener);
    return () => window.removeEventListener("open-export-dialog", listener);
  }, []);

  const exportPlan = useMemo(() => buildExportPlan(project), [project]);
  const audioExportPlan = useMemo(() => buildAudioExportPlan(project), [project]);

  const choosePath = async () => {
    const fileName = (project.name.trim() || "Unknown").replace(/\s+/g, "-").toLowerCase();
    if (!isTauri) {
      const suggestedName = `${fileName}.${mode === "audio" ? "wav" : "mp4"}`;
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName,
            types: mode === "audio"
              ? [{ description: "WAV Audio", accept: { "audio/wav": [".wav"] } }]
              : [{ description: "MP4 Video", accept: { "video/mp4": [".mp4"] } }]
          });
          setBrowserFileHandle(handle);
          updateExportSettings({ outputPath: `Browser save target: ${handle.name}` });
          addToast("success", "Browser save target selected.");
        } catch (error) {
          if (String(error).includes("AbortError")) return;
          addToast("error", String(error));
        }
      } else {
        setBrowserFileHandle(undefined);
        updateExportSettings({ outputPath: `Browser Downloads/${suggestedName}` });
        addToast("info", "Your browser will download exports to its Downloads folder.");
      }
      return;
    }
    const path = await save({
      defaultPath: `${fileName}.${mode === "audio" ? "m4a" : "mp4"}`,
      filters: mode === "audio"
        ? [{ name: "AAC Audio", extensions: ["m4a"] }]
        : [{ name: "MP4 Video", extensions: ["mp4"] }]
    });
    if (path) updateExportSettings({ outputPath: path });
  };

  const startExport = async () => {
    if (!project.exportSettings.outputPath) {
      await choosePath();
      return;
    }
    if (!isTauri) {
      if (mode === "audio" && audioExportPlan.clips.length === 0) {
        addToast("error", "Add at least one audible audio or video clip to the timeline before exporting audio.");
        return;
      }
      if (mode === "video" && exportPlan.clips.length === 0) {
        addToast("error", "Add at least one video or image clip to the timeline before exporting.");
        return;
      }
      setExportProgress({ progress: 0, message: mode === "audio" ? "Preparing browser audio export" : "Preparing browser video export" });
      try {
        const baseName = `${(project.name.trim() || "Unknown").replace(/[\\/:*?"<>|]+/g, "-")}.${mode === "audio" ? "wav" : "mp4"}`;
        const output = mode === "audio"
          ? await exportAudioInBrowser({
              project,
              visualClips: exportPlan.clips,
              audioClips: audioExportPlan.clips,
              fileHandle: browserFileHandle,
              filename: baseName,
              onProgress: (progress, message) => setExportProgress({ progress, message })
            })
          : await exportVideoInBrowser({
              project,
              visualClips: exportPlan.clips,
              audioClips: audioExportPlan.clips,
              fileHandle: browserFileHandle,
              filename: baseName,
              onProgress: (progress, message) => setExportProgress({ progress, message })
            });
        addToast("success", `Exported ${output}`);
      } catch (error) {
        addToast("error", String(error));
      }
      return;
    }
    if (mode === "audio" && audioExportPlan.clips.length === 0) {
      addToast("error", "Add at least one audible audio or video clip to the timeline before exporting audio.");
      return;
    }
    if (mode === "video" && exportPlan.clips.length === 0) {
      addToast("error", "Add at least one video clip to the timeline before exporting.");
      return;
    }
    setExportProgress({ progress: 0, message: "Starting export" });
    try {
      const output = mode === "audio"
        ? await invoke<string>("export_audio_only", {
            request: {
              outputPath: project.exportSettings.outputPath.replace(/\.mp4$/i, ".m4a"),
              audioBitrate: project.exportSettings.audioBitrate,
              sampleRate: project.timeline.sampleRate,
              clips: audioExportPlan.clips
            }
          })
        : await invoke<string>("export_timeline", {
            request: {
              outputPath: project.exportSettings.outputPath,
              resolution: project.exportSettings.resolution,
              width: project.timeline.width,
              height: project.timeline.height,
              frameRate: project.exportSettings.frameRate,
              videoBitrate: project.exportSettings.videoBitrate,
              audioBitrate: project.exportSettings.audioBitrate,
              clips: exportPlan.clips
            }
          });
      addToast("success", `Exported ${output}`);
    } catch (error) {
      addToast("error", String(error));
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="export-dialog">
        <header>
          <div>
            <span>Mahee Motion</span>
            <h2>{mode === "audio" ? "Export Audio" : "Export Video"}</h2>
          </div>
          <button onClick={() => setOpen(false)}><X size={18} /></button>
        </header>
        <label className="export-path-card">
          <span>{isTauri ? "File path" : "Browser save target"}</span>
          <div className="path-row">
            <input
              readOnly={!isTauri}
              value={project.exportSettings.outputPath}
              onChange={(event) => updateExportSettings({ outputPath: event.target.value })}
              placeholder={mode === "audio" ? "Choose an .m4a output path" : "Choose an .mp4 output path"}
            />
            <button onClick={choosePath}>Browse</button>
          </div>
        </label>
        <div className="export-mode-row">
          <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}>Video MP4</button>
          <button className={mode === "audio" ? "active" : ""} onClick={() => setMode("audio")}>Export Audio Only</button>
        </div>
        <div className="export-grid">
          <label className={`export-field ${mode === "audio" ? "disabled" : ""}`}>
            <span>Resolution</span>
            <select disabled={mode === "audio"} value={project.exportSettings.resolution} onChange={(event) => applyExportResolutionPreset(event.target.value as "720p" | "1080p")}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="4K" disabled>4K - Coming soon</option>
            </select>
          </label>
          <label className="export-field">
            <span>Frame rate</span>
            <select value={project.exportSettings.frameRate} onChange={(event) => updateExportSettings({ frameRate: Number(event.target.value) as ExportSettings["frameRate"] })}>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label className={`export-field ${mode === "audio" ? "disabled" : ""}`}>
            <span>Video bitrate</span>
            <input disabled={mode === "audio"} value={project.exportSettings.videoBitrate} onChange={(event) => updateExportSettings({ videoBitrate: event.target.value })} />
          </label>
          <label className="export-field">
            <span>Audio bitrate</span>
            <input value={project.exportSettings.audioBitrate} onChange={(event) => updateExportSettings({ audioBitrate: event.target.value })} />
          </label>
        </div>
        <div className={`preset-row aspect-preset-row ${mode === "audio" ? "disabled" : ""}`}>
          <span>Aspect</span>
          <div className="preset-chip-grid">
          {aspectPresets.map((preset) => (
            <button disabled={mode === "audio"} className={project.exportSettings.aspectRatio === preset.value ? "active" : ""} key={preset.value} onClick={() => applyExportAspectPreset(preset.value)}>
              <i className={`aspect-icon ${preset.shape}`} aria-hidden="true" />
              {preset.label}
            </button>
          ))}
          </div>
        </div>
        <div className={`preset-row ${mode === "audio" ? "disabled" : ""}`}>
          <span>Size</span>
          <div className="preset-chip-grid size">
          {(["720p", "1080p"] as const).map((preset) => (
            <button disabled={mode === "audio"} className={project.exportSettings.resolution === preset ? "active" : ""} key={preset} onClick={() => applyExportResolutionPreset(preset)}>
              {preset}
            </button>
          ))}
          </div>
        </div>
        <div className="export-note">
          {!isTauri
            ? mode === "audio"
              ? "Online audio export mixes audible timeline sources in the browser and saves a WAV file."
              : "Online video export renders visible timeline media in the browser and saves standard MP4 when your browser supports it."
            : mode === "audio"
            ? "Audio-only export mixes all audible timeline audio and unmuted video audio into an AAC .m4a file."
            : "Sequential visible video clips export to H.264 MP4. Unsupported timeline items are listed below before export."}
        </div>
        {(mode === "audio" ? audioExportPlan.warnings : exportPlan.warnings).length > 0 && (
          <div className="export-warnings">
            {(mode === "audio" ? audioExportPlan.warnings : exportPlan.warnings).map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        {exportProgress && (
          <div className="export-progress">
            <span>{exportProgress.message}</span>
            <progress value={exportProgress.progress} max={1} />
          </div>
        )}
        <footer>
          <span>{mode === "audio" ? `${audioExportPlan.clips.length} audio source${audioExportPlan.clips.length === 1 ? "" : "s"} ready` : `${exportPlan.clips.length} video clip${exportPlan.clips.length === 1 ? "" : "s"} ready`} - {formatTimecode(mode === "audio" ? audioExportPlan.duration : exportPlan.duration, project.timeline.fps)}</span>
          <button className="primary" onClick={startExport}><Download size={16} /> {mode === "audio" ? "Export Audio" : "Export MP4"}</button>
        </footer>
      </section>
    </div>
  );
}

