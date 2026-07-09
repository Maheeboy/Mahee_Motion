/* global AudioBuffer, Blob, CanvasRenderingContext2D, FileSystemFileHandle, HTMLImageElement, Image, MediaRecorder, OfflineAudioContext, URL, fetch */
import type { ExportAudioClip, ExportRenderClip, Project } from "../types/editor";

interface BrowserExportOptions {
  project: Project;
  visualClips: ExportRenderClip[];
  audioClips: ExportAudioClip[];
  fileHandle?: FileSystemFileHandle;
  filename: string;
  onProgress?: (progress: number, message: string) => void;
}

export async function exportVideoInBrowser(options: BrowserExportOptions): Promise<string> {
  if (!options.visualClips.length) throw new Error("Add at least one visible video or image clip before exporting.");
  const duration = Math.max(0.1, timelineDuration(options.visualClips, options.audioClips));
  const width = Math.max(320, Math.min(options.project.timeline.width, 1920));
  const height = Math.max(240, Math.round(width * options.project.timeline.height / options.project.timeline.width));
  const frameRate = Math.min(30, Math.max(12, options.project.exportSettings.frameRate));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser canvas export is not available.");

  const media = await loadVisualMedia(options.visualClips);
  const stream = canvas.captureStream(frameRate);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Browser video export failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
  });

  recorder.start(500);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const draw = () => {
      const elapsed = (performance.now() - start) / 1000;
      const time = Math.min(duration, elapsed);
      drawFrame(context, width, height, options.visualClips, media, time, options.project);
      options.onProgress?.(Math.min(0.98, time / duration), "Rendering browser video");
      if (time >= duration) {
        resolve();
        return;
      }
      window.requestAnimationFrame(draw);
    };
    draw();
  });
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await done;
  await saveBlob(blob, options.fileHandle, ensureExtension(options.filename, ".webm"));
  options.onProgress?.(1, "Browser export complete");
  return options.fileHandle?.name ?? ensureExtension(options.filename, ".webm");
}

export async function exportAudioInBrowser(options: BrowserExportOptions): Promise<string> {
  if (!options.audioClips.length) throw new Error("Add at least one audible audio or video clip before exporting audio.");
  const duration = Math.max(0.1, timelineDuration(options.visualClips, options.audioClips));
  const sampleRate = options.project.timeline.sampleRate || 48000;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  for (const clip of options.audioClips) {
    try {
      const response = await fetch(clip.sourcePath);
      const buffer = await offline.decodeAudioData(await response.arrayBuffer());
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.25, Math.min(4, clip.speed || 1));
      const gain = offline.createGain();
      gain.gain.value = Math.max(0, Math.min(2, clip.volume));
      source.connect(gain).connect(offline.destination);
      source.start(Math.max(0, clip.timelineStart), Math.max(0, clip.sourceIn), Math.max(0.05, clip.duration * Math.max(0.25, clip.speed || 1)));
    } catch {
      // Skip browser-undecodable sources instead of aborting the whole mix.
    }
  }

  options.onProgress?.(0.15, "Mixing browser audio");
  const rendered = await offline.startRendering();
  options.onProgress?.(0.9, "Encoding WAV");
  const blob = audioBufferToWav(rendered);
  await saveBlob(blob, options.fileHandle, ensureExtension(options.filename, ".wav"));
  options.onProgress?.(1, "Browser audio export complete");
  return options.fileHandle?.name ?? ensureExtension(options.filename, ".wav");
}

async function saveBlob(blob: Blob, handle: FileSystemFileHandle | undefined, filename: string) {
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function loadVisualMedia(clips: ExportRenderClip[]) {
  const entries = await Promise.all(clips.map(async (clip) => {
    if (clip.sourceType === "image") {
      const image = new Image();
      image.decoding = "async";
      image.src = clip.sourcePath;
      await image.decode().catch(() => new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      }));
      return [clip.id, image] as const;
    }
    const video = document.createElement("video");
    video.src = clip.sourcePath;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Could not load ${clip.sourcePath}`));
    });
    void video.play().catch(() => undefined);
    video.pause();
    return [clip.id, video] as const;
  }));
  return new Map<string, HTMLImageElement | HTMLVideoElement>(entries);
}

function drawFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  clips: ExportRenderClip[],
  media: Map<string, HTMLImageElement | HTMLVideoElement>,
  time: number,
  project: Project
) {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const trackOrder = new Map(project.timeline.tracks.map((track) => [track.id, track.order]));
  const active = clips
    .filter((clip) => time >= clip.timelineStart && time <= clip.timelineStart + clip.duration)
    .sort((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0));
  for (const clip of active) {
    const item = media.get(clip.id);
    if (!item) continue;
    if (item instanceof HTMLVideoElement) {
      const desired = clip.sourceIn + Math.max(0, time - clip.timelineStart) * Math.max(0.25, clip.speed || 1);
      if (Number.isFinite(desired) && Math.abs(item.currentTime - desired) > 0.12) {
        try { item.currentTime = desired; } catch { /* ignored */ }
      }
    }
    drawContain(context, item, width, height);
  }
}

function drawContain(context: CanvasRenderingContext2D, media: HTMLImageElement | HTMLVideoElement, width: number, height: number) {
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function timelineDuration(visualClips: ExportRenderClip[], audioClips: ExportAudioClip[]) {
  return Math.max(
    0,
    ...visualClips.map((clip) => clip.timelineStart + clip.duration),
    ...audioClips.map((clip) => clip.timelineStart + clip.duration)
  );
}

function ensureExtension(filename: string, extension: ".webm" | ".wav") {
  return filename.replace(/\.(mp4|m4a|webm|wav)$/i, "") + extension;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length * channels * 2 + 44;
  const view = new DataView(new ArrayBuffer(length));
  writeString(view, 0, "RIFF");
  view.setUint32(4, length - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length - 44, true);
  let offset = 44;
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let index = 0; index < buffer.length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel][index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}
