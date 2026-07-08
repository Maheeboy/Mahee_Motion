/* global HTMLAudioElement, HTMLCanvasElement, HTMLImageElement, SVGCircleElement, SVGSVGElement, WebGL2RenderingContext, WebGLProgram, WebGLShader, WebGLUniformLocation */
import type { CSSProperties, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Camera, Check, ChevronDown, Maximize, Minimize, MoreHorizontal, Pause, Play, Redo2, Rewind, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { AspectRatioPreset, BezierPoint, ColorGrade, MaskInstance, TextSettings, TimelineClip, TimelineTrack, Transform } from "../../types/editor";
import { formatTimecode } from "../../utils/time";
import { defaultTransform, evaluateAudioAtTime, evaluateColorAtTime, evaluateSpeedAtTime, evaluateTransformAtTime, getAudibleClipsAtTime, getClipEnd, getVisibleClipsAtTime, sourceTimeAtTimelineTime, timelineContentDuration } from "../../utils/timeline";
import { buildColorFilter, colorOverlayStyle, normalizeColorSettings } from "../../utils/colorGrade";
import { activeEffectsAt, buildEffectFilter, effectFrameStyle, effectOverlayVariables } from "../../utils/effects";
import { bezierBounds, buildMaskDataUrl, evaluateMaskAtTime, normalizeMasks } from "../../utils/masks";
import { normalizeBackgroundRemovalSettings } from "../../utils/backgroundRemoval";
import { resolveTextAnimation } from "../../utils/textAnimations";
import { resolveVideoAnimation } from "../../utils/videoAnimations";
import { mediaPathToSrc } from "../../utils/mediaPaths";
import { transitionPreviewStyle } from "../../utils/transitions";

const zeroCrop = { left: 0, top: 0, right: 0, bottom: 0 };
const CUSTOM_MASK_POINT_DISTANCE = 14;
const PREVIEW_GUIDE_SNAP_PX = 16;
const aspectOptions: Array<{ id: AspectRatioPreset; label: string; ratio?: number }> = [
  { id: "original", label: "Original" },
  { id: "custom", label: "Custom" },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "2.35:1", label: "2.35:1", ratio: 2.35 },
  { id: "2:1", label: "2:1", ratio: 2 },
  { id: "1.85:1", label: "1.85:1", ratio: 1.85 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "5.8-inch", label: "5.8-inch", ratio: 9 / 19.5 },
  { id: "1:1", label: "1:1", ratio: 1 }
];

function customMaskPath(points: BezierPoint[]): string {
  if (!points.length) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")}${points.length >= 3 ? " Z" : ""}`;
}

function pointerToTimelinePoint(event: PointerEvent<SVGSVGElement>, timeline: { width: number; height: number }): BezierPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * timeline.width;
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * timeline.height;
  return {
    id: crypto.randomUUID(),
    x: Math.round(Math.min(timeline.width * 2, Math.max(-timeline.width, x))),
    y: Math.round(Math.min(timeline.height * 2, Math.max(-timeline.height, y)))
  };
}

function translatePoints(points: BezierPoint[], dx: number, dy: number): BezierPoint[] {
  return points.map((point) => ({ ...point, x: Math.round(point.x + dx), y: Math.round(point.y + dy) }));
}

function scalePoints(points: BezierPoint[], center: { x: number; y: number }, scaleX: number, scaleY: number): BezierPoint[] {
  return points.map((point) => ({
    ...point,
    x: Math.round(center.x + (point.x - center.x) * scaleX),
    y: Math.round(center.y + (point.y - center.y) * scaleY)
  }));
}

