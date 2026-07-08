export type SettingsSectionId =
  | "general"
  | "appearance"
  | "workspace"
  | "timeline"
  | "playback"
  | "performance"
  | "projectDefaults"
  | "import"
  | "export"
  | "audio"
  | "keyboardShortcuts"
  | "filesCache";

export type ThemeMode = "dark" | "light" | "system";
export type UiDensity = "compact" | "comfortable" | "spacious";
export type WorkspacePreset = "editing" | "color" | "audio" | "text" | "compact";
export type PreviewQuality = "auto" | "full" | "half" | "quarter";
export type PerformanceMode = "auto" | "balanced" | "performance" | "quality";
export type ProxyResolution = "360p" | "540p" | "720p";
export type StillImageScaling = "fit" | "fill" | "stretch" | "center";
export type MediaFileMode = "link" | "copy";
export type ExportFormat = "mp4" | "mov" | "webm";
export type ExportCodec = "h264" | "h265" | "vp9";
export type ShortcutCategory = "Playback" | "Timeline" | "Edit" | "Project" | "View";

export interface ShortcutBinding {
  id: string;
  label: string;
  category: ShortcutCategory;
  keys: string;
  defaultKeys: string;
}

export interface GeneralSettings {
  defaultProjectLocation: string;
  autosaveEnabled: boolean;
  autosaveIntervalSeconds: number;
  restoreLastProject: boolean;
  confirmBeforeDeleting: boolean;
  confirmBeforeClosingUnsaved: boolean;
  recentProjectCount: number;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  accentColor: string;
  customAccentColor: string;
  useCustomAccent: boolean;
  density: UiDensity;
  fontSize: number;
  reduceAnimations: boolean;
  showSidebarLabels: boolean;
  showTooltips: boolean;
  timelineClipCornerRadius: number;
}

export interface WorkspaceSettings {
  rememberPanelSizes: boolean;
  rememberCollapsedSections: boolean;
  mediaPanelVisible: boolean;
  inspectorVisible: boolean;
  timelineToolbarVisible: boolean;
  audioMetersVisible: boolean;
  preset: WorkspacePreset;
}

export interface TimelineSettings {
  magneticSnapping: boolean;
  snapStrength: number;
  snapToClipEdges: boolean;
  snapToPlayhead: boolean;
  snapToMarkers: boolean;
  snapToTimelineStart: boolean;
  defaultZoom: number;
  smoothScrolling: boolean;
  autoScrollWhileDragging: boolean;
  showClipThumbnails: boolean;
  showAudioWaveforms: boolean;
  showClipNames: boolean;
  showDurationLabels: boolean;
  defaultTrackHeight: number;
  preventSameTrackOverlap: boolean;
  rippleEditingDefault: boolean;
  playheadFollow: "off" | "follow" | "center";
  defaultVideoTrack: number;
  defaultAudioTrack: number;
}

export interface PlaybackSettings {
  previewQuality: PreviewQuality;
  dropFrames: boolean;
  loopPlaybackDefault: boolean;
  hardwareDecoding: boolean;
  cachePreviewFrames: boolean;
  showSafeZones: boolean;
  showCenterGuides: boolean;
  showTransformHandles: boolean;
}

export interface PerformanceSettings {
  mode: PerformanceMode;
  gpuAcceleration: boolean;
  preferredGpu: string;
  hardwareDecoding: boolean;
  hardwareEncoding: boolean;
  maxRamGb: number;
  maxCacheGb: number;
  backgroundTaskLimit: number;
  automaticProxies: boolean;
  proxyResolution: ProxyResolution;
  pauseBackgroundTasksDuringPlayback: boolean;
}

export interface ProjectDefaultSettings {
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  backgroundColor: string;
  defaultVideoTrackCount: number;
  defaultAudioTrackCount: number;
  defaultImageDuration: number;
  defaultTextDuration: number;
  defaultTransitionDuration: number;
  defaultTextFont: string;
  defaultTextStyle: string;
}

export interface ImportSettings {
  autoAddMediaToTimeline: boolean;
  generateThumbnails: boolean;
  generateWaveforms: boolean;
  createProxies: boolean;
  fileMode: MediaFileMode;
  defaultStillImageScaling: StillImageScaling;
  missingMediaWarnings: boolean;
  defaultVideoDestinationTrack: number;
  defaultAudioDestinationTrack: number;
}

export interface ExportDefaultSettings {
  format: ExportFormat;
  codec: ExportCodec;
  resolution: "720p" | "1080p" | "project";
  frameRate: number;
  bitrateMbps: number;
  audioBitrateKbps: number;
  hardwareEncoding: boolean;
  outputFolder: string;
  openFolderAfterExport: boolean;
  overwriteWarning: boolean;
  rememberLastExportSettings: boolean;
}

export interface AudioSettingsModel {
  defaultClipVolume: number;
  defaultFadeDuration: number;
  audioScrubbing: boolean;
  masterPreviewVolume: number;
  outputDevice: string;
  sampleRate: number;
  peakMeterVisible: boolean;
  clippingWarning: boolean;
}

export interface FilesCacheSettings {
  projectFolder: string;
  autosaveFolder: string;
  cacheFolder: string;
  proxyFolder: string;
  temporaryRenderFolder: string;
  storageUsageMb: number;
  autoDeleteOldCache: boolean;
  oldCacheDays: number;
}

export interface KeyboardShortcutSettings {
  shortcuts: ShortcutBinding[];
}

export interface MaheeSettings {
  version: number;
  general: GeneralSettings;
  appearance: AppearanceSettings;
  workspace: WorkspaceSettings;
  timeline: TimelineSettings;
  playback: PlaybackSettings;
  performance: PerformanceSettings;
  projectDefaults: ProjectDefaultSettings;
  import: ImportSettings;
  export: ExportDefaultSettings;
  audio: AudioSettingsModel;
  keyboardShortcuts: KeyboardShortcutSettings;
  filesCache: FilesCacheSettings;
}
