/* global Document, Storage, structuredClone */
import type { MaheeSettings, SettingsSectionId, ShortcutBinding } from "../types/settings";

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_STORAGE_KEY = "mahee-motion-app-settings";

type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const accentPresets = ["#139cff", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef476f"];

const shortcuts: ShortcutBinding[] = [
  { id: "playPause", label: "Play / Pause", category: "Playback", keys: "Space", defaultKeys: "Space" },
  { id: "split", label: "Split", category: "Timeline", keys: "S", defaultKeys: "S" },
  { id: "delete", label: "Delete", category: "Edit", keys: "Delete", defaultKeys: "Delete" },
  { id: "duplicate", label: "Duplicate", category: "Edit", keys: "Ctrl+D", defaultKeys: "Ctrl+D" },
  { id: "undo", label: "Undo", category: "Edit", keys: "Ctrl+Z", defaultKeys: "Ctrl+Z" },
  { id: "redo", label: "Redo", category: "Edit", keys: "Ctrl+Y", defaultKeys: "Ctrl+Y" },
  { id: "save", label: "Save Project", category: "Project", keys: "Ctrl+S", defaultKeys: "Ctrl+S" },
  { id: "open", label: "Open Project", category: "Project", keys: "Ctrl+O", defaultKeys: "Ctrl+O" },
  { id: "export", label: "Export", category: "Project", keys: "Ctrl+E", defaultKeys: "Ctrl+E" },
  { id: "zoomIn", label: "Timeline Zoom In", category: "View", keys: "+", defaultKeys: "+" },
  { id: "zoomOut", label: "Timeline Zoom Out", category: "View", keys: "-", defaultKeys: "-" }
];

export function defaultSettings(): MaheeSettings {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    general: {
      defaultProjectLocation: "",
      autosaveEnabled: true,
      autosaveIntervalSeconds: 120,
      restoreLastProject: true,
      confirmBeforeDeleting: true,
      confirmBeforeClosingUnsaved: true,
      recentProjectCount: 12
    },
    appearance: {
      theme: "dark",
      accentColor: accentPresets[0],
      customAccentColor: accentPresets[0],
      useCustomAccent: false,
      density: "comfortable",
      fontSize: 14,
      reduceAnimations: false,
      showSidebarLabels: true,
      showTooltips: true,
      timelineClipCornerRadius: 4
    },
    workspace: {
      rememberPanelSizes: true,
      rememberCollapsedSections: true,
      mediaPanelVisible: true,
      inspectorVisible: true,
      timelineToolbarVisible: true,
      audioMetersVisible: true,
      preset: "editing"
    },
    timeline: {
      magneticSnapping: true,
      snapStrength: 60,
      snapToClipEdges: true,
      snapToPlayhead: true,
      snapToMarkers: true,
      snapToTimelineStart: true,
      defaultZoom: 8,
      smoothScrolling: true,
      autoScrollWhileDragging: true,
      showClipThumbnails: true,
      showAudioWaveforms: true,
      showClipNames: true,
      showDurationLabels: true,
      defaultTrackHeight: 64,
      preventSameTrackOverlap: false,
      rippleEditingDefault: false,
      playheadFollow: "follow",
      defaultVideoTrack: 1,
      defaultAudioTrack: 2
    },
    playback: {
      previewQuality: "auto",
      dropFrames: true,
      loopPlaybackDefault: false,
      hardwareDecoding: true,
      cachePreviewFrames: true,
      showSafeZones: false,
      showCenterGuides: true,
      showTransformHandles: true
    },
    performance: {
      mode: "balanced",
      gpuAcceleration: true,
      preferredGpu: "Auto",
      hardwareDecoding: true,
      hardwareEncoding: true,
      maxRamGb: 8,
      maxCacheGb: 20,
      backgroundTaskLimit: 2,
      automaticProxies: false,
      proxyResolution: "540p",
      pauseBackgroundTasksDuringPlayback: true
    },
    projectDefaults: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      sampleRate: 48000,
      backgroundColor: "#000000",
      defaultVideoTrackCount: 4,
      defaultAudioTrackCount: 2,
      defaultImageDuration: 5,
      defaultTextDuration: 5,
      defaultTransitionDuration: 0.5,
      defaultTextFont: "Satoshi",
      defaultTextStyle: "Medium"
    },
    import: {
      autoAddMediaToTimeline: false,
      generateThumbnails: true,
      generateWaveforms: true,
      createProxies: false,
      fileMode: "link",
      defaultStillImageScaling: "fit",
      missingMediaWarnings: true,
      defaultVideoDestinationTrack: 1,
      defaultAudioDestinationTrack: 2
    },
    export: {
      format: "mp4",
      codec: "h264",
      resolution: "project",
      frameRate: 30,
      bitrateMbps: 16,
      audioBitrateKbps: 192,
      hardwareEncoding: true,
      outputFolder: "",
      openFolderAfterExport: true,
      overwriteWarning: true,
      rememberLastExportSettings: true
    },
    audio: {
      defaultClipVolume: 1,
      defaultFadeDuration: 0.25,
      audioScrubbing: true,
      masterPreviewVolume: 0.8,
      outputDevice: "System Default",
      sampleRate: 48000,
      peakMeterVisible: true,
      clippingWarning: true
    },
    keyboardShortcuts: { shortcuts: shortcuts.map((shortcut) => ({ ...shortcut })) },
    filesCache: {
      projectFolder: "",
      autosaveFolder: "",
      cacheFolder: "",
      proxyFolder: "",
      temporaryRenderFolder: "",
      storageUsageMb: 0,
      autoDeleteOldCache: true,
      oldCacheDays: 30
    }
  };
}