function animationAnchorPercent(value?: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value ?? 0.5)) * 100)}%`;
}

function snapToPreviewGuide(value: number, size: number, pixelSize: number) {
  const threshold = (PREVIEW_GUIDE_SNAP_PX / Math.max(1, pixelSize)) * size;
  const guides: Array<{ id: string; value: number; distance?: number }> = [
    { id: "start", value: 0 },
    { id: "third-a", value: size / 3 },
    { id: "center", value: size / 2 },
    { id: "third-b", value: (size * 2) / 3 },
    { id: "end", value: size }
  ];
  const nearest = guides.reduce<{ id: string; value: number; distance: number }>((best, guide) => {
    const distance = Math.abs(value - guide.value);
    return distance < best.distance ? { ...guide, distance } : best;
  }, { id: "", value, distance: Number.POSITIVE_INFINITY });
  if (nearest.distance > threshold) return { value, guide: null as string | null };
  return { value: nearest.value, guide: nearest.id };
}

function combineColorGrades(baseGrade: ColorGrade | undefined, layerGrades: Array<ColorGrade | undefined>): ColorGrade {
  let combined = normalizeColorSettings(baseGrade);
  for (const layerInput of layerGrades) {
    const layer = normalizeColorSettings(layerInput);
    if (!layer.enabled || layer.bypassed || layer.beforeAfter === "bypass" || layer.mix <= 0) continue;
    const amount = layer.mix;
    combined = normalizeColorSettings({
      ...combined,
      basic: {
        ...combined.basic,
        exposure: combined.basic.exposure + layer.basic.exposure * amount,
        brightness: combined.basic.brightness + layer.basic.brightness * amount,
        contrast: combined.basic.contrast + layer.basic.contrast * amount,
        highlights: combined.basic.highlights + layer.basic.highlights * amount,
        shadows: combined.basic.shadows + layer.basic.shadows * amount,
        whites: combined.basic.whites + layer.basic.whites * amount,
        blacks: combined.basic.blacks + layer.basic.blacks * amount,
        gamma: combined.basic.gamma * Math.pow(layer.basic.gamma || 1, amount),
        temperature: combined.basic.temperature + layer.basic.temperature * amount,
        tint: combined.basic.tint + layer.basic.tint * amount,
        saturation: combined.basic.saturation + layer.basic.saturation * amount,
        vibrance: combined.basic.vibrance + layer.basic.vibrance * amount,
        hue: combined.basic.hue + layer.basic.hue * amount,
        sharpness: combined.basic.sharpness + layer.basic.sharpness * amount,
        clarity: combined.basic.clarity + layer.basic.clarity * amount,
        dehaze: combined.basic.dehaze + layer.basic.dehaze * amount,
        fade: combined.basic.fade + layer.basic.fade * amount,
        grainAmount: combined.basic.grainAmount + layer.basic.grainAmount * amount,
        grainSize: layer.basic.grainAmount > 0 ? layer.basic.grainSize : combined.basic.grainSize
      },
      lut: layer.lut.enabled ? layer.lut : combined.lut,
      hsl: layer.hsl.enabled ? layer.hsl : combined.hsl,
      curves: layer.curves.enabled ? layer.curves : combined.curves,
      wheels: layer.wheels.enabled ? layer.wheels : combined.wheels
    });
  }
  return combined;
}

function keyedPreviewBackgroundStyle(clip: TimelineClip): CSSProperties {
  const settings = normalizeBackgroundRemovalSettings(clip.backgroundRemoval);
  if (!settings.enabled || settings.mode === "off") return {};
  if (settings.previewBackground === "black") return { background: "#000" };
  if (settings.previewBackground === "white") return { background: "#fff" };
  if (settings.previewBackground === "custom") return { background: settings.previewCustomColor };
  return { background: "transparent" };
}

function PreviewVisualOverlays(props: { enabled: boolean }) {
  if (!props.enabled) return null;
  return (
    <>
      <span className="preview-grade-overlay fade" />
      <span className="preview-grade-overlay highlights" />
      <span className="preview-grade-overlay tonal" />
      <span className="preview-grade-overlay balance" />
      <span className="preview-effect-overlay grain" />
      <span className="preview-effect-overlay vignette" />
      <span className="preview-effect-overlay glow" />
      <span className="preview-effect-overlay rgb" />
      <span className="preview-effect-overlay vhs" />
      <span className="preview-effect-overlay leak" />
      <span className="preview-effect-overlay glitch" />
    </>
  );
}

function KeyedCanvasMedia(props: {
  clip: TimelineClip;
  src: string;
  contentStyle: CSSProperties;
  sourceType: "video" | "image";
  muted?: boolean;
  registerVideo?: (clipId: string, node: HTMLVideoElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const settings = useMemo(() => normalizeBackgroundRemovalSettings(props.clip.backgroundRemoval), [props.clip.backgroundRemoval]);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = props.sourceType === "video" ? videoRef.current : imageRef.current;
    if (!canvas || !source) return undefined;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return undefined;
    const program = createKeyerProgram(gl);
    if (!program) return undefined;
    const position = gl.getAttribLocation(program, "a_position");
    const texCoord = gl.getAttribLocation(program, "a_texCoord");
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) return undefined;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      -1, 1, 0, 0,
      1, -1, 1, 1,
      1, 1, 1, 0
    ]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const uniforms = {
      mode: gl.getUniformLocation(program, "u_mode"),
      keyColor: gl.getUniformLocation(program, "u_keyColor"),
      tolerance: gl.getUniformLocation(program, "u_tolerance"),
      softness: gl.getUniformLocation(program, "u_softness"),
      feather: gl.getUniformLocation(program, "u_feather"),
      edgeExpansion: gl.getUniformLocation(program, "u_edgeExpansion"),
      spillSuppression: gl.getUniformLocation(program, "u_spillSuppression"),
      spillRange: gl.getUniformLocation(program, "u_spillRange"),
      desaturation: gl.getUniformLocation(program, "u_desaturation"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      invert: gl.getUniformLocation(program, "u_invert"),
      showMatte: gl.getUniformLocation(program, "u_showMatte"),
      lumaThreshold: gl.getUniformLocation(program, "u_lumaThreshold"),
      lumaSoftness: gl.getUniformLocation(program, "u_lumaSoftness"),
      lumaDark: gl.getUniformLocation(program, "u_lumaDark")
    };
    let frame = 0;
    const draw = () => {
      const width = source instanceof HTMLVideoElement ? source.videoWidth || 640 : source.naturalWidth || 640;
      const height = source instanceof HTMLVideoElement ? source.videoHeight || 360 : source.naturalHeight || 360;
      const scale = Math.min(1, 720 / Math.max(width, height));
      const nextWidth = Math.max(2, Math.round(width * scale));
      const nextHeight = Math.max(2, Math.round(height * scale));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        gl.viewport(0, 0, nextWidth, nextHeight);
      }
      try {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(texCoord);
        gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 16, 8);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        applyKeyerUniforms(gl, uniforms, settingsRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } catch {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [props.sourceType, props.src]);

  return (
    <>
      {props.sourceType === "video" ? (
        <video
          className="preview-key-source"
          ref={(node) => {
            videoRef.current = node;
            props.registerVideo?.(props.clip.id, node);
          }}
          src={props.src}
          crossOrigin="anonymous"
          muted={props.muted ?? props.clip.audio?.muted ?? false}
          preload="auto"
          playsInline
        />
      ) : (
        <img
          className="preview-key-source"
          ref={imageRef}
          src={props.src}
          crossOrigin="anonymous"
          alt=""
        />
      )}
      <canvas className="preview-media-content preview-keyed-canvas" ref={canvasRef} style={props.contentStyle} />
    </>
  );
}

function createKeyerProgram(gl: WebGL2RenderingContext): WebGLProgram | undefined {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    uniform sampler2D u_texture;
    uniform int u_mode;
    uniform vec3 u_keyColor;
    uniform float u_tolerance;
    uniform float u_softness;
    uniform float u_feather;
    uniform float u_edgeExpansion;
    uniform float u_spillSuppression;
    uniform float u_spillRange;
    uniform float u_desaturation;
    uniform float u_opacity;
    uniform bool u_invert;
    uniform bool u_showMatte;
    uniform float u_lumaThreshold;
    uniform float u_lumaSoftness;
    uniform bool u_lumaDark;
    in vec2 v_texCoord;
    out vec4 outColor;

    vec3 rgbToYCbCr(vec3 rgb) {
      return vec3(
        dot(rgb, vec3(0.299, 0.587, 0.114)),
        dot(rgb, vec3(-0.168736, -0.331264, 0.5)),
        dot(rgb, vec3(0.5, -0.418688, -0.081312))
      );
    }

    vec3 rgbToHsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    float hueDistance(float a, float b) {
      float d = abs(a - b);
      return min(d, 1.0 - d);
    }

    float normalizedRgbDistance(vec3 rgb, vec3 key) {
      vec3 n = rgb / max(0.001, rgb.r + rgb.g + rgb.b);
      vec3 k = key / max(0.001, key.r + key.g + key.b);
      return distance(n, k);
    }

    float alphaForColor(vec3 rgb) {
      if (u_mode == 4) {
        float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
        float keyed = u_lumaDark ? (u_lumaThreshold - luma) : (luma - u_lumaThreshold);
        float matte = smoothstep(0.0, max(0.001, u_lumaSoftness + u_feather), keyed);
        return u_invert ? matte : 1.0 - matte;
      }
      vec3 pixelKey = rgbToYCbCr(rgb);
      vec3 targetKey = rgbToYCbCr(u_keyColor);
      vec3 pixelHsv = rgbToHsv(rgb);
      vec3 targetHsv = rgbToHsv(u_keyColor);
      float chromaDistance = distance(pixelKey.yz, targetKey.yz);
      float lumaDistance = abs(pixelKey.x - targetKey.x) * 0.18;
      float hueScore = hueDistance(pixelHsv.x, targetHsv.x) * min(pixelHsv.y, targetHsv.y) * 0.32;
      float normalizedScore = normalizedRgbDistance(rgb, u_keyColor) * 0.38;
      float distanceValue = min(1.0, chromaDistance * 0.72 + hueScore + normalizedScore + lumaDistance);
      float edge = u_tolerance + u_edgeExpansion;
      float matte = smoothstep(edge, edge + max(0.002, u_softness + u_feather), distanceValue);
      return u_invert ? 1.0 - matte : matte;
    }

    void main() {
      vec4 color = texture(u_texture, v_texCoord);
      vec2 texel = 1.0 / vec2(textureSize(u_texture, 0));
      float alpha = alphaForColor(color.rgb);
      float n1 = alphaForColor(texture(u_texture, v_texCoord + vec2(texel.x, 0.0)).rgb);
      float n2 = alphaForColor(texture(u_texture, v_texCoord - vec2(texel.x, 0.0)).rgb);
      float n3 = alphaForColor(texture(u_texture, v_texCoord + vec2(0.0, texel.y)).rgb);
      float n4 = alphaForColor(texture(u_texture, v_texCoord - vec2(0.0, texel.y)).rgb);
      float neighborAverage = (alpha + n1 + n2 + n3 + n4) / 5.0;
      float growMatte = max(alpha, max(max(n1, n2), max(n3, n4)));
      float shrinkMatte = min(alpha, min(min(n1, n2), min(n3, n4)));
      float cleanup = clamp(abs(u_edgeExpansion) * 2.5 + u_feather * 1.4, 0.0, 1.0);
      alpha = mix(alpha, neighborAverage, cleanup * 0.58);
      alpha = u_edgeExpansion < 0.0 ? mix(alpha, shrinkMatte, cleanup * 0.72) : mix(alpha, growMatte, cleanup * 0.38);
      alpha = smoothstep(0.025, 0.975, alpha);
      if (u_mode != 4) {
        bool greenKey = u_keyColor.g >= u_keyColor.b;
        float dominant = greenKey ? color.g : color.b;
        float other = greenKey ? color.b : color.g;
        float spill = clamp(((dominant - max(color.r, other)) / max(0.001, u_spillRange)) * u_spillSuppression, 0.0, 1.0);
        float neutral = (color.r + other) * 0.5;
        if (greenKey) {
          color.g = mix(color.g, neutral, spill);
        } else {
          color.b = mix(color.b, neutral, spill);
        }
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(color.rgb, vec3(gray), u_desaturation * spill);
      }
      if (u_showMatte) {
        outColor = vec4(vec3(alpha), 1.0);
      } else {
        outColor = vec4(color.rgb, color.a * alpha * u_opacity);
      }
    }
  `);
  if (!vertex || !fragment) return undefined;
  const program = gl.createProgram();
  if (!program) return undefined;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : undefined;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | undefined {
  const shader = gl.createShader(type);
  if (!shader) return undefined;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return undefined;
}

function applyKeyerUniforms(gl: WebGL2RenderingContext, uniforms: Record<string, WebGLUniformLocation | null>, settings: ReturnType<typeof normalizeBackgroundRemovalSettings>) {
  const key = hexToUnitRgb(settings.keyColor);
  gl.uniform1i(uniforms.mode, settings.mode === "luma-key" ? 4 : settings.mode === "difference-key" ? 5 : 1);
  gl.uniform3f(uniforms.keyColor, key.r, key.g, key.b);
  gl.uniform1f(uniforms.tolerance, settings.tolerance);
  gl.uniform1f(uniforms.softness, settings.softness);
  gl.uniform1f(uniforms.feather, settings.feather);
  gl.uniform1f(uniforms.edgeExpansion, settings.edgeExpansion);
  gl.uniform1f(uniforms.spillSuppression, settings.spillSuppression);
  gl.uniform1f(uniforms.spillRange, Math.max(0.001, settings.spillRange));
  gl.uniform1f(uniforms.desaturation, settings.desaturation);
  gl.uniform1f(uniforms.opacity, settings.opacity);
  gl.uniform1i(uniforms.invert, settings.invert ? 1 : 0);
  gl.uniform1i(uniforms.showMatte, settings.showMatte ? 1 : 0);
  gl.uniform1f(uniforms.lumaThreshold, settings.lumaThreshold);
  gl.uniform1f(uniforms.lumaSoftness, settings.lumaSoftness);
  gl.uniform1i(uniforms.lumaDark, settings.lumaKey === "dark" ? 1 : 0);
}

