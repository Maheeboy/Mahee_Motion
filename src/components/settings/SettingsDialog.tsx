/* global Blob, File, URL */
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen, RotateCcw, Search, Settings2, Upload, X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { MaheeSettings, SettingsSectionId, ShortcutBinding } from "../../types/settings";
import { accentColorPresets, shortcutConflicts } from "../../utils/appSettings";

const sections: Array<{ id: SettingsSectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "workspace", label: "Workspace" },
  { id: "timeline", label: "Timeline" },
  { id: "playback", label: "Playback" },
  { id: "performance", label: "Performance" },
  { id: "projectDefaults", label: "Project Defaults" },
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
  { id: "audio", label: "Audio" },
  { id: "keyboardShortcuts", label: "Keyboard Shortcuts" },
  { id: "filesCache", label: "Files and Cache" }
];

export function SettingsDialog() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addToast = useEditorStore((state) => state.addToast);
  const isOpen = useSettingsStore((state) => state.isOpen);
  const close = useSettingsStore((state) => state.close);
  const activeSection = useSettingsStore((state) => state.activeSection);
  const setActiveSection = useSettingsStore((state) => state.setActiveSection);
  const settings = useSettingsStore((state) => state.settings);
  const search = useSettingsStore((state) => state.search);
  const setSearch = useSettingsStore((state) => state.setSearch);
  const resetSection = useSettingsStore((state) => state.resetSection);
  const resetAll = useSettingsStore((state) => state.resetAll);
  const updateSection = useSettingsStore((state) => state.updateSection);
  const saveCurrentWorkspace = useSettingsStore((state) => state.saveCurrentWorkspace);
  const resetWorkspace = useSettingsStore((state) => state.resetWorkspace);
  const recordingShortcutId = useSettingsStore((state) => state.recordingShortcutId);
  const startShortcutRecording = useSettingsStore((state) => state.startShortcutRecording);
  const recordShortcut = useSettingsStore((state) => state.recordShortcut);
  const resetShortcut = useSettingsStore((state) => state.resetShortcut);
  const resetShortcuts = useSettingsStore((state) => state.resetShortcuts);
  const importShortcutProfile = useSettingsStore((state) => state.importShortcutProfile);

  const conflicts = useMemo(() => shortcutConflicts(settings.keyboardShortcuts.shortcuts), [settings.keyboardShortcuts.shortcuts]);
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((item) => item.ids)), [conflicts]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!recordingShortcutId) return;
      event.stopPropagation();
      recordShortcut(event);
      addToast("success", "Shortcut updated.");
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [addToast, recordShortcut, recordingShortcutId]);

  if (!isOpen) return null;

  const chooseFolder = async (section: SettingsSectionId, key: string) => {
    if (!("__TAURI_INTERNALS__" in window)) {
      addToast("error", "Folder selection is available in the desktop app.");
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    updateSection(section, { [key]: selected } as Partial<MaheeSettings[typeof section]>);
    addToast("success", "Folder updated.");
  };

  const renderSection = () => {
    switch (activeSection) {
      case "general":
        return (
          <SettingsGrid>
            <PathRow label="Default project location" value={settings.general.defaultProjectLocation} onBrowse={() => void chooseFolder("general", "defaultProjectLocation")} />
            <Toggle label="Autosave" checked={settings.general.autosaveEnabled} onChange={(value) => updateSection("general", { autosaveEnabled: value })} />
            <Range label="Autosave interval" value={settings.general.autosaveIntervalSeconds} min={15} max={1800} step={15} suffix="s" onChange={(value) => updateSection("general", { autosaveIntervalSeconds: value })} />
            <Toggle label="Restore last project" checked={settings.general.restoreLastProject} onChange={(value) => updateSection("general", { restoreLastProject: value })} />
            <Toggle label="Confirm before deleting" checked={settings.general.confirmBeforeDeleting} onChange={(value) => updateSection("general", { confirmBeforeDeleting: value })} />
            <Toggle label="Confirm before closing unsaved projects" checked={settings.general.confirmBeforeClosingUnsaved} onChange={(value) => updateSection("general", { confirmBeforeClosingUnsaved: value })} />
            <Range label="Recent project count" value={settings.general.recentProjectCount} min={1} max={50} step={1} onChange={(value) => updateSection("general", { recentProjectCount: value })} />
          </SettingsGrid>
        );
      case "appearance":
        return (
          <SettingsGrid>
            <Select label="Theme" value={settings.appearance.theme} options={["dark", "light", "system"]} onChange={(value) => updateSection("appearance", { theme: value as MaheeSettings["appearance"]["theme"] })} />
            <div className="settings-row wide">
              <span>Accent color</span>
              <div className="settings-swatches">
                {accentColorPresets.map((color) => (
                  <button className={settings.appearance.accentColor === color && !settings.appearance.useCustomAccent ? "active" : ""} key={color} style={{ background: color }} onClick={() => updateSection("appearance", { accentColor: color, useCustomAccent: false })} />
                ))}
                <input type="color" value={settings.appearance.customAccentColor} onChange={(event) => updateSection("appearance", { customAccentColor: event.target.value, useCustomAccent: true })} />
              </div>
            </div>
            <Select label="UI density" value={settings.appearance.density} options={["compact", "comfortable", "spacious"]} onChange={(value) => updateSection("appearance", { density: value as MaheeSettings["appearance"]["density"] })} />
            <Range label="UI font size" value={settings.appearance.fontSize} min={11} max={20} step={1} suffix="px" onChange={(value) => updateSection("appearance", { fontSize: value })} />
            <Toggle label="Reduce animations" checked={settings.appearance.reduceAnimations} onChange={(value) => updateSection("appearance", { reduceAnimations: value })} />
            <Toggle label="Show sidebar labels" checked={settings.appearance.showSidebarLabels} onChange={(value) => updateSection("appearance", { showSidebarLabels: value })} />
            <Toggle label="Show tooltips" checked={settings.appearance.showTooltips} onChange={(value) => updateSection("appearance", { showTooltips: value })} />
            <Range label="Timeline clip corner radius" value={settings.appearance.timelineClipCornerRadius} min={0} max={12} step={1} suffix="px" onChange={(value) => updateSection("appearance", { timelineClipCornerRadius: value })} />
          </SettingsGrid>
        );
      case "workspace":
        return (
          <SettingsGrid>
            <Toggle label="Remember panel sizes" checked={settings.workspace.rememberPanelSizes} onChange={(value) => updateSection("workspace", { rememberPanelSizes: value })} />
            <Toggle label="Remember collapsed sections" checked={settings.workspace.rememberCollapsedSections} onChange={(value) => updateSection("workspace", { rememberCollapsedSections: value })} />
            <Select label="Workspace preset" value={settings.workspace.preset} options={["editing", "color", "audio", "text", "compact"]} onChange={(value) => updateSection("workspace", { preset: value as MaheeSettings["workspace"]["preset"] })} />
            <Toggle label="Show Media panel" checked={settings.workspace.mediaPanelVisible} onChange={(value) => updateSection("workspace", { mediaPanelVisible: value })} />
            <Toggle label="Show Inspector" checked={settings.workspace.inspectorVisible} onChange={(value) => updateSection("workspace", { inspectorVisible: value })} />
            <Toggle label="Show Timeline toolbar" checked={settings.workspace.timelineToolbarVisible} onChange={(value) => updateSection("workspace", { timelineToolbarVisible: value })} />
            <Toggle label="Show Audio meters" checked={settings.workspace.audioMetersVisible} onChange={(value) => updateSection("workspace", { audioMetersVisible: value })} />
            <ActionRow label="Workspace actions" actions={[["Save current workspace", () => { saveCurrentWorkspace(); addToast("success", "Workspace saved."); }], ["Reset workspace", () => { resetWorkspace(); addToast("success", "Workspace reset."); }]]} />
          </SettingsGrid>
        );
      case "timeline":
        return (
          <SettingsGrid>
            <Toggle label="Magnetic snapping" checked={settings.timeline.magneticSnapping} onChange={(value) => updateSection("timeline", { magneticSnapping: value })} />
            <Range label="Snap strength" value={settings.timeline.snapStrength} min={0} max={100} step={1} onChange={(value) => updateSection("timeline", { snapStrength: value })} />
            <Toggle label="Snap to clip edges" checked={settings.timeline.snapToClipEdges} onChange={(value) => updateSection("timeline", { snapToClipEdges: value })} />
            <Toggle label="Snap to playhead" checked={settings.timeline.snapToPlayhead} onChange={(value) => updateSection("timeline", { snapToPlayhead: value })} />
            <Toggle label="Snap to markers" checked={settings.timeline.snapToMarkers} onChange={(value) => updateSection("timeline", { snapToMarkers: value })} />
            <Toggle label="Snap to timeline start" checked={settings.timeline.snapToTimelineStart} onChange={(value) => updateSection("timeline", { snapToTimelineStart: value })} />
            <Range label="Default zoom" value={settings.timeline.defaultZoom} min={2} max={40} step={1} onChange={(value) => updateSection("timeline", { defaultZoom: value })} />
            <Toggle label="Smooth scrolling" checked={settings.timeline.smoothScrolling} onChange={(value) => updateSection("timeline", { smoothScrolling: value })} />
            <Toggle label="Auto-scroll while dragging" checked={settings.timeline.autoScrollWhileDragging} onChange={(value) => updateSection("timeline", { autoScrollWhileDragging: value })} />
            <Toggle label="Show clip thumbnails" checked={settings.timeline.showClipThumbnails} onChange={(value) => updateSection("timeline", { showClipThumbnails: value })} />
            <Toggle label="Show audio waveforms" checked={settings.timeline.showAudioWaveforms} onChange={(value) => updateSection("timeline", { showAudioWaveforms: value })} />
            <Toggle label="Show clip names" checked={settings.timeline.showClipNames} onChange={(value) => updateSection("timeline", { showClipNames: value })} />
            <Toggle label="Show duration labels" checked={settings.timeline.showDurationLabels} onChange={(value) => updateSection("timeline", { showDurationLabels: value })} />
            <Range label="Default track height" value={settings.timeline.defaultTrackHeight} min={44} max={120} step={2} suffix="px" onChange={(value) => updateSection("timeline", { defaultTrackHeight: value })} />
            <Toggle label="Prevent same-track overlap" checked={settings.timeline.preventSameTrackOverlap} onChange={(value) => updateSection("timeline", { preventSameTrackOverlap: value })} />
            <Toggle label="Ripple editing default" checked={settings.timeline.rippleEditingDefault} onChange={(value) => updateSection("timeline", { rippleEditingDefault: value })} />
            <Select label="Playhead follow" value={settings.timeline.playheadFollow} options={["off", "follow", "center"]} onChange={(value) => updateSection("timeline", { playheadFollow: value as MaheeSettings["timeline"]["playheadFollow"] })} />
            <Range label="Default imported video track" value={settings.timeline.defaultVideoTrack} min={1} max={24} step={1} onChange={(value) => updateSection("timeline", { defaultVideoTrack: value })} />
            <Range label="Default imported audio track" value={settings.timeline.defaultAudioTrack} min={1} max={24} step={1} onChange={(value) => updateSection("timeline", { defaultAudioTrack: value })} />
          </SettingsGrid>
        );
      case "playback":
        return (
          <SettingsGrid>
            <Select label="Preview quality" value={settings.playback.previewQuality} options={["auto", "full", "half", "quarter"]} onChange={(value) => updateSection("playback", { previewQuality: value as MaheeSettings["playback"]["previewQuality"] })} />
            <Toggle label="Drop frames for smoother playback" checked={settings.playback.dropFrames} onChange={(value) => updateSection("playback", { dropFrames: value })} />
            <Toggle label="Loop playback default" checked={settings.playback.loopPlaybackDefault} onChange={(value) => updateSection("playback", { loopPlaybackDefault: value })} />
            <Toggle label="Hardware decoding" checked={settings.playback.hardwareDecoding} onChange={(value) => updateSection("playback", { hardwareDecoding: value })} note="Requires restart" />
            <Toggle label="Cache preview frames" checked={settings.playback.cachePreviewFrames} onChange={(value) => updateSection("playback", { cachePreviewFrames: value })} />
            <Toggle label="Show safe zones" checked={settings.playback.showSafeZones} onChange={(value) => updateSection("playback", { showSafeZones: value })} />
            <Toggle label="Show center guides" checked={settings.playback.showCenterGuides} onChange={(value) => updateSection("playback", { showCenterGuides: value })} />
            <Toggle label="Show transform handles" checked={settings.playback.showTransformHandles} onChange={(value) => updateSection("playback", { showTransformHandles: value })} />
            <ActionRow label="Preview cache" actions={[["Clear preview cache", () => undefined, "Preview cache indexing is not exposed by the native cache service yet."]]} />
          </SettingsGrid>
        );
      case "performance":
        return (
          <SettingsGrid>
            <Select label="Mode" value={settings.performance.mode} options={["auto", "balanced", "performance", "quality"]} onChange={(value) => updateSection("performance", { mode: value as MaheeSettings["performance"]["mode"] })} />
            <Toggle label="GPU acceleration" checked={settings.performance.gpuAcceleration} onChange={(value) => updateSection("performance", { gpuAcceleration: value })} note="Requires restart" />
            <Text label="Preferred GPU" value={settings.performance.preferredGpu} onChange={(value) => updateSection("performance", { preferredGpu: value })} note="Auto until GPU detection is available" />
            <Toggle label="Hardware decoding" checked={settings.performance.hardwareDecoding} onChange={(value) => updateSection("performance", { hardwareDecoding: value })} note="Requires restart" />
            <Toggle label="Hardware encoding" checked={settings.performance.hardwareEncoding} onChange={(value) => updateSection("performance", { hardwareEncoding: value })} note="Requires restart" />
            <Range label="Maximum RAM usage" value={settings.performance.maxRamGb} min={2} max={128} step={1} suffix="GB" onChange={(value) => updateSection("performance", { maxRamGb: value })} />
            <Range label="Maximum cache size" value={settings.performance.maxCacheGb} min={1} max={1024} step={1} suffix="GB" onChange={(value) => updateSection("performance", { maxCacheGb: value })} />
            <Range label="Background task limit" value={settings.performance.backgroundTaskLimit} min={1} max={8} step={1} onChange={(value) => updateSection("performance", { backgroundTaskLimit: value })} />
            <Toggle label="Automatic proxies" checked={settings.performance.automaticProxies} onChange={(value) => updateSection("performance", { automaticProxies: value })} />
            <Select label="Proxy resolution" value={settings.performance.proxyResolution} options={["360p", "540p", "720p"]} onChange={(value) => updateSection("performance", { proxyResolution: value as MaheeSettings["performance"]["proxyResolution"] })} />
            <Toggle label="Pause background tasks during playback" checked={settings.performance.pauseBackgroundTasksDuringPlayback} onChange={(value) => updateSection("performance", { pauseBackgroundTasksDuringPlayback: value })} />
          </SettingsGrid>
        );
      case "projectDefaults":
        return (
          <SettingsGrid>
            <NumberPair label="Resolution" first={settings.projectDefaults.width} second={settings.projectDefaults.height} onFirst={(value) => updateSection("projectDefaults", { width: value })} onSecond={(value) => updateSection("projectDefaults", { height: value })} />
            <Range label="Frame rate" value={settings.projectDefaults.frameRate} min={12} max={120} step={1} suffix="fps" onChange={(value) => updateSection("projectDefaults", { frameRate: value })} />
            <Range label="Sample rate" value={settings.projectDefaults.sampleRate} min={32000} max={96000} step={1000} suffix="Hz" onChange={(value) => updateSection("projectDefaults", { sampleRate: value })} />
            <Color label="Background color" value={settings.projectDefaults.backgroundColor} onChange={(value) => updateSection("projectDefaults", { backgroundColor: value })} />
            <Range label="Default video track count" value={settings.projectDefaults.defaultVideoTrackCount} min={1} max={24} step={1} onChange={(value) => updateSection("projectDefaults", { defaultVideoTrackCount: value })} />
            <Range label="Default audio track count" value={settings.projectDefaults.defaultAudioTrackCount} min={1} max={24} step={1} onChange={(value) => updateSection("projectDefaults", { defaultAudioTrackCount: value })} />
            <Range label="Default image duration" value={settings.projectDefaults.defaultImageDuration} min={1} max={120} step={1} suffix="s" onChange={(value) => updateSection("projectDefaults", { defaultImageDuration: value })} />
            <Range label="Default text duration" value={settings.projectDefaults.defaultTextDuration} min={1} max={120} step={1} suffix="s" onChange={(value) => updateSection("projectDefaults", { defaultTextDuration: value })} />
            <Range label="Default transition duration" value={settings.projectDefaults.defaultTransitionDuration} min={0} max={10} step={0.1} suffix="s" onChange={(value) => updateSection("projectDefaults", { defaultTransitionDuration: value })} />
            <Text label="Default text font" value={settings.projectDefaults.defaultTextFont} onChange={(value) => updateSection("projectDefaults", { defaultTextFont: value })} />
            <Text label="Default text style" value={settings.projectDefaults.defaultTextStyle} onChange={(value) => updateSection("projectDefaults", { defaultTextStyle: value })} />
          </SettingsGrid>
        );
      case "import":
        return (
          <SettingsGrid>
            <Toggle label="Auto-add media to timeline" checked={settings.import.autoAddMediaToTimeline} onChange={(value) => updateSection("import", { autoAddMediaToTimeline: value })} />
            <Toggle label="Generate thumbnails" checked={settings.import.generateThumbnails} onChange={(value) => updateSection("import", { generateThumbnails: value })} />
            <Toggle label="Generate waveforms" checked={settings.import.generateWaveforms} onChange={(value) => updateSection("import", { generateWaveforms: value })} />
            <Toggle label="Create proxies" checked={settings.import.createProxies} onChange={(value) => updateSection("import", { createProxies: value })} />
            <Select label="Media file handling" value={settings.import.fileMode} options={["link", "copy"]} onChange={(value) => updateSection("import", { fileMode: value as MaheeSettings["import"]["fileMode"] })} />
            <Select label="Default still-image scaling" value={settings.import.defaultStillImageScaling} options={["fit", "fill", "stretch", "center"]} onChange={(value) => updateSection("import", { defaultStillImageScaling: value as MaheeSettings["import"]["defaultStillImageScaling"] })} />
            <Toggle label="Missing-media warnings" checked={settings.import.missingMediaWarnings} onChange={(value) => updateSection("import", { missingMediaWarnings: value })} />
            <Range label="Default video destination track" value={settings.import.defaultVideoDestinationTrack} min={1} max={24} step={1} onChange={(value) => updateSection("import", { defaultVideoDestinationTrack: value })} />
            <Range label="Default audio destination track" value={settings.import.defaultAudioDestinationTrack} min={1} max={24} step={1} onChange={(value) => updateSection("import", { defaultAudioDestinationTrack: value })} />
          </SettingsGrid>
        );
      case "export":
        return (
          <SettingsGrid>
            <Select label="Default format" value={settings.export.format} options={["mp4", "mov", "webm"]} onChange={(value) => updateSection("export", { format: value as MaheeSettings["export"]["format"] })} />
            <Select label="Codec" value={settings.export.codec} options={["h264", "h265", "vp9"]} onChange={(value) => updateSection("export", { codec: value as MaheeSettings["export"]["codec"] })} />
            <Select label="Resolution" value={settings.export.resolution} options={["project", "720p", "1080p"]} onChange={(value) => updateSection("export", { resolution: value as MaheeSettings["export"]["resolution"] })} />
            <Range label="Frame rate" value={settings.export.frameRate} min={12} max={120} step={1} suffix="fps" onChange={(value) => updateSection("export", { frameRate: value })} />
            <Range label="Bitrate" value={settings.export.bitrateMbps} min={1} max={200} step={1} suffix="Mbps" onChange={(value) => updateSection("export", { bitrateMbps: value })} />
            <Range label="Audio bitrate" value={settings.export.audioBitrateKbps} min={64} max={512} step={16} suffix="Kbps" onChange={(value) => updateSection("export", { audioBitrateKbps: value })} />
            <Toggle label="Hardware encoding" checked={settings.export.hardwareEncoding} onChange={(value) => updateSection("export", { hardwareEncoding: value })} note="Requires restart" />
            <PathRow label="Output folder" value={settings.export.outputFolder} onBrowse={() => void chooseFolder("export", "outputFolder")} />
            <Toggle label="Open folder after export" checked={settings.export.openFolderAfterExport} onChange={(value) => updateSection("export", { openFolderAfterExport: value })} />
            <Toggle label="Overwrite warning" checked={settings.export.overwriteWarning} onChange={(value) => updateSection("export", { overwriteWarning: value })} />
            <Toggle label="Remember last export settings" checked={settings.export.rememberLastExportSettings} onChange={(value) => updateSection("export", { rememberLastExportSettings: value })} />
          </SettingsGrid>
        );
      case "audio":
        return (
          <SettingsGrid>
            <Range label="Default clip volume" value={settings.audio.defaultClipVolume} min={0} max={2} step={0.01} suffix="x" onChange={(value) => updateSection("audio", { defaultClipVolume: value })} />
            <Range label="Default fade duration" value={settings.audio.defaultFadeDuration} min={0} max={30} step={0.05} suffix="s" onChange={(value) => updateSection("audio", { defaultFadeDuration: value })} />
            <Toggle label="Audio scrubbing" checked={settings.audio.audioScrubbing} onChange={(value) => updateSection("audio", { audioScrubbing: value })} />
            <Range label="Master preview volume" value={settings.audio.masterPreviewVolume} min={0} max={1} step={0.01} onChange={(value) => updateSection("audio", { masterPreviewVolume: value })} />
            <Text label="Audio output device" value={settings.audio.outputDevice} onChange={(value) => updateSection("audio", { outputDevice: value })} />
            <Range label="Sample rate" value={settings.audio.sampleRate} min={32000} max={96000} step={1000} suffix="Hz" onChange={(value) => updateSection("audio", { sampleRate: value })} />
            <Toggle label="Peak meter visibility" checked={settings.audio.peakMeterVisible} onChange={(value) => updateSection("audio", { peakMeterVisible: value })} />
            <Toggle label="Clipping warning" checked={settings.audio.clippingWarning} onChange={(value) => updateSection("audio", { clippingWarning: value })} />
          </SettingsGrid>
        );
      case "keyboardShortcuts":
        return (
          <div className="shortcut-editor">
            <div className="shortcut-tools">
              <label><Search size={15} /><input value={search} placeholder="Search shortcuts..." onChange={(event) => setSearch(event.target.value)} /></label>
              <button onClick={() => exportShortcuts(settings.keyboardShortcuts.shortcuts)}><Download size={15} /> Export</button>
              <button onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Import</button>
              <button onClick={() => { resetShortcuts(); addToast("success", "Shortcuts reset."); }}><RotateCcw size={15} /> Reset All</button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importShortcuts(event.currentTarget.files?.[0], importShortcutProfile, addToast)} />
            </div>
            {conflicts.length > 0 && <p className="settings-warning">Shortcut conflict: {conflicts.map((item) => item.keys).join(", ")}</p>}
            <div className="shortcut-list">
              {settings.keyboardShortcuts.shortcuts
                .filter((binding) => `${binding.label} ${binding.category} ${binding.keys}`.toLowerCase().includes(search.toLowerCase()))
                .map((binding) => (
                  <article className={`shortcut-row ${conflictIds.has(binding.id) ? "conflict" : ""}`} key={binding.id}>
                    <span>{binding.category}</span>
                    <strong>{binding.label}</strong>
                    <button className="shortcut-key" onClick={() => startShortcutRecording(binding.id)}>
                      {recordingShortcutId === binding.id ? "Press keys..." : binding.keys}
                    </button>
                    <button title="Reset shortcut" onClick={() => resetShortcut(binding.id)}><RotateCcw size={15} /></button>
                  </article>
                ))}
            </div>
          </div>
        );
      case "filesCache":
        return (
          <SettingsGrid>
            <PathRow label="Project folder" value={settings.filesCache.projectFolder} onBrowse={() => void chooseFolder("filesCache", "projectFolder")} />
            <PathRow label="Autosave folder" value={settings.filesCache.autosaveFolder} onBrowse={() => void chooseFolder("filesCache", "autosaveFolder")} />
            <PathRow label="Cache folder" value={settings.filesCache.cacheFolder} onBrowse={() => void chooseFolder("filesCache", "cacheFolder")} />
            <PathRow label="Proxy folder" value={settings.filesCache.proxyFolder} onBrowse={() => void chooseFolder("filesCache", "proxyFolder")} />
            <PathRow label="Temporary render folder" value={settings.filesCache.temporaryRenderFolder} onBrowse={() => void chooseFolder("filesCache", "temporaryRenderFolder")} />
            <ReadOnly label="Storage usage" value={`${settings.filesCache.storageUsageMb.toFixed(1)} MB`} />
            <ActionRow label="Cache cleanup" actions={[
              ["Clear thumbnails", () => undefined, "Thumbnail cache cleanup needs the native cache index."],
              ["Clear waveforms", () => undefined, "Waveform cache cleanup needs the native cache index."],
              ["Clear proxies", () => undefined, "Proxy cache cleanup needs the native cache index."],
              ["Clear all cache", () => undefined, "Full cache cleanup needs the native cache index."]
            ]} />
            <Toggle label="Automatically delete old cache" checked={settings.filesCache.autoDeleteOldCache} onChange={(value) => updateSection("filesCache", { autoDeleteOldCache: value })} />
            <Range label="Delete cache older than" value={settings.filesCache.oldCacheDays} min={1} max={365} step={1} suffix="days" onChange={(value) => updateSection("filesCache", { oldCacheDays: value })} />
          </SettingsGrid>
        );
    }
  };

  return (
    <div className="modal-backdrop settings-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <section className="settings-dialog">
        <aside className="settings-nav">
          <header>
            <Settings2 size={20} />
            <strong>Settings</strong>
          </header>
          {sections.map((section) => (
            <button className={activeSection === section.id ? "active" : ""} key={section.id} onClick={() => setActiveSection(section.id)}>
              {section.label}
            </button>
          ))}
        </aside>
        <main className="settings-content">
          <header className="settings-header">
            <div>
              <span>Mahee Motion</span>
              <h2>{sections.find((section) => section.id === activeSection)?.label}</h2>
            </div>
            <div className="settings-header-actions">
              <button onClick={() => { resetSection(activeSection); addToast("success", "Section reset."); }}><RotateCcw size={15} /> Reset Section</button>
              <button className="danger" onClick={() => { resetAll(); addToast("success", "All settings reset."); }}>Reset All</button>
              <button className="icon" onClick={close} title="Close settings"><X size={18} /></button>
            </div>
          </header>
          <div className="settings-scroll">{renderSection()}</div>
        </main>
      </section>
    </div>
  );
}