export function migrateSettings(input: unknown): MaheeSettings {
  if (!input || typeof input !== "object") return defaultSettings();
  return normalizeSettings(input as DeepPartial<MaheeSettings>);
}

export function normalizeSettings(input: DeepPartial<MaheeSettings>): MaheeSettings {
  const base = defaultSettings();
  const next = mergeSettings(base, input);
  next.version = SETTINGS_SCHEMA_VERSION;
  next.general.autosaveIntervalSeconds = clampNumber(next.general.autosaveIntervalSeconds, 15, 1800);
  next.general.recentProjectCount = clampNumber(next.general.recentProjectCount, 1, 50);
  next.appearance.accentColor = validHex(next.appearance.accentColor) ? next.appearance.accentColor : base.appearance.accentColor;
  next.appearance.customAccentColor = validHex(next.appearance.customAccentColor) ? next.appearance.customAccentColor : base.appearance.customAccentColor;
  next.appearance.fontSize = clampNumber(next.appearance.fontSize, 11, 20);
  next.appearance.timelineClipCornerRadius = clampNumber(next.appearance.timelineClipCornerRadius, 0, 12);
  next.timeline.snapStrength = clampNumber(next.timeline.snapStrength, 0, 100);
  next.timeline.defaultZoom = clampNumber(next.timeline.defaultZoom, 2, 40);
  next.timeline.defaultTrackHeight = clampNumber(next.timeline.defaultTrackHeight, 44, 120);
  next.timeline.defaultVideoTrack = clampNumber(next.timeline.defaultVideoTrack, 1, 24);
  next.timeline.defaultAudioTrack = clampNumber(next.timeline.defaultAudioTrack, 1, 24);
  next.projectDefaults.width = clampNumber(next.projectDefaults.width, 320, 7680);
  next.projectDefaults.height = clampNumber(next.projectDefaults.height, 240, 4320);
  next.projectDefaults.frameRate = clampNumber(next.projectDefaults.frameRate, 12, 120);
  next.projectDefaults.sampleRate = clampNumber(next.projectDefaults.sampleRate, 32000, 96000);
  next.projectDefaults.defaultImageDuration = clampNumber(next.projectDefaults.defaultImageDuration, 1, 120);
  next.projectDefaults.defaultTextDuration = clampNumber(next.projectDefaults.defaultTextDuration, 1, 120);
  next.projectDefaults.defaultTransitionDuration = clampNumber(next.projectDefaults.defaultTransitionDuration, 0, 10);
  next.performance.maxRamGb = clampNumber(next.performance.maxRamGb, 2, 128);
  next.performance.maxCacheGb = clampNumber(next.performance.maxCacheGb, 1, 1024);
  next.performance.backgroundTaskLimit = clampNumber(next.performance.backgroundTaskLimit, 1, 8);
  next.export.bitrateMbps = clampNumber(next.export.bitrateMbps, 1, 200);
  next.export.audioBitrateKbps = clampNumber(next.export.audioBitrateKbps, 64, 512);
  next.audio.defaultClipVolume = clampNumber(next.audio.defaultClipVolume, 0, 2);
  next.audio.defaultFadeDuration = clampNumber(next.audio.defaultFadeDuration, 0, 30);
  next.audio.masterPreviewVolume = clampNumber(next.audio.masterPreviewVolume, 0, 1);
  next.filesCache.oldCacheDays = clampNumber(next.filesCache.oldCacheDays, 1, 365);
  next.keyboardShortcuts.shortcuts = normalizeShortcuts(next.keyboardShortcuts.shortcuts);
  return next;
}