function hexToUnitRgb(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "00b140";
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) / 255,
    g: Number.parseInt(hex.slice(2, 4), 16) / 255,
    b: Number.parseInt(hex.slice(4, 6), 16) / 255
  };
}

function hexToRgba(color: string, opacity: number): string {
  const normalized = color.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red || 0}, ${green || 0}, ${blue || 0}, ${Math.min(1, Math.max(0, opacity)).toFixed(3)})`;
}

function textDecorationStyle(text?: TextSettings): CSSProperties {
  const shadows: string[] = [];
  if (text?.glow.enabled) shadows.push(`0 0 ${text.glow.size}px ${hexToRgba(text.glow.color, text.glow.opacity)}`);
  if (text?.shadow.enabled) shadows.push(`${text.shadow.x}px ${text.shadow.y}px ${text.shadow.blur}px ${hexToRgba(text.shadow.color, text.shadow.opacity)}`);
  return {
    WebkitTextStroke: text?.stroke.enabled ? `${text.stroke.width}px ${text.stroke.color}` : undefined,
    textShadow: shadows.length ? shadows.join(", ") : undefined
  };
}

function renderCurvedText(value: string, text?: TextSettings) {
  if (!text?.curve.enabled || Math.abs(text.curve.amount) < 1) return value;
  const characters = Array.from(value);
  const center = Math.max(1, (characters.length - 1) / 2);
  return characters.map((character, index) => {
    const offset = (index - center) / center;
    const bend = Math.abs(offset) * Math.abs(text.curve.amount) * 0.2;
    const y = text.curve.amount >= 0 ? -bend : bend;
    const rotation = offset * text.curve.amount * 0.16;
    return (
      <span key={`${character}-${index}`} style={{ display: "inline-block", transform: `translateY(${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg)`, transformOrigin: "50% 100%" }}>
        {character === " " ? "\u00a0" : character}
      </span>
    );
  });
}

function stickerLoopTransform(kind: TimelineClip["stickerAnimation"], clip: TimelineClip, absoluteTime: number) {
  if (!kind) return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  const cycle = 5;
  const progress = (Math.max(0, absoluteTime - clip.timelineStart) % cycle) / cycle;
  const wave = Math.sin(progress * Math.PI * 2);
  const pulse = 0.5 + wave * 0.5;
  const snap = (start: number, end: number) => progress >= start && progress <= end ? Math.sin(((progress - start) / (end - start)) * Math.PI) : 0;
  const hit = (center: number, width: number) => Math.max(0, 1 - Math.abs(progress - center) / width);
  switch (kind) {
    case "heart-pop": return { x: 0, y: -4 * snap(0.08, 0.34), scale: 1 + 0.22 * snap(0.08, 0.34) - 0.04 * hit(0.42, 0.12), rotation: wave * 2, opacity: 1 };
    case "flame-flicker": return { x: wave * 2, y: -3 - Math.abs(wave) * 6, scale: 1 + 0.08 * Math.abs(wave) + 0.04 * hit(0.72, 0.1), rotation: Math.sin(progress * Math.PI * 8) * 3, opacity: 0.94 + pulse * 0.06 };
    case "crown-shine": return { x: 0, y: -2 * snap(0.55, 0.86), scale: 1 + 0.08 * snap(0.55, 0.86), rotation: -4 + 8 * pulse, opacity: 1 };
    case "lightning-strike": return { x: hit(0.18, 0.05) * -9 + hit(0.24, 0.04) * 7, y: hit(0.18, 0.05) * 5, scale: 1 + hit(0.2, 0.08) * 0.18, rotation: -7 * hit(0.18, 0.06) + 5 * hit(0.25, 0.05), opacity: 0.86 + hit(0.2, 0.08) * 0.14 };
    case "rocket-launch": return { x: wave * 7, y: -8 - progress * 18 + snap(0.72, 1) * 22, scale: 1 + snap(0.05, 0.28) * 0.12, rotation: -10 + wave * 6, opacity: 1 };
    case "confetti-burst": return { x: Math.sin(progress * Math.PI * 6) * 5, y: -14 * snap(0.08, 0.44), scale: 0.94 + snap(0.08, 0.44) * 0.2 + pulse * 0.03, rotation: Math.sin(progress * Math.PI * 4) * 10, opacity: 1 };
    case "star-glow": return { x: 0, y: wave * -3, scale: 1 + pulse * 0.13, rotation: wave * 4, opacity: 0.88 + pulse * 0.12 };
    case "thumb-approve": return { x: snap(0.05, 0.3) * 4, y: -8 * snap(0.05, 0.3), scale: 1 + snap(0.05, 0.3) * 0.12, rotation: -5 + 12 * snap(0.05, 0.3) - 4 * snap(0.36, 0.58), opacity: 1 };
    case "cool-nod": return { x: wave * 2, y: Math.sin(progress * Math.PI * 4) * 2, scale: 1 + hit(0.32, 0.14) * 0.06, rotation: Math.sin(progress * Math.PI * 4) * 5, opacity: 1 };
    case "arrow-trend": return { x: progress * 18 - 9, y: -progress * 12 + 6, scale: 0.96 + snap(0.18, 0.46) * 0.12, rotation: -5 + snap(0.18, 0.46) * 10, opacity: 1 };
    case "music-bop": return { x: Math.sin(progress * Math.PI * 8) * 2, y: -Math.abs(Math.sin(progress * Math.PI * 4)) * 11, scale: 1 + Math.abs(Math.sin(progress * Math.PI * 4)) * 0.1, rotation: Math.sin(progress * Math.PI * 4) * 7, opacity: 1 };
    case "wand-spark": return { x: Math.sin(progress * Math.PI * 2) * 9, y: Math.cos(progress * Math.PI * 2) * -8, scale: 1 + snap(0.35, 0.66) * 0.11, rotation: -20 + progress * 42, opacity: 1 };
    case "cloud-drift": return { x: Math.sin(progress * Math.PI * 2) * 14, y: Math.sin(progress * Math.PI * 4) * 2, scale: 1 + pulse * 0.035, rotation: wave * 2, opacity: 0.94 + pulse * 0.06 };
    case "camera-flash": return { x: 0, y: -3 * snap(0.08, 0.22), scale: 1 + hit(0.18, 0.06) * 0.16, rotation: -2 + hit(0.18, 0.05) * 4, opacity: 0.82 + hit(0.18, 0.07) * 0.18 };
    case "bell-ring": return { x: Math.sin(progress * Math.PI * 10) * 4, y: 0, scale: 1 + hit(0.2, 0.14) * 0.07, rotation: Math.sin(progress * Math.PI * 10) * (9 * (1 - progress * 0.45)), opacity: 1 };
    case "gem-sparkle": return { x: 0, y: wave * -2, scale: 1 + hit(0.34, 0.08) * 0.15 + hit(0.72, 0.08) * 0.12, rotation: wave * 3, opacity: 0.9 + Math.max(hit(0.34, 0.08), hit(0.72, 0.08)) * 0.1 };
    case "controller-rumble": return { x: Math.sin(progress * Math.PI * 18) * 3, y: Math.sin(progress * Math.PI * 22) * 2, scale: 1 + hit(0.5, 0.18) * 0.05, rotation: Math.sin(progress * Math.PI * 16) * 3, opacity: 1 };
    case "trophy-lift": return { x: 0, y: -12 * snap(0.1, 0.48), scale: 1 + snap(0.1, 0.48) * 0.12, rotation: Math.sin(progress * Math.PI * 4) * 4, opacity: 1 };
    case "bubble-chat": return { x: wave * 4, y: -7 * snap(0.18, 0.5), scale: 0.96 + snap(0.18, 0.5) * 0.15, rotation: wave * 2, opacity: 0.92 + snap(0.18, 0.5) * 0.08 };
    case "rainbow-spin": return { x: 0, y: 0, scale: 1 + pulse * 0.06, rotation: progress * 360, opacity: 1 };
    case "mic-pulse": return { x: wave * 2, y: -Math.abs(Math.sin(progress * Math.PI * 4)) * 8, scale: 1 + Math.abs(Math.sin(progress * Math.PI * 4)) * 0.09, rotation: wave * 4, opacity: 1 };
    case "gift-pop": return { x: 0, y: -10 * snap(0.1, 0.34), scale: 0.92 + snap(0.1, 0.34) * 0.24 + hit(0.5, 0.11) * 0.04, rotation: Math.sin(progress * Math.PI * 6) * 4, opacity: 1 };
    case "clap-snap": return { x: hit(0.18, 0.08) * -5 + hit(0.3, 0.08) * 4, y: -5 * hit(0.25, 0.1), scale: 1 + hit(0.25, 0.1) * 0.12, rotation: -8 * hit(0.18, 0.08) + 8 * hit(0.3, 0.08), opacity: 1 };
    case "check-confirm": return { x: 0, y: -4 * snap(0.2, 0.44), scale: 0.96 + snap(0.2, 0.44) * 0.17, rotation: -8 + snap(0.2, 0.44) * 10, opacity: 1 };
    case "pin-drop": return { x: wave * 2, y: -20 + snap(0.1, 0.42) * 20 - hit(0.52, 0.12) * 5, scale: 1 + hit(0.52, 0.12) * 0.12, rotation: wave * 3, opacity: 1 };
    default: return { x: 0, y: wave * -8, scale: 1 + pulse * 0.06, rotation: wave * 3, opacity: 1 };
  }
}

export function PreviewPanel() {
  const panelRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const aspectMenuRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const playheadRef = useRef(0);
  const dragRef = useRef<{ clipId: string; pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const textTransformDragRef = useRef<{
    clipId: string;
    mode: "scale" | "rotate";
    startX: number;
    startY: number;
    originScale: number;
    originRotation: number;
    originX: number;
    originY: number;
    centerClientX: number;
    centerClientY: number;
    startAngle: number;
  } | null>(null);
  const maskDragRef = useRef<{
    clipId: string;
    maskId: string;
    mode: "move" | "resize" | "rotate";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
    originRotation: number;
    type?: MaskInstance["type"];
    originPoints?: BezierPoint[];
    corner?: "nw" | "ne" | "sw" | "se";
  } | null>(null);
  const maskPointDragRef = useRef<{
    clipId: string;
    maskId: string;
    pointId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    points: BezierPoint[];
  } | null>(null);
  const customMaskDrawRef = useRef<{
    clipId: string;
    maskId: string;
    points: BezierPoint[];
    lastX: number;
    lastY: number;
  } | null>(null);
  const playbackRef = useRef<{
    clipId?: string;
    timelineStart: number;
    sourceIn: number;
    speed: number;
    clipEnd: number;
  }>({ timelineStart: 0, sourceIn: 0, speed: 1, clipEnd: 0 });
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [displayTime, setDisplayTime] = useState(0);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [snappedGuide, setSnappedGuide] = useState<{ x: string | null; y: string | null }>({ x: null, y: null });
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const project = useEditorStore((state) => state.project);
  const previewAssetId = useEditorStore((state) => state.previewAssetId);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const stepPlayhead = useEditorStore((state) => state.stepPlayhead);
  const selectClip = useEditorStore((state) => state.selectClip);
  const setClipTransformTransient = useEditorStore((state) => state.setClipTransformTransient);
  const setClipMaskTransient = useEditorStore((state) => state.setClipMaskTransient);
  const previewUi = useEditorStore((state) => state.previewUi);
  const toggleSafeZones = useEditorStore((state) => state.toggleSafeZones);
  const toggleAlignmentGuides = useEditorStore((state) => state.toggleAlignmentGuides);
  const toggleEffectsBypass = useEditorStore((state) => state.toggleEffectsBypass);
  const applyExportResolutionPreset = useEditorStore((state) => state.applyExportResolutionPreset);
  const applyExportAspectPreset = useEditorStore((state) => state.applyExportAspectPreset);

  const timelineCenterX = project.timeline.width / 2;
  const timelineCenterY = project.timeline.height / 2;
  const visible = useMemo(() => getVisibleClipsAtTime(project.timeline, displayTime), [displayTime, project.timeline]);
  const audible = useMemo(() => getAudibleClipsAtTime(project.timeline, displayTime), [displayTime, project.timeline]);
  const visualItems = useMemo(() => visible
    .filter(({ clip }) => clip.type === "video" || clip.type === "image")
    .map(({ track, clip }) => ({ track, clip, asset: clip.assetId ? project.assets[clip.assetId] : undefined }))
    .filter((item) => item.asset), [project.assets, visible]);
  const audioItems = useMemo(() => audible
    .filter(({ clip }) => clip.type === "audio")
    .map(({ track, clip }) => ({ track, clip, asset: clip.assetId ? project.assets[clip.assetId] : undefined }))
    .filter((item) => item.asset?.type === "audio" && item.asset.path), [audible, project.assets]);
  const timelineEffectItems = useMemo(() => visible.filter(({ clip }) => clip.type === "effect"), [visible]);
  const timelineFilterItems = useMemo(() => visible.filter(({ clip }) => clip.type === "filter"), [visible]);
  const visualVideoKey = visualItems.filter((item) => item.asset?.type === "video").map((item) => item.clip.id).join("|");
  const audioKey = audioItems.map((item) => item.clip.id).join("|");
  const baseVisualItem = visualItems.find((item) => item.asset?.type === "video") ?? visualItems.at(-1);
  const baseVisual = baseVisualItem?.clip;
  const activePlaybackEnd = Math.max(
    baseVisual ? getClipEnd(baseVisual) : 0,
    ...audioItems.map(({ clip }) => getClipEnd(clip))
  );
  const textClips = visible.filter(({ clip }) => clip.type === "text" && clip.text).map(({ clip }) => clip);
  const timelineAsset = baseVisual?.assetId ? project.assets[baseVisual.assetId] : undefined;
  const selectedPreviewAsset = previewAssetId ? project.assets[previewAssetId] : undefined;
  const selectedTimelineAsset = project.timeline.tracks
    .flatMap((track) => track.clips)
    .find((clip) => project.timeline.selectedClipIds.includes(clip.id))
    ?.assetId;
  const originalAspectAsset = (selectedTimelineAsset ? project.assets[selectedTimelineAsset] : undefined)
    ?? timelineAsset
    ?? selectedPreviewAsset
    ?? Object.values(project.assets).find((item) => item.type === "video" || item.type === "image");
  const asset = timelineAsset ?? selectedPreviewAsset;
  const hasTimelineVisuals = visualItems.length > 0 || textClips.length > 0;
  const mediaSrc = !hasTimelineVisuals && asset?.path ? mediaPathToSrc(asset.path) : undefined;
  const activeSpeed = baseVisual?.speed ?? 1;
  const customMaskDrawingActive = visualItems.some(({ clip }) => (
    project.timeline.selectedClipIds.includes(clip.id)
    && normalizeMasks(clip.masks, project.timeline).some((mask) => mask.enabled && mask.type === "bezier" && mask.draft)
  ));
  const selectedAspect = project.exportSettings.aspectRatio ?? "16:9";
  const selectedAspectLabel = aspectOptions.find((option) => option.id === selectedAspect)?.label ?? selectedAspect;
  const isPreviewClipSelected = (clip: TimelineClip) => project.timeline.selectedClipIds.includes(clip.compoundParentId ?? clip.id);
  const contentDuration = useMemo(() => timelineContentDuration(project.timeline), [project.timeline]);
  const previewDuration = Math.max(0.001, contentDuration || asset?.duration || 0);

  useEffect(() => {
    setCustomWidth(project.timeline.width);
    setCustomHeight(project.timeline.height);
  }, [project.timeline.height, project.timeline.width]);

  useEffect(() => {
    if (!aspectMenuOpen) return undefined;
    const close = (event: globalThis.PointerEvent) => {
      if (!aspectMenuRef.current?.contains(event.target as globalThis.Node)) setAspectMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [aspectMenuOpen]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(window.document.fullscreenElement === panelRef.current);
    window.document.addEventListener("fullscreenchange", syncFullscreen);
    return () => window.document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const chooseAspect = (preset: AspectRatioPreset) => {
    if (preset === "custom") {
      setCustomWidth(project.timeline.width);
      setCustomHeight(project.timeline.height);
      applyExportAspectPreset("custom", { width: project.timeline.width, height: project.timeline.height });
      return;
    }
    if (preset === "original") {
      const width = originalAspectAsset?.width ?? project.timeline.width;
      const height = originalAspectAsset?.height ?? project.timeline.height;
      applyExportAspectPreset(preset, { width, height });
    } else {
      applyExportAspectPreset(preset);
    }
    setAspectMenuOpen(false);
  };

  const applyCustomAspect = () => {
    applyExportAspectPreset("custom", {
      width: Math.min(7680, Math.max(240, Number.isFinite(customWidth) ? customWidth : project.timeline.width)),
      height: Math.min(4320, Math.max(240, Number.isFinite(customHeight) ? customHeight : project.timeline.height))
    });
    setAspectMenuOpen(false);
  };

  const toggleFullscreen = async () => {
    if (window.document.fullscreenElement === panelRef.current) {
      await window.document.exitFullscreen();
      return;
    }
    if (isFullscreen) {
      await getCurrentWindow().setFullscreen(false);
      setIsFullscreen(false);
      return;
    }
    if (!panelRef.current?.requestFullscreen) {
      await getCurrentWindow().setFullscreen(true);
      setIsFullscreen(true);
      return;
    }
    try {
      await panelRef.current.requestFullscreen();
    } catch {
      await getCurrentWindow().setFullscreen(true);
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    if (!isFullscreen || window.document.fullscreenElement) return undefined;
    const exitOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      void getCurrentWindow().setFullscreen(false);
      setIsFullscreen(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [isFullscreen]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const updateStage = () => {
      const rect = viewer.getBoundingClientRect();
      const projectAspect = project.timeline.width / project.timeline.height;
      const viewerAspect = rect.width / rect.height;
      if (viewerAspect > projectAspect) {
        setStage({ width: rect.height * projectAspect, height: rect.height });
      } else {
        setStage({ width: rect.width, height: rect.width / projectAspect });
      }
    };
    updateStage();
    const observer = new window.ResizeObserver(updateStage);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, [project.timeline.height, project.timeline.width]);

  const previewVolumeAt = useCallback((clip: TimelineClip, time: number, trackMuted = false) => {
    const audio = clip.audio;
    if (!audio || audio.muted || clip.muted || trackMuted) return 0;
    const evaluatedAudio = evaluateAudioAtTime(clip, time);
    const local = Math.max(0, time - clip.timelineStart);
    const remaining = Math.max(0, getClipEnd(clip) - time);
    const fadeInGain = audio.fadeIn > 0 ? Math.min(1, local / audio.fadeIn) : 1;
    const fadeOutGain = audio.fadeOut > 0 ? Math.min(1, remaining / audio.fadeOut) : 1;
    return Math.max(0, Math.min(1, evaluatedAudio.volume * Math.min(fadeInGain, fadeOutGain)));
  }, []);

  const seekPreviewFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    setPlayhead(ratio * previewDuration);
  };

  const beginPreviewScrub = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekPreviewFromPointer(event);
  };

  useEffect(() => {
    if (isPlaying) return;
    const nextTime = Math.min(project.timeline.playhead, previewDuration);
    playheadRef.current = nextTime;
    setDisplayTime(nextTime);
  }, [isPlaying, previewDuration, project.timeline.playhead]);

  useEffect(() => {
    playbackRef.current = {
      clipId: baseVisual?.id,
      timelineStart: baseVisual?.timelineStart ?? 0,
      sourceIn: baseVisual?.sourceIn ?? 0,
      speed: activeSpeed,
      clipEnd: activePlaybackEnd
    };
  }, [activePlaybackEnd, activeSpeed, baseVisual]);

  useEffect(() => {
    for (const [clipId, video] of videoRefs.current) {
      const item = visualItems.find(({ clip }) => clip.id === clipId);
      if (!item) continue;
      const clip = item.clip;
      const speed = evaluateSpeedAtTime(clip, displayTime);
      const relative = Math.max(0, sourceTimeAtTimelineTime(clip, displayTime));
      const drift = Math.abs(video.currentTime - relative);
      video.playbackRate = speed;
      video.volume = clip.id === baseVisual?.id ? previewVolumeAt(clip, displayTime, item.track.muted) : 0;
      if (!isPlaying || drift > 0.18) video.currentTime = relative;
    }
  }, [baseVisual?.id, displayTime, isPlaying, previewVolumeAt, visualItems]);

  useEffect(() => {
    for (const [clipId, audio] of audioRefs.current) {
      const item = audioItems.find(({ clip }) => clip.id === clipId);
      if (!item) continue;
      const clip = item.clip;
      const speed = evaluateSpeedAtTime(clip, displayTime);
      const relative = Math.max(0, sourceTimeAtTimelineTime(clip, displayTime));
      const drift = Math.abs(audio.currentTime - relative);
      audio.playbackRate = speed;
      audio.volume = previewVolumeAt(clip, displayTime);
      if (!isPlaying || drift > 0.18) audio.currentTime = relative;
    }
  }, [audioItems, displayTime, isPlaying, previewVolumeAt]);

  useEffect(() => {
    for (const video of videoRefs.current.values()) {
      if (isPlaying) {
        void video.play().catch(() => setPlaying(false));
      } else {
        video.pause();
      }
    }
    for (const audio of audioRefs.current.values()) {
      if (isPlaying) {
        void audio.play().catch(() => setPlaying(false));
      } else {
        audio.pause();
      }
    }
  }, [audioKey, isPlaying, setPlaying, visualVideoKey]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();
    let lastStoreSync = last;
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      const stopAt = previewDuration;
      const next = Math.min(stopAt, playheadRef.current + delta);
      playheadRef.current = next;
      setDisplayTime(next);
      if (now - lastStoreSync > 90) {
        lastStoreSync = now;
        setPlayhead(next);
      }
      if (next >= stopAt) {
        setPlayhead(next);
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, previewDuration, setPlaying, setPlayhead]);

  const transformFor = (clip: TimelineClip): Transform => evaluateTransformAtTime(clip, displayTime, {
    ...defaultTransform(project.timeline),
    x: timelineCenterX,
    y: timelineCenterY
  });

  const effectsForVisual = (clip: TimelineClip, track: TimelineTrack) => [
    ...activeEffectsAt(clip, displayTime, previewUi.effectsBypassed),
    ...timelineEffectItems
      .filter(({ track: effectTrack }) => effectTrack.order <= track.order)
      .flatMap(({ clip: effectClip }) => activeEffectsAt(effectClip, displayTime, previewUi.effectsBypassed))
  ];

  const colorGradeForVisual = (clip: TimelineClip, track: TimelineTrack) => combineColorGrades(
    evaluateColorAtTime(clip, displayTime),
    timelineFilterItems
      .filter(({ track: filterTrack }) => filterTrack.order <= track.order)
      .map(({ clip: filterClip }) => evaluateColorAtTime(filterClip, displayTime))
  );

  const mediaFrameStyle = (clip: TimelineClip, track: TimelineTrack, asset?: { type: string; width?: number; height?: number }) => {
    const transform = transformFor(clip);
    const animation = resolveVideoAnimation(clip, displayTime);
    const effects = effectsForVisual(clip, track);
    const colorGrade = colorGradeForVisual(clip, track);
    const maskImage = buildMaskDataUrl(clip.masks, clip, project.timeline, displayTime);
    const crop = clip.crop ?? zeroCrop;
    const stickerLoop = stickerLoopTransform(clip.stickerAnimation, clip, displayTime);
    const isImageAsset = asset?.type === "image";
    const baseWidth = isImageAsset && asset?.width ? (asset.width / project.timeline.width) * 100 : 100;
    const baseHeight = isImageAsset && asset?.height ? (asset.height / project.timeline.height) * 100 : 100;
    const width = Math.max(1, baseWidth * ((100 - crop.left - crop.right) / 100));
    const height = Math.max(1, baseHeight * ((100 - crop.top - crop.bottom) / 100));
    const x = stage.width ? ((transform.x + animation.translateX) / project.timeline.width) * stage.width : 0;
    const y = stage.height ? ((transform.y + animation.translateY) / project.timeline.height) * stage.height : 0;
    const animationFilter = animation.blur > 0.01 ? `blur(${animation.blur.toFixed(2)}px)` : undefined;
    const transitionStyle = (project.timeline.transitions ?? []).reduce<CSSProperties>((style, transition) => {
      const next = transitionPreviewStyle(transition, clip, project.timeline, displayTime);
      return Object.keys(next).length ? { ...style, ...next } : style;
    }, {});
    return {
      left: 0,
      top: 0,
      width: `${width}%`,
      height: `${height}%`,
      transform: `translate3d(${x + stickerLoop.x}px, ${y + stickerLoop.y}px, 0) translate(-50%, -50%) translate3d(var(--effect-shake-x, 0px), var(--effect-shake-y, 0px), 0) scale(${transform.scale * animation.scale * stickerLoop.scale}) scale(var(--effect-scale, 1)) rotate(${transform.rotation + animation.rotation + stickerLoop.rotation}deg) rotate(var(--effect-rotate, 0deg))`,
      opacity: transform.opacity * animation.opacity * stickerLoop.opacity,
      mixBlendMode: transform.blendMode === "normal" ? undefined : transform.blendMode,
      transformOrigin: `${animationAnchorPercent(clip.videoAnimations?.in?.anchorX)} ${animationAnchorPercent(clip.videoAnimations?.in?.anchorY)}`,
      clipPath: animation.clipPath,
      ...colorOverlayStyle(colorGrade),
      ...effectFrameStyle(effects, clip, displayTime),
      ...effectOverlayVariables(effects),
      filter: animationFilter,
      ...transitionStyle,
      ...(maskImage ? {
        WebkitMaskImage: maskImage,
        maskImage,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat"
      } : {})
    };
  };

  const mediaContentStyle = (clip: TimelineClip, track: TimelineTrack) => {
    const effects = effectsForVisual(clip, track);
    const colorGrade = colorGradeForVisual(clip, track);
    const crop = clip.crop ?? zeroCrop;
    const width = Math.max(1, 100 - crop.left - crop.right);
    const height = Math.max(1, 100 - crop.top - crop.bottom);
    return {
      width: `${100 / (width / 100)}%`,
      height: `${100 / (height / 100)}%`,
      left: `${-(crop.left / width) * 100}%`,
      top: `${-(crop.top / height) * 100}%`,
      filter: [buildColorFilter(colorGrade), buildEffectFilter(effects)].filter(Boolean).join(" ")
    };
  };

  const beginPreviewDrag = (event: PointerEvent<HTMLDivElement>, clip: TimelineClip) => {
    event.stopPropagation();
    event.preventDefault();
    const selectionId = clip.compoundParentId ?? clip.id;
    selectClip(selectionId, event.shiftKey);
    if (clip.compoundParentId) return;
    const transform = transformFor(clip);
    dragRef.current = { clipId: clip.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y };
    setDraggingClipId(clip.id);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer tracking below keeps dragging alive if capture is unavailable.
    }
    const startStage = { ...stage };
    const startTimeline = { width: project.timeline.width, height: project.timeline.height };
    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== moveEvent.pointerId || !startStage.width || !startStage.height || moveEvent.buttons !== 1) return;
      const dx = ((moveEvent.clientX - drag.startX) / startStage.width) * startTimeline.width;
      const dy = ((moveEvent.clientY - drag.startY) / startStage.height) * startTimeline.height;
      const snappedX = snapToPreviewGuide(drag.originX + dx, startTimeline.width, startStage.width);
      const snappedY = snapToPreviewGuide(drag.originY + dy, startTimeline.height, startStage.height);
      setSnappedGuide({ x: snappedX.guide, y: snappedY.guide });
      setClipTransformTransient(drag.clipId, {
        x: Math.round(snappedX.value),
        y: Math.round(snappedY.value)
      });
    };
    const cleanup = (endEvent?: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag && endEvent && drag.pointerId !== endEvent.pointerId) return;
      dragRef.current = null;
      setDraggingClipId(null);
      setSnappedGuide({ x: null, y: null });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  const beginTextTransformDrag = (event: PointerEvent<HTMLElement>, clip: TimelineClip, mode: "scale" | "rotate") => {
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip.id, event.shiftKey);
    const transform = transformFor(clip);
    const rect = stageRef.current?.getBoundingClientRect();
    const centerClientX = (rect?.left ?? 0) + (transform.x / project.timeline.width) * stage.width;
    const centerClientY = (rect?.top ?? 0) + (transform.y / project.timeline.height) * stage.height;
    const startAngle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX) * 180 / Math.PI;
    textTransformDragRef.current = {
      clipId: clip.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originScale: transform.scale,
      originRotation: transform.rotation,
      originX: transform.x,
      originY: transform.y,
      centerClientX,
      centerClientY,
      startAngle
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTextTransformDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = textTransformDragRef.current;
    if (!drag || event.buttons !== 1) return;
    if (drag.mode === "scale") {
      const delta = (event.clientX - drag.startX + event.clientY - drag.startY) / 180;
      setClipTransformTransient(drag.clipId, { scale: Math.max(0.1, Math.min(8, Number((drag.originScale + delta).toFixed(3)))) });
      return;
    }
    const angle = Math.atan2(event.clientY - drag.centerClientY, event.clientX - drag.centerClientX) * 180 / Math.PI;
    setClipTransformTransient(drag.clipId, { rotation: Math.round(drag.originRotation + angle - drag.startAngle) });
  };

  const endTextTransformDrag = () => {
    textTransformDragRef.current = null;
  };

  const beginMaskDrag = (event: PointerEvent<HTMLElement>, clip: TimelineClip, mask: Pick<MaskInstance, "id" | "type" | "position" | "width" | "height" | "rotation" | "points">, mode: "move" | "resize" | "rotate", corner?: "nw" | "ne" | "sw" | "se") => {
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip.id, event.shiftKey);
    maskDragRef.current = {
      clipId: clip.id,
      maskId: mask.id,
      mode,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      originX: mask.position.x,
      originY: mask.position.y,
      originWidth: mask.width,
      originHeight: mask.height,
      originRotation: mask.rotation,
      type: mask.type,
      originPoints: mask.points?.map((point) => ({ ...point }))
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveMaskDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = maskDragRef.current;
    if (!drag || !stage.width || !stage.height || event.buttons !== 1) return;
    const dx = ((event.clientX - drag.startX) / stage.width) * project.timeline.width;
    const dy = ((event.clientY - drag.startY) / stage.height) * project.timeline.height;
    if (drag.mode === "resize") {
      const horizontal = drag.corner?.includes("w") ? -dx : dx;
      const vertical = drag.corner?.includes("n") ? -dy : dy;
      const nextWidth = Math.max(8, Math.round(drag.originWidth + horizontal * 2));
      const nextHeight = Math.max(8, Math.round(drag.originHeight + vertical * 2));
      if (drag.type === "bezier" && drag.originPoints?.length) {
        setClipMaskTransient(drag.clipId, drag.maskId, {
          width: nextWidth,
          height: nextHeight,
          points: scalePoints(drag.originPoints, { x: drag.originX, y: drag.originY }, nextWidth / Math.max(1, drag.originWidth), nextHeight / Math.max(1, drag.originHeight))
        });
        return;
      }
      setClipMaskTransient(drag.clipId, drag.maskId, {
        width: nextWidth,
        height: nextHeight
      });
      return;
    }
    if (drag.mode === "rotate") {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + (drag.originX / project.timeline.width) * stage.width;
      const centerY = rect.top + (drag.originY / project.timeline.height) * stage.height;
      const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
      setClipMaskTransient(drag.clipId, drag.maskId, { rotation: Math.round(angle) });
      return;
    }
    const snapX = Math.abs(drag.originX + dx - timelineCenterX) < 16 ? timelineCenterX : drag.originX + dx;
    const snapY = Math.abs(drag.originY + dy - timelineCenterY) < 16 ? timelineCenterY : drag.originY + dy;
    if (drag.type === "bezier" && drag.originPoints?.length) {
      setClipMaskTransient(drag.clipId, drag.maskId, {
        position: { x: Math.round(snapX), y: Math.round(snapY) },
        points: translatePoints(drag.originPoints, snapX - drag.originX, snapY - drag.originY)
      });
      return;
    }
    setClipMaskTransient(drag.clipId, drag.maskId, { position: { x: Math.round(snapX), y: Math.round(snapY) } });
  };

  const endMaskDrag = () => {
    maskDragRef.current = null;
  };

  const beginMaskPointDrag = (event: PointerEvent<SVGCircleElement>, clip: TimelineClip, mask: MaskInstance, point: BezierPoint) => {
    event.stopPropagation();
    selectClip(clip.id, event.shiftKey);
    maskPointDragRef.current = {
      clipId: clip.id,
      maskId: mask.id,
      pointId: point.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
      points: (mask.points ?? []).map((item) => ({ ...item }))
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveMaskPointDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = maskPointDragRef.current;
    if (!drag || event.buttons !== 1 || !stage.width || !stage.height) return;
    const dx = ((event.clientX - drag.startX) / stage.width) * project.timeline.width;
    const dy = ((event.clientY - drag.startY) / stage.height) * project.timeline.height;
    const points = drag.points.map((point) => point.id === drag.pointId
      ? { ...point, x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) }
      : point);
    setClipMaskTransient(drag.clipId, drag.maskId, { points });
  };

  const endMaskPointDrag = () => {
    maskPointDragRef.current = null;
  };

  const acceptCustomMask = (event: PointerEvent<HTMLElement>, clip: TimelineClip, mask: MaskInstance) => {
    event.stopPropagation();
    const bounds = bezierBounds(mask.points, project.timeline);
    setClipMaskTransient(clip.id, mask.id, { ...bounds, draft: false });
  };

  const resetCustomMaskDraft = (event: PointerEvent<HTMLElement>, clip: TimelineClip, mask: MaskInstance) => {
    event.stopPropagation();
    setClipMaskTransient(clip.id, mask.id, { points: [], draft: true });
  };

  const beginCustomMaskDraw = (event: PointerEvent<SVGSVGElement>, clip: TimelineClip, mask: MaskInstance) => {
    if (!mask.draft) return;
    event.stopPropagation();
    selectClip(clip.id, event.shiftKey);
    const point = pointerToTimelinePoint(event, project.timeline);
    const nextPoints = [...(mask.points ?? []), point];
    customMaskDrawRef.current = { clipId: clip.id, maskId: mask.id, points: nextPoints, lastX: point.x, lastY: point.y };
    setClipMaskTransient(clip.id, mask.id, { points: nextPoints });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCustomMaskDraw = (event: PointerEvent<SVGSVGElement>) => {
    if (maskPointDragRef.current) {
      moveMaskPointDrag(event);
      return;
    }
    const draw = customMaskDrawRef.current;
    if (!draw || event.buttons !== 1) return;
    const point = pointerToTimelinePoint(event, project.timeline);
    const distance = Math.hypot(point.x - draw.lastX, point.y - draw.lastY);
    if (distance < CUSTOM_MASK_POINT_DISTANCE) return;
    const nextPoints = [...draw.points, point];
    customMaskDrawRef.current = { ...draw, points: nextPoints, lastX: point.x, lastY: point.y };
    setClipMaskTransient(draw.clipId, draw.maskId, { points: nextPoints });
  };

  const endCustomMaskDraw = () => {
    customMaskDrawRef.current = null;
    endMaskPointDrag();
  };

  return (
    <section className={`preview-panel ${isFullscreen ? "preview-panel-fullscreen" : ""}`} ref={panelRef}>
      <div className="preview-top">
        <button>Fit <ChevronDown size={14} /></button>
        <div />
        <button className={previewUi.safeZones ? "active" : ""} title="Toggle safe zones" onClick={toggleSafeZones}>Safe</button>
        <button className={previewUi.alignmentGuides ? "active" : ""} title="Toggle alignment guides" onClick={toggleAlignmentGuides}>Guides</button>
        <button className={previewUi.effectsBypassed ? "active" : ""} title="Bypass clip effects for preview performance testing" onClick={toggleEffectsBypass}>FX Bypass</button>
        <div className="preview-aspect-control" ref={aspectMenuRef}>
          <button
            aria-expanded={aspectMenuOpen}
            aria-haspopup="menu"
            className={aspectMenuOpen ? "active" : ""}
            title="Change project and preview aspect ratio"
            onClick={() => setAspectMenuOpen((open) => !open)}
          >
            <span className="aspect-ratio-icon" style={{ aspectRatio: `${project.timeline.width} / ${project.timeline.height}` }} />
            {selectedAspectLabel}
            <ChevronDown size={14} />
          </button>
          {aspectMenuOpen && (
            <div className="preview-aspect-menu" role="menu">
              {aspectOptions.map((option, index) => (
                <div className={index === 2 || index === 7 ? "aspect-menu-separator" : ""} key={option.id}>
                  <button
                    className={selectedAspect === option.id ? "active" : ""}
                    role="menuitem"
                    onClick={() => chooseAspect(option.id)}
                  >
                    <Check size={13} />
                    <span>{option.label}</span>
                    {option.ratio && <i className="aspect-option-icon" style={{ aspectRatio: option.ratio }} />}
                  </button>
                  {option.id === "custom" && selectedAspect === "custom" && (
                    <div className="aspect-custom-fields">
                      <label><span>W</span><input type="number" min={240} max={7680} value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} /></label>
                      <label><span>H</span><input type="number" min={240} max={4320} value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} /></label>
                      <button onClick={applyCustomAspect}>Apply</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="preview-resolution-select" title="Set preview and export canvas resolution">
          <select
            aria-label="Preview resolution"
            value={project.exportSettings.resolution === "720p" ? "720p" : "1080p"}
            onChange={(event) => applyExportResolutionPreset(event.target.value as "720p" | "1080p")}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
          <ChevronDown size={14} />
        </label>
        <button title="Snapshot - Coming soon" disabled><Camera size={17} /></button>
        <button title="More preview options - Coming soon" disabled><MoreHorizontal size={18} /></button>
      </div>
      <div className={`viewer ${!mediaSrc && !hasTimelineVisuals ? "viewer-empty" : ""}`} ref={viewerRef}>
        {audioItems.map(({ clip, asset: audioAsset }) => audioAsset?.path ? (
          <audio
            key={clip.id}
            ref={(node) => {
              if (node) audioRefs.current.set(clip.id, node);
              else audioRefs.current.delete(clip.id);
            }}
            src={mediaPathToSrc(audioAsset.path)}
            preload="auto"
          />
        ) : null)}
        {!hasTimelineVisuals && mediaSrc && (
          <div className="preview-stage source-preview-stage" style={{ width: stage.width, height: stage.height }}>
            {asset?.type === "video" && (
              <video
                ref={(node) => {
                  if (node) videoRefs.current.set("preview-asset", node);
                  else videoRefs.current.delete("preview-asset");
                }}
                src={mediaSrc}
                muted
              />
            )}
            {asset?.type === "image" && <img src={mediaSrc} alt="" />}
          </div>
        )}
        {hasTimelineVisuals && (
          <div className={`preview-stage ${customMaskDrawingActive ? "custom-mask-drawing" : ""}`} ref={stageRef} style={{ width: stage.width, height: stage.height }}>
            {(previewUi.alignmentGuides || draggingClipId) && (
              <div className="preview-guides">
                <i className={`guide-v edge start ${snappedGuide.x === "start" ? "active" : ""}`} />
                <i className={`guide-v center ${snappedGuide.x === "center" ? "active" : ""}`} />
                <i className={`guide-v edge end ${snappedGuide.x === "end" ? "active" : ""}`} />
                <i className={`guide-h edge start ${snappedGuide.y === "start" ? "active" : ""}`} />
                <i className={`guide-h center ${snappedGuide.y === "center" ? "active" : ""}`} />
                <i className={`guide-h edge end ${snappedGuide.y === "end" ? "active" : ""}`} />
                <i className={`guide-v third-a ${snappedGuide.x === "third-a" ? "active" : ""}`} />
                <i className={`guide-v third-b ${snappedGuide.x === "third-b" ? "active" : ""}`} />
                <i className={`guide-h third-a ${snappedGuide.y === "third-a" ? "active" : ""}`} />
                <i className={`guide-h third-b ${snappedGuide.y === "third-b" ? "active" : ""}`} />
              </div>
            )}
            {previewUi.safeZones && (
              <div className="safe-zones">
                <i className="safe-zone action" />
                <i className="safe-zone title" />
              </div>
            )}
            {visualItems.map(({ track, clip, asset: visualAsset }) => {
              const src = visualAsset?.path ? mediaPathToSrc(visualAsset.path) : undefined;
              if (!src || !visualAsset) return null;
              const backgroundRemoval = normalizeBackgroundRemovalSettings(clip.backgroundRemoval);
              const useKeyedPreview = (visualAsset.type === "video" || visualAsset.type === "image") && backgroundRemoval.enabled && backgroundRemoval.mode !== "off" && backgroundRemoval.mode !== "difference-key";
              if (visualAsset.type === "video") {
                return (
                  <div
                    className={`preview-media-frame ${clip.crop ? "cropped" : ""} ${isPreviewClipSelected(clip) ? "selected" : ""} ${useKeyedPreview ? "preview-keyed-frame" : ""}`}
                    key={clip.id}
                    onPointerDown={(event) => beginPreviewDrag(event, clip)}
                    style={{ ...mediaFrameStyle(clip, track, visualAsset), ...keyedPreviewBackgroundStyle(clip) }}
                  >
                    {useKeyedPreview ? (
                      <KeyedCanvasMedia
                        clip={clip}
                        src={src}
                        sourceType="video"
                        contentStyle={mediaContentStyle(clip, track)}
                        registerVideo={(clipId, node) => {
                          if (node) videoRefs.current.set(clipId, node);
                          else videoRefs.current.delete(clipId);
                        }}
                        muted={track.muted || clip.muted || (clip.audio?.muted ?? false)}
                      />
                    ) : (
                      <video
                        className="preview-media-content"
                        ref={(node) => {
                          if (node) videoRefs.current.set(clip.id, node);
                          else videoRefs.current.delete(clip.id);
                        }}
                        src={src}
                        muted={track.muted || clip.muted || (clip.audio?.muted ?? false)}
                        style={mediaContentStyle(clip, track)}
                      />
                    )}
                    <PreviewVisualOverlays enabled={!useKeyedPreview} />
                    {isPreviewClipSelected(clip) && (
                      <>
                        <i
                          className="preview-text-handle scale preview-visual-handle"
                          title="Drag to scale clip"
                          onPointerDown={(event) => beginTextTransformDrag(event, clip, "scale")}
                          onPointerMove={moveTextTransformDrag}
                          onPointerUp={endTextTransformDrag}
                          onPointerCancel={endTextTransformDrag}
                        />
                        <i
                          className="preview-text-handle rotate preview-visual-handle"
                          title="Drag to rotate clip"
                          onPointerDown={(event) => beginTextTransformDrag(event, clip, "rotate")}
                          onPointerMove={moveTextTransformDrag}
                          onPointerUp={endTextTransformDrag}
                          onPointerCancel={endTextTransformDrag}
                        />
                      </>
                    )}
                  </div>
                );
              }
              return (
                <div
                  className={`preview-media-frame ${clip.crop ? "cropped" : ""} ${isPreviewClipSelected(clip) ? "selected" : ""} ${useKeyedPreview ? "preview-keyed-frame" : ""}`}
                  key={clip.id}
                  onPointerDown={(event) => beginPreviewDrag(event, clip)}
                  style={{ ...mediaFrameStyle(clip, track, visualAsset), ...keyedPreviewBackgroundStyle(clip) }}
                >
                  {useKeyedPreview ? (
                    <KeyedCanvasMedia
                      clip={clip}
                      src={src}
                      sourceType="image"
                      contentStyle={mediaContentStyle(clip, track)}
                    />
                  ) : (
                    <img className="preview-media-content" src={src} alt="" style={mediaContentStyle(clip, track)} />
                  )}
                  <PreviewVisualOverlays enabled={!useKeyedPreview} />
                  {isPreviewClipSelected(clip) && (
                    <>
                      <i
                        className="preview-text-handle scale preview-visual-handle"
                        title="Drag to scale clip"
                        onPointerDown={(event) => beginTextTransformDrag(event, clip, "scale")}
                        onPointerMove={moveTextTransformDrag}
                        onPointerUp={endTextTransformDrag}
                        onPointerCancel={endTextTransformDrag}
                      />
                      <i
                        className="preview-text-handle rotate preview-visual-handle"
                        title="Drag to rotate clip"
                        onPointerDown={(event) => beginTextTransformDrag(event, clip, "rotate")}
                        onPointerMove={moveTextTransformDrag}
                        onPointerUp={endTextTransformDrag}
                        onPointerCancel={endTextTransformDrag}
                      />
                    </>
                  )}
                </div>
              );
            })}
            {visualItems.filter(({ clip }) => isPreviewClipSelected(clip)).map(({ track, clip }) => {
              const masks = normalizeMasks(clip.masks, project.timeline)
                .map((mask) => evaluateMaskAtTime(mask, clip, displayTime))
                .filter((mask) => mask.enabled);
              const customMask = masks.find((mask) => mask.type === "bezier");
              const boundaryMasks = [
                ...masks.filter((mask) => mask.type !== "bezier"),
                ...(customMask && !customMask.draft ? [{ ...customMask, ...bezierBounds(customMask.points, project.timeline) }] : [])
              ];
              const layerStyle: CSSProperties = {
                ...mediaFrameStyle(clip, track, clip.assetId ? project.assets[clip.assetId] : undefined),
                WebkitMaskImage: undefined,
                maskImage: undefined,
                overflow: "visible",
                pointerEvents: customMask ? "auto" : "none"
              };
              return (
                <div className="preview-mask-layer" key={`mask-layer-${clip.id}`} style={layerStyle}>
                  {customMask && (
                    <svg
                      className={`preview-custom-mask-surface ${customMask.draft ? "draft" : "accepted"}`}
                      viewBox={`0 0 ${project.timeline.width} ${project.timeline.height}`}
                      preserveAspectRatio="none"
                      onPointerDown={(event) => beginCustomMaskDraw(event, clip, customMask)}
                      onPointerMove={moveCustomMaskDraw}
                      onPointerUp={endCustomMaskDraw}
                      onPointerCancel={endCustomMaskDraw}
                    >
                      <path className="preview-custom-mask-path" d={customMaskPath(customMask.points ?? [])} />
                      {(customMask.points ?? []).map((point, index) => (
                        <g key={point.id}>
                          <circle
                            className="preview-custom-mask-point"
                            cx={point.x}
                            cy={point.y}
                            r={9}
                            onPointerDown={customMask.draft ? (event) => beginMaskPointDrag(event, clip, customMask, point) : undefined}
                          />
                          <text className="preview-custom-mask-label" x={point.x + 12} y={point.y - 10}>{index + 1}</text>
                        </g>
                      ))}
                    </svg>
                  )}
                  {customMask?.draft && (
                    <div className="preview-custom-mask-actions">
                      <button disabled={(customMask.points?.length ?? 0) < 3} onPointerDown={(event) => acceptCustomMask(event, clip, customMask)}>Accept Shape</button>
                      <button onPointerDown={(event) => resetCustomMaskDraft(event, clip, customMask)}>Reset Path</button>
                    </div>
                  )}
                  {boundaryMasks.map((mask) => {
                    const x = (mask.position.x / project.timeline.width) * 100;
                    const y = (mask.position.y / project.timeline.height) * 100;
                    const width = ((mask.width + mask.expansion * 2) / project.timeline.width) * 100 * mask.scale;
                    const height = ((mask.height + mask.expansion * 2) / project.timeline.height) * 100 * mask.scale;
                return (
                  <div
                    className={`preview-mask-boundary mask-${mask.type}`}
                    key={`${clip.id}-${mask.id}`}
                    onPointerDown={(event) => beginMaskDrag(event, clip, mask, "move")}
                    onPointerMove={moveMaskDrag}
                    onPointerUp={endMaskDrag}
                    onPointerCancel={endMaskDrag}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      borderRadius: mask.type === "circle" || mask.type === "ellipse" ? "999px" : mask.type === "rounded-rectangle" ? Math.min(32, mask.cornerRadius ?? 0) : 4,
                      transform: `translate(-50%, -50%) rotate(${mask.rotation}deg)`,
                      opacity: 0.8
                    }}
                  >
                    <i className="mask-handle nw" onPointerDown={(event) => beginMaskDrag(event, clip, mask, "resize", "nw")} />
                    <i className="mask-handle ne" onPointerDown={(event) => beginMaskDrag(event, clip, mask, "resize", "ne")} />
                    <i className="mask-handle sw" onPointerDown={(event) => beginMaskDrag(event, clip, mask, "resize", "sw")} />
                    <i className="mask-handle se" onPointerDown={(event) => beginMaskDrag(event, clip, mask, "resize", "se")} />
                    <i className="mask-rotate-handle" onPointerDown={(event) => beginMaskDrag(event, clip, mask, "rotate")} />
                  </div>
                );
                  })}
                </div>
              );
            })}
            {textClips.map((clip) => {
              const transform = transformFor(clip);
              const animation = resolveTextAnimation(clip, displayTime, clip.text?.text ?? "");
              const x = stage.width ? (transform.x / project.timeline.width) * stage.width : 0;
              const y = stage.height ? (transform.y / project.timeline.height) * stage.height : 0;
              const filter = animation.blur > 0.01 ? `blur(${animation.blur.toFixed(2)}px)` : undefined;
              return (
                <div
                  className={`preview-text ${isPreviewClipSelected(clip) ? "selected" : ""}`}
                  key={clip.id}
                  onPointerDown={(event) => beginPreviewDrag(event, clip)}
                  style={{
                    left: 0,
                    top: 0,
                    fontFamily: clip.text?.fontFamily,
                    fontSize: Math.round((clip.text?.fontSize ?? 48) * 0.33),
                    fontWeight: clip.text?.fontWeight,
                    color: clip.text?.color,
                    background: clip.text?.background === "transparent" ? undefined : clip.text?.background,
                    textAlign: clip.text?.align,
                    ...textDecorationStyle(clip.text),
                    transform: `translate3d(${x + animation.translateX}px, ${y + animation.translateY}px, 0) translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale * animation.scaleX}, ${transform.scale * animation.scaleY})`,
                    opacity: transform.opacity * animation.opacity,
                    filter
                  }}
                >
                  {renderCurvedText(animation.visibleText ?? "", clip.text)}
                  {isPreviewClipSelected(clip) && (
                    <>
                      <i
                        className="preview-text-handle scale"
                        title="Drag to scale text"
                        onPointerDown={(event) => beginTextTransformDrag(event, clip, "scale")}
                        onPointerMove={moveTextTransformDrag}
                        onPointerUp={endTextTransformDrag}
                        onPointerCancel={endTextTransformDrag}
                      />
                      <i
                        className="preview-text-handle rotate"
                        title="Drag to rotate text"
                        onPointerDown={(event) => beginTextTransformDrag(event, clip, "rotate")}
                        onPointerMove={moveTextTransformDrag}
                        onPointerUp={endTextTransformDrag}
                        onPointerCancel={endTextTransformDrag}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!mediaSrc && !hasTimelineVisuals && (
          <div className="preview-stage preview-placeholder" style={{ width: stage.width, height: stage.height }}>
            <div className="preview-screen-graphic" style={{ aspectRatio: `${project.timeline.width} / ${project.timeline.height}` }}>
              <div className="screen-sky" />
              <div className="screen-ridge ridge-back" />
              <div className="screen-ridge ridge-front" />
              <div className="screen-lake" />
              <div className="screen-shine" />
            </div>
            <span>Import media and add it to the timeline</span>
          </div>
        )}
      </div>
      <div className="preview-controls">
        <div
          aria-label="Preview seek bar"
          className="preview-scrub-bar"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(previewDuration * 1000)}
          aria-valuenow={Math.round(displayTime * 1000)}
          tabIndex={0}
          onPointerDown={beginPreviewScrub}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) seekPreviewFromPointer(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Home") setPlayhead(0);
            if (event.key === "End") setPlayhead(previewDuration);
          }}
        >
          <i style={{ width: `${Math.min(100, Math.max(0, (displayTime / previewDuration) * 100))}%` }} />
        </div>
        <div className="preview-control-row">
          <strong>{formatTimecode(displayTime, project.timeline.fps)}</strong>
          <span>/ {formatTimecode(previewDuration, project.timeline.fps)}</span>
          <div className="transport">
            <button title="Start" onClick={() => setPlayhead(0)}><SkipBack size={17} /></button>
            <button title="Back one frame" onClick={() => stepPlayhead(-1)}><Rewind size={17} /></button>
            <button className="play" onClick={() => setPlaying(!isPlaying)}>{isPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}</button>
            <button title="Forward one frame" onClick={() => stepPlayhead(1)}><Redo2 size={17} /></button>
            <button title="Forward five seconds" onClick={() => setPlayhead(Math.min(previewDuration, displayTime + 5))}><SkipForward size={17} /></button>
          </div>
          <div className="viewer-tools">
            <button title="Volume"><Volume2 size={17} /></button>
            <input aria-label="Preview volume" type="range" min={0} max={1} step={0.01} defaultValue={0.6} />
            <button title={isFullscreen ? "Exit fullscreen preview" : "Fullscreen preview"} onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
