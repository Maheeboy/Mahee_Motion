export type MediaType = "video" | "audio" | "image" | "unknown";
export type ClipType = "video" | "audio" | "image" | "text" | "effect" | "filter" | "transition" | "compound";
export type TrackType = "video" | "audio" | "text" | "effect" | "overlay";
export type BlendMode = "normal" | "screen" | "multiply" | "overlay";

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
}

export interface AudioSettings {
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface TransformKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface AudioKeyframe {
  id: string;
  time: number;
  volume: number;
}

export interface SpeedKeyframe {
  id: string;
  time: number;
  speed: number;
}

export interface ColorKeyframe {
  id: string;
  time: number;
  grade: ColorGrade;
}

export type MaskType =
  | "rectangle"
  | "rounded-rectangle"
  | "circle"
  | "ellipse"
  | "line"
  | "heart"
  | "star"
  | "triangle"
  | "diamond"
  | "bezier";

export type MaskBlendMode = "add" | "subtract" | "intersect";

export interface BezierPoint {
  id: string;
  x: number;
  y: number;
  in?: { x: number; y: number };
  out?: { x: number; y: number };
  smooth?: boolean;
}

export interface MaskSnapshot {
  position: { x: number; y: number };
  width: number;
  height: number;
  scale: number;
  rotation: number;
  feather: number;
  expansion: number;
  opacity: number;
  cornerRadius?: number;
  points?: BezierPoint[];
}

export interface MaskKeyframe extends MaskSnapshot {
  id: string;
  time: number;
}

export interface MaskInstance extends MaskSnapshot {
  id: string;
  type: MaskType;
  name: string;
  enabled: boolean;
  draft?: boolean;
  inverted: boolean;
  blendMode: MaskBlendMode;
  aspectRatioLocked: boolean;
  keyframes: MaskKeyframe[];
}

export type BackgroundRemovalMode =
  | "off"
  | "green-screen"
  | "blue-screen"
  | "custom-color"
  | "luma-key"
  | "difference-key";

export type BackgroundRemovalPreviewBackground = "checkerboard" | "black" | "white" | "custom" | "lower-track";
export type BackgroundRemovalExportStatus = "fully-supported" | "approximate" | "unsupported";

export interface BackgroundRemovalSettings {
  enabled: boolean;
  mode: BackgroundRemovalMode;
  keyColor: string;
  tolerance: number;
  softness: number;
  feather: number;
  edgeExpansion: number;
  spillSuppression: number;
  spillRange: number;
  desaturation: number;
  opacity: number;
  invert: boolean;
  showMatte: boolean;
  lumaThreshold: number;
  lumaSoftness: number;
  lumaKey: "bright" | "dark";
  differenceThreshold: number;
  differenceSoftness: number;
  differenceNoiseReduction: number;
  differenceReferencePath?: string;
  previewBackground: BackgroundRemovalPreviewBackground;
  previewCustomColor: string;
  exportStatus: BackgroundRemovalExportStatus;
}

export interface ClipKeyframes {
  transform?: TransformKeyframe[];
  audio?: AudioKeyframe[];
  speed?: SpeedKeyframe[];
  color?: ColorKeyframe[];
}

export interface TextSettings {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string;
  align: "left" | "center" | "right";
  stroke: {
    enabled: boolean;
    color: string;
    width: number;
  };
  glow: {
    enabled: boolean;
    color: string;
    size: number;
    opacity: number;
  };
  shadow: {
    enabled: boolean;
    color: string;
    x: number;
    y: number;
    blur: number;
    opacity: number;
  };
  curve: {
    enabled: boolean;
    amount: number;
  };
}

export type TextAnimationSide = "in" | "out";
export type TextAnimationType =
  | "none"
  | "fade"
  | "slide"
  | "pop"
  | "zoom"
  | "blur"
  | "typewriter"
  | "word-reveal"
  | "rise"
  | "stretch"
  | "shrink";
export type TextAnimationDirection = "up" | "down" | "left" | "right";
export type TextAnimationEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "back-out";

export interface TextAnimation {
  type: TextAnimationType;
  enabled: boolean;
  duration: number;
  delay: number;
  intensity: number;
  direction: TextAnimationDirection;
  distance: number;
  scale: number;
  blur: number;
  characterStagger: number;
  wordStagger: number;
  easing: TextAnimationEasing;
}

export interface TextClipAnimations {
  in: TextAnimation;
  out: TextAnimation;
}

export type VideoAnimationSide = "in" | "out";
export type VideoAnimationType =
  | "none"
  | "fade"
  | "slide"
  | "zoom"
  | "pop"
  | "blur"
  | "rotate"
  | "wipe"
  | "soft-bounce"
  | "soft-drop";
export type VideoAnimationDirection = "left" | "right" | "up" | "down";
export type VideoAnimationEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "back-out";

export interface VideoClipAnimation {
  type: VideoAnimationType;
  enabled: boolean;
  duration: number;
  delay: number;
  intensity: number;
  easing: VideoAnimationEasing;
  direction: VideoAnimationDirection;
  distance: number;
  scaleAmount: number;
  rotationAmount: number;
  blurAmount: number;
  wipeSoftness: number;
  anchorX: number;
  anchorY: number;
}

export interface VideoClipAnimations {
  in: VideoClipAnimation;
  out: VideoClipAnimation;
}

export interface CropSettings {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LegacyColorSettings {
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  fadedBlacks: number;
  highlightReduction: number;
  tealOrange: number;
}

export interface BasicColorSettings {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  gamma: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  hue: number;
  sharpness: number;
  clarity: number;
  dehaze: number;
  fade: number;
  grainAmount: number;
  grainSize: number;
}

export interface LutSettings {
  enabled: boolean;
  lutId?: string;
  sourcePath?: string;
  displayName?: string;
  format?: "cube" | "3dl";
  size?: number;
  intensity: number;
  category?: "technical" | "creative";
}

export type HslRangeName = "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "magenta";

export interface HslRangeSettings {
  hue: number;
  saturation: number;
  luminance: number;
  rangeWidth: number;
  feathering: number;
}

export interface HslSettings {
  enabled: boolean;
  solo?: HslRangeName;
  ranges: Record<HslRangeName, HslRangeSettings>;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurvesSettings {
  enabled: boolean;
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
  hueHue: CurvePoint[];
  hueSaturation: CurvePoint[];
  hueLuminance: CurvePoint[];
}

export type ColorWheelName = "shadows" | "midtones" | "highlights" | "global";

export interface ColorWheelSettings {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ColorWheelsSettings {
  enabled: boolean;
  shadows: ColorWheelSettings;
  midtones: ColorWheelSettings;
  highlights: ColorWheelSettings;
  global: ColorWheelSettings;
  shadowRange: number;
  highlightRange: number;
  softness: number;
}

export interface ColorMatchSettings {
  enabled: boolean;
  strength: number;
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  saturation: number;
  preserveSkinTones: boolean;
  preserveBlacks: boolean;
  preserveHighlights: boolean;
}

export interface ColorGrade {
  enabled: boolean;
  bypassed: boolean;
  beforeAfter: "off" | "bypass";
  version: number;
  basic: BasicColorSettings;
  lut: LutSettings;
  hsl: HslSettings;
  curves: CurvesSettings;
  wheels: ColorWheelsSettings;
  match?: ColorMatchSettings;
  mix: number;
}

export type ColorSettings = ColorGrade | LegacyColorSettings;

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export type EffectType =
  | "glitch"
  | "film-grain"
  | "vignette"
  | "glow"
  | "rgb-split"
  | "vhs"
  | "light-leak"
  | "camera-shake"
  | "zoom-pulse";

export type EffectParamValue = number | string | boolean;

export interface EffectInstance {
  id: string;
  type: EffectType;
  name: string;
  presetId?: string;
  enabled: boolean;
  intensity: number;
  startTime: number;
  duration: number;
  seed: number;
  order: number;
  params: Record<string, EffectParamValue>;
}

export interface TransitionSettings {
  type: string;
  duration: number;
}

export type TransitionPlacement = "between" | "in" | "out";
export type TransitionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type TransitionDirection = "left" | "right" | "up" | "down";

export interface TransitionInstance {
  id: string;
  type: string;
  leftClipId?: string;
  rightClipId?: string;
  placement: TransitionPlacement;
  duration: number;
  easing: TransitionEasing;
  direction?: TransitionDirection;
  intensity?: number;
  softness?: number;
  blurAmount?: number;
  zoomAmount?: number;
  rotation?: number;
  color?: string;
  reversed?: boolean;
}

export interface MediaAsset {
  id: string;
  path: string;
  name: string;
  type: Exclude<MediaType, "unknown">;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  thumbnailPath?: string;
  waveformPath?: string;
  waveformPeaks?: number[];
  trimIn?: number;
  trimOut?: number;
  importedAt: string;
  error?: string;
}

export interface TimelineClip {
  id: string;
  type: ClipType;
  trackId: string;
  assetId?: string;
  timelineStart: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  playbackRate?: number;
  name: string;
  selected?: boolean;
  locked?: boolean;
  muted?: boolean;
  hidden?: boolean;
  transform?: Transform;
  colorAdjustments?: ColorSettings;
  keyframes?: ClipKeyframes;
  crop?: CropSettings;
  audio?: AudioSettings;
  text?: TextSettings;
  textAnimations?: TextClipAnimations;
  videoAnimations?: VideoClipAnimations;
  stickerAnimation?: StickerAnimationId;
  effects?: EffectInstance[];
  masks?: MaskInstance[];
  backgroundRemoval?: BackgroundRemovalSettings;
  transition?: TransitionSettings;
  compoundParentId?: string;
  compound?: {
    clips: Array<{
      clip: TimelineClip;
      trackOrder: number;
      trackMuted?: boolean;
      trackHidden?: boolean;
    }>;
  };
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export type StickerAnimationId =
  | "heart-pop"
  | "flame-flicker"
  | "crown-shine"
  | "lightning-strike"
  | "rocket-launch"
  | "confetti-burst"
  | "star-glow"
  | "thumb-approve"
  | "cool-nod"
  | "arrow-trend"
  | "music-bop"
  | "wand-spark"
  | "cloud-drift"
  | "camera-flash"
  | "bell-ring"
  | "gem-sparkle"
  | "controller-rumble"
  | "trophy-lift"
  | "bubble-chat"
  | "rainbow-spin"
  | "mic-pulse"
  | "gift-pop"
  | "clap-snap"
  | "check-confirm"
  | "pin-drop";

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  order: number;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  height: number;
  clips: TimelineClip[];
}

export interface Timeline {
  duration: number;
  fps: number;
  width: number;
  height: number;
  sampleRate: number;
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
  transitions?: TransitionInstance[];
  playhead: number;
  zoom: number;
  selectedClipIds: string[];
  selectedTransitionId?: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
}

export interface ProjectCache {
  thumbnailDir?: string;
  waveformDir?: string;
}

export type AspectRatioPreset = "original" | "custom" | "16:9" | "4:3" | "2.35:1" | "2:1" | "1.85:1" | "9:16" | "3:4" | "5.8-inch" | "1:1";

export interface ExportSettings {
  outputPath: string;
  resolution: "720p" | "1080p" | "4K";
  aspectRatio?: AspectRatioPreset;
  frameRate: 24 | 30 | 60;
  videoBitrate: string;
  audioBitrate: string;
}

export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  assets: Record<string, MediaAsset>;
  timeline: Timeline;
  exportSettings: ExportSettings;
  cache?: ProjectCache;
}

export interface EditCommand {
  id: string;
  label: string;
  before: Project;
  after: Project;
}

export interface HistoryState {
  past: EditCommand[];
  future: EditCommand[];
}

export interface ExportColorGrade {
  enabled: boolean;
  compatibility: "fully-supported" | "approximate" | "unsupported";
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  hue: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
  fade: number;
  grainAmount: number;
}

export interface ExportRenderClip {
  id: string;
  sourcePath: string;
  sourceType: "video" | "image";
  sourceIn: number;
  duration: number;
  speed: number;
  timelineStart: number;
  trackId: string;
  includeAudio: boolean;
  effects?: EffectInstance[];
  colorGrade?: ExportColorGrade;
  masks?: MaskInstance[];
  backgroundRemoval?: BackgroundRemovalSettings;
  videoAnimations?: VideoClipAnimations;
}

export interface ExportAudioClip {
  id: string;
  sourcePath: string;
  sourceIn: number;
  duration: number;
  timelineStart: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface ExportRenderTransition extends TransitionInstance {
  start: number;
  end: number;
  ffmpegXfade?: string;
  compatibility: "fully-supported" | "approximate" | "unsupported";
}