function SettingsGrid(props: { children: ReactNode }) {
  return <div className="settings-grid">{props.children}</div>;
}

function Toggle(props: { label: string; checked: boolean; note?: string; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-row">
      <span>{props.label}{props.note && <small>{props.note}</small>}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}

function Range(props: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="settings-row">
      <span>{props.label}</span>
      <div className="settings-range">
        <input type="range" value={props.value} min={props.min} max={props.max} step={props.step} onChange={(event) => props.onChange(Number(event.target.value))} />
        <output>{props.value}{props.suffix ?? ""}</output>
      </div>
    </label>
  );
}

function Select(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="settings-row">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Text(props: { label: string; value: string; note?: string; onChange: (value: string) => void }) {
  return (
    <label className="settings-row">
      <span>{props.label}{props.note && <small>{props.note}</small>}</span>
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function Color(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="settings-row">
      <span>{props.label}</span>
      <input type="color" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function PathRow(props: { label: string; value: string; onBrowse: () => void }) {
  return (
    <div className="settings-row wide">
      <span>{props.label}</span>
      <div className="settings-path">
        <input value={props.value} readOnly placeholder="Choose folder..." />
        <button onClick={props.onBrowse}><FolderOpen size={15} /> Browse</button>
      </div>
    </div>
  );
}

function NumberPair(props: { label: string; first: number; second: number; onFirst: (value: number) => void; onSecond: (value: number) => void }) {
  return (
    <div className="settings-row">
      <span>{props.label}</span>
      <div className="settings-pair">
        <input type="number" value={props.first} onChange={(event) => props.onFirst(Number(event.target.value))} />
        <input type="number" value={props.second} onChange={(event) => props.onSecond(Number(event.target.value))} />
      </div>
    </div>
  );
}

function ReadOnly(props: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{props.label}</span>
      <output>{props.value}</output>
    </div>
  );
}

function ActionRow(props: { label: string; actions: Array<[string, () => void, string?]> }) {
  return (
    <div className="settings-row wide">
      <span>{props.label}</span>
      <div className="settings-actions-inline">
        {props.actions.map(([label, action, disabledReason]) => <button disabled={Boolean(disabledReason)} key={label} title={disabledReason} onClick={action}>{label}</button>)}
      </div>
    </div>
  );
}

function exportShortcuts(shortcuts: ShortcutBinding[]) {
  const blob = new Blob([JSON.stringify({ shortcuts }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "mahee-motion-shortcuts.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importShortcuts(file: File | undefined, importer: (shortcuts: ShortcutBinding[]) => void, addToast: (type: "success" | "error" | "info", message: string) => void) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as { shortcuts?: ShortcutBinding[] };
    if (!Array.isArray(parsed.shortcuts)) throw new Error("Invalid shortcut profile");
    importer(parsed.shortcuts);
    addToast("success", "Shortcut profile imported.");
  } catch (error) {
    addToast("error", String(error));
  }
}