export function resetSettingsSection(settings: MaheeSettings, section: SettingsSectionId): MaheeSettings {
  const defaults = defaultSettings();
  return normalizeSettings({ ...settings, [section]: defaults[section] });
}

export function resetAllSettings(): MaheeSettings {
  return defaultSettings();
}

export function loadSettingsFromStorage(storage: SettingsStorage | undefined = getBrowserStorage()): MaheeSettings {
  if (!storage) return defaultSettings();
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? migrateSettings(JSON.parse(raw)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettingsToStorage(settings: MaheeSettings, storage: SettingsStorage | undefined = getBrowserStorage()) {
  if (!storage) return;
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function clearSettingsStorage(storage: SettingsStorage | undefined = getBrowserStorage()) {
  storage?.removeItem(SETTINGS_STORAGE_KEY);
}

export function settingsToCssVariables(settings: MaheeSettings): Record<string, string> {
  const accent = settings.appearance.useCustomAccent ? settings.appearance.customAccentColor : settings.appearance.accentColor;
  const densityScale = settings.appearance.density === "compact" ? "0.88" : settings.appearance.density === "spacious" ? "1.12" : "1";
  return {
    "--blue": accent,
    "--blue-2": accent,
    "--app-accent": accent,
    "--ui-font-size": `${settings.appearance.fontSize}px`,
    "--ui-density-scale": densityScale,
    "--timeline-clip-radius": `${settings.appearance.timelineClipCornerRadius}px`,
    "--default-track-height": `${settings.timeline.defaultTrackHeight}px`
  };
}

export function applySettingsToDocument(settings: MaheeSettings, doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc) return;
  const root = doc.documentElement;
  const body = doc.body;
  Object.entries(settingsToCssVariables(settings)).forEach(([key, value]) => root.style.setProperty(key, value));
  body.classList.toggle("theme-light", resolveTheme(settings) === "light");
  body.classList.toggle("theme-dark", resolveTheme(settings) === "dark");
  body.classList.toggle("reduce-motion", settings.appearance.reduceAnimations);
  body.classList.toggle("hide-sidebar-labels", !settings.appearance.showSidebarLabels);
  body.classList.toggle("hide-tooltips", !settings.appearance.showTooltips);
  body.classList.toggle("workspace-hide-media", !settings.workspace.mediaPanelVisible);
  body.classList.toggle("workspace-hide-inspector", !settings.workspace.inspectorVisible);
  body.classList.toggle("workspace-hide-toolbar", !settings.workspace.timelineToolbarVisible);
}

export function shortcutConflicts(bindings: ShortcutBinding[]): Array<{ keys: string; ids: string[] }> {
  const buckets = new Map<string, string[]>();
  bindings.forEach((binding) => {
    const key = normalizeShortcut(binding.keys);
    if (!key) return;
    buckets.set(key, [...(buckets.get(key) ?? []), binding.id]);
  });
  return Array.from(buckets.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([keys, ids]) => ({ keys, ids }));
}

export function normalizeShortcut(value: string): string {
  return value.trim().replace(/\s+/g, "").split("+").filter(Boolean).map((part) => {
    const lower = part.toLowerCase();
    if (lower === "control") return "Ctrl";
    if (lower === "cmd" || lower === "command" || lower === "meta") return "Meta";
    if (lower === "escape") return "Esc";
    if (part.length === 1) return part.toUpperCase();
    return part[0].toUpperCase() + part.slice(1);
  }).join("+");
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  const key = event.code === "Space" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Alt", "Shift", "Meta"].includes(key)) parts.push(key);
  return normalizeShortcut(parts.join("+"));
}

function normalizeShortcuts(input: ShortcutBinding[] | undefined): ShortcutBinding[] {
  const byId = new Map((input ?? []).map((binding) => [binding.id, binding]));
  return shortcuts.map((binding) => {
    const current = byId.get(binding.id);
    return {
      ...binding,
      keys: normalizeShortcut(current?.keys ?? binding.keys)
    };
  });
}

function mergeSettings<T>(base: T, input: DeepPartial<T> | undefined): T {
  if (!input || typeof input !== "object") return structuredClone(base);
  const output = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === "object" && !Array.isArray(value) && key in output) {
      output[key] = mergeSettings(output[key], value as Record<string, unknown>);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output as T;
}

function resolveTheme(settings: MaheeSettings): "dark" | "light" {
  if (settings.appearance.theme !== "system") return settings.appearance.theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getBrowserStorage(): SettingsStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function validHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function clampNumber(value: number, min: number, max: number): number {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

export const accentColorPresets = accentPresets;
