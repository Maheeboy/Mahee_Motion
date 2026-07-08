use super::ffmpeg::{cache_dir, ffmpeg_bin, write_concat_list};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub phase: String,
    pub progress: f32,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub source_path: String,
    pub source_type: Option<String>,
    pub source_in: f64,
    pub duration: f64,
    pub speed: Option<f64>,
    pub include_audio: Option<bool>,
    pub effects: Option<Vec<ExportEffect>>,
    pub color_grade: Option<ExportColorGrade>,
    pub background_removal: Option<ExportBackgroundRemoval>,
    pub video_animations: Option<ExportClipAnimations>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClipAnimations {
    pub r#in: Option<ExportClipAnimation>,
    pub out: Option<ExportClipAnimation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClipAnimation {
    pub r#type: String,
    pub enabled: bool,
    pub duration: f64,
    pub delay: f64,
    pub intensity: f64,
    pub easing: Option<String>,
    pub direction: Option<String>,
    pub distance: Option<f64>,
    pub scale_amount: Option<f64>,
    pub rotation_amount: Option<f64>,
    pub blur_amount: Option<f64>,
    pub wipe_softness: Option<f64>,
    pub anchor_x: Option<f64>,
    pub anchor_y: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEffect {
    pub effect_type: Option<String>,
    #[serde(default)]
    pub r#type: String,
    pub enabled: Option<bool>,
    pub intensity: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportColorGrade {
    pub enabled: bool,
    pub compatibility: Option<String>,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub gamma: f64,
    pub hue: f64,
    pub temperature: f64,
    pub tint: f64,
    pub shadows: f64,
    pub highlights: f64,
    pub fade: f64,
    pub grain_amount: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBackgroundRemoval {
    pub enabled: bool,
    pub mode: String,
    pub key_color: String,
    pub tolerance: f64,
    pub softness: f64,
    pub feather: f64,
    pub luma_threshold: f64,
    pub luma_softness: f64,
    pub export_status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub output_path: String,
    pub resolution: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: u32,
    pub video_bitrate: String,
    pub audio_bitrate: String,
    pub clips: Vec<ExportClip>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAudioClip {
    pub source_path: String,
    pub source_in: f64,
    pub duration: f64,
    pub timeline_start: f64,
    pub speed: f64,
    pub volume: f64,
    pub fade_in: f64,
    pub fade_out: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAudioRequest {
    pub output_path: String,
    pub audio_bitrate: String,
    pub sample_rate: Option<u32>,
    pub clips: Vec<ExportAudioClip>,
}

#[tauri::command]
pub async fn export_timeline(app: AppHandle, request: ExportRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || export_blocking(app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn export_audio_only(app: AppHandle, request: ExportAudioRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || export_audio_blocking(app, request))
        .await
        .map_err(|error| error.to_string())?
}

fn export_audio_blocking(app: AppHandle, request: ExportAudioRequest) -> Result<String, String> {
    if request.clips.is_empty() {
        return Err("Add at least one audible audio or video clip before exporting audio.".to_string());
    }

    emit(&app, "prepare", 0.05, "Preparing audio mix");
    let mut command = Command::new(ffmpeg_bin());
    command.arg("-y");
    for clip in &request.clips {
        command
            .args(["-ss", &format!("{:.3}", clip.source_in.max(0.0))])
            .args(["-t", &format!("{:.3}", clip.duration.max(0.05))])
            .arg("-i")
            .arg(&clip.source_path);
    }

    let mut chains = Vec::new();
    let mut labels = Vec::new();
    for (index, clip) in request.clips.iter().enumerate() {
        let label = format!("a{index}");
        labels.push(format!("[{label}]"));
        chains.push(format!(
            "[{index}:a]atrim=0:{duration:.3},asetpts=PTS-STARTPTS,{tempo},volume={volume:.5},afade=t=in:st=0:d={fade_in:.3},afade=t=out:st={fade_start:.3}:d={fade_out:.3},adelay={delay}|{delay}[{label}]",
            duration = clip.duration.max(0.05),
            tempo = atempo_filter(clip.speed),
            volume = clip.volume.clamp(0.0, 2.0),
            fade_in = clip.fade_in.clamp(0.0, clip.duration.max(0.05)),
            fade_start = (clip.duration - clip.fade_out.max(0.0)).max(0.0),
            fade_out = clip.fade_out.clamp(0.0, clip.duration.max(0.05)),
            delay = (clip.timeline_start.max(0.0) * 1000.0).round() as u64,
            label = label
        ));
    }
    let mix = if request.clips.len() == 1 {
        format!("{}anull[aout]", labels[0])
    } else {
        format!(
            "{}amix=inputs={}:duration=longest:normalize=0,alimiter=limit=0.95[aout]",
            labels.join(""),
            request.clips.len()
        )
    };
    chains.push(mix);
    let filter = chains.join(";");

    emit(&app, "mix", 0.35, "Mixing timeline audio");
    let status = command
        .args(["-filter_complex", &filter, "-map", "[aout]", "-vn"])
        .args(["-c:a", "aac", "-b:a", &request.audio_bitrate])
        .args(["-ar", &request.sample_rate.unwrap_or(48000).to_string(), "-movflags", "+faststart"])
        .arg(&request.output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("ffmpeg audio export failed to start: {error}"))?;

    if !status.success() {
        return Err("FFmpeg failed while exporting audio-only mix.".to_string());
    }

    emit(&app, "done", 1.0, "Audio export complete");
    Ok(request.output_path)
}

fn export_blocking(app: AppHandle, request: ExportRequest) -> Result<String, String> {
    if request.clips.is_empty() {
        return Err("Add at least one video clip before exporting.".to_string());
    }

    emit(&app, "prepare", 0.02, "Preparing export");
    let mut segments = Vec::new();
    let total = request.clips.len().max(1) as f32;

    for (index, clip) in request.clips.iter().enumerate() {
        let segment = cache_dir()?.join(format!("segment-{}.mp4", Uuid::new_v4()));
        transcode_segment(clip, &segment, &request)?;
        segments.push(segment);
        emit(
            &app,
            "segments",
            0.05 + ((index + 1) as f32 / total) * 0.7,
            &format!("Rendered segment {}", index + 1),
        );
    }

    emit(&app, "concat", 0.82, "Combining clips");
    let list_path = write_concat_list(&segments)?;
    let status = Command::new(ffmpeg_bin())
        .args(["-y", "-f", "concat", "-safe", "0", "-i"])
        .arg(&list_path)
        .args([
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            &request.output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("ffmpeg concat failed to start: {error}"))?;

    if !status.success() {
        return Err("FFmpeg failed while combining rendered segments.".to_string());
    }

    emit(&app, "done", 1.0, "Export complete");
    Ok(request.output_path)
}

fn transcode_segment(clip: &ExportClip, output: &PathBuf, request: &ExportRequest) -> Result<(), String> {
    let size = if let (Some(width), Some(height)) = (request.width, request.height) {
        format!("{}:{}", width.max(320), height.max(240))
    } else {
        match request.resolution.as_str() {
            "720p" => "1280:720".to_string(),
            _ => "1920:1080".to_string(),
        }
    };
    let ss = format!("{:.3}", clip.source_in.max(0.0));
    let duration = format!("{:.3}", clip.duration.max(0.05));
    let fps = request.frame_rate.to_string();
    let speed = clip.speed.unwrap_or(1.0).clamp(0.25, 4.0);
    let video_filter = build_video_filter(&size, speed, clip);

    let mut command = Command::new(ffmpeg_bin());
    command.arg("-y");
    if clip.source_type.as_deref() == Some("image") {
        command.args(["-loop", "1", "-t", &duration, "-i", &clip.source_path]);
    } else {
        command.args(["-ss", &ss, "-t", &duration, "-i", &clip.source_path]);
    }
    command.args([
            "-vf",
            &video_filter,
            "-r",
            &fps,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-b:v",
            &request.video_bitrate,
        ]);

    if clip.source_type.as_deref() != Some("image") && clip.include_audio.unwrap_or(true) {
        let audio_filter = atempo_filter(speed);
        command.args(["-af", &audio_filter, "-c:a", "aac", "-b:a", &request.audio_bitrate, "-shortest"]);
    } else {
        command.arg("-an");
    }

    let status = command
        .arg(output)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("ffmpeg segment failed to start: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("FFmpeg failed while rendering {}", clip.source_path))
    }
}

fn build_video_filter(size: &str, speed: f64, clip: &ExportClip) -> String {
    let mut filters = vec![
        format!("scale={size}:force_original_aspect_ratio=decrease"),
        format!("pad={size}:((ow-iw)/2):((oh-ih)/2)"),
    ];
    filters.extend(ffmpeg_filters_for_animations(clip));
    for effect in clip.effects.as_deref().unwrap_or(&[]) {
        if let Some(filter) = ffmpeg_filter_for_effect(effect) {
            filters.extend(filter.split(',').map(|item| item.to_string()));
        }
    }
    if let Some(color_filter) = ffmpeg_filter_for_color(clip.color_grade.as_ref()) {
        filters.extend(color_filter.split(',').map(|item| item.to_string()));
    }
    if let Some(key_filter) = ffmpeg_filter_for_background_removal(clip.background_removal.as_ref()) {
        filters.extend(key_filter.split(',').map(|item| item.to_string()));
    }
    filters.push(format!("setpts=PTS/{speed:.5}"));
    filters.join(",")
}

fn ffmpeg_filters_for_animations(clip: &ExportClip) -> Vec<String> {
    let mut filters = Vec::new();
    let duration = clip.duration.max(0.05);
    if let Some(animations) = clip.video_animations.as_ref() {
        if let Some(filter) = ffmpeg_filter_for_animation(animations.r#in.as_ref(), true, duration) {
            filters.push(filter);
        }
        if let Some(filter) = ffmpeg_filter_for_animation(animations.out.as_ref(), false, duration) {
            filters.push(filter);
        }
    }
    filters
}

fn ffmpeg_filter_for_animation(animation: Option<&ExportClipAnimation>, incoming: bool, clip_duration: f64) -> Option<String> {
    let animation = animation?;
    if !animation.enabled || animation.r#type == "none" {
        return None;
    }
    let _reserved_for_compositor = (
        animation.easing.as_deref(),
        animation.direction.as_deref(),
        animation.distance,
        animation.scale_amount,
        animation.rotation_amount,
        animation.wipe_softness,
        animation.anchor_x,
        animation.anchor_y,
    );
    let duration = animation.duration.clamp(0.05, clip_duration.max(0.05));
    let delay = animation.delay.clamp(0.0, clip_duration.max(0.0));
    let start = if incoming {
        delay.min((clip_duration - duration).max(0.0))
    } else {
        (clip_duration - delay - duration).max(0.0)
    };
    match animation.r#type.as_str() {
        "fade" => Some(format!(
            "fade=t={}:st={start:.3}:d={duration:.3}",
            if incoming { "in" } else { "out" }
        )),
        "blur" => {
            let blur = animation.blur_amount.unwrap_or(10.0).clamp(0.0, 40.0) * animation.intensity.clamp(0.0, 2.0);
            if blur <= 0.01 {
                None
            } else {
                Some(format!(
                    "boxblur=luma_radius={:.2}:luma_power=1:enable='between(t\\,{start:.3}\\,{:.3})'",
                    blur / 3.0,
                    start + duration
                ))
            }
        }
        _ => None,
    }
}

fn ffmpeg_filter_for_color(color: Option<&ExportColorGrade>) -> Option<String> {
    let color = color?;
    if !color.enabled {
        return None;
    }
    let compatibility = color.compatibility.as_deref().unwrap_or("fully-supported");
    if compatibility == "unsupported" {
        return None;
    }
    let brightness = color.brightness.clamp(-1.0, 1.0);
    let contrast = color.contrast.clamp(0.1, 3.0);
    let saturation = color.saturation.clamp(0.0, 3.0);
    let gamma = color.gamma.clamp(0.1, 10.0);
    let hue = color.hue.clamp(-180.0, 180.0);
    let warm = (color.temperature / 100.0).clamp(-1.0, 1.0);
    let tint = (color.tint / 100.0).clamp(-1.0, 1.0);
    let shadows = (color.shadows / 100.0).clamp(-1.0, 1.0);
    let highlights = (color.highlights / 100.0).clamp(-1.0, 1.0);
    let fade = (color.fade / 100.0).clamp(0.0, 1.0);
    let grain = color.grain_amount.clamp(0.0, 100.0);
    let mut filters = vec![
        format!(
            "eq=brightness={brightness:.5}:contrast={contrast:.5}:saturation={saturation:.5}:gamma={gamma:.5}"
        ),
        format!("hue=h={hue:.3}"),
        format!(
            "colorbalance=rs={:.5}:gs={:.5}:bs={:.5}:rh={:.5}:gh={:.5}:bh={:.5}",
            (warm * 0.055 + tint * 0.018 + shadows * 0.025 + fade * 0.02).clamp(-1.0, 1.0),
            (-tint * 0.025 + shadows * 0.012).clamp(-1.0, 1.0),
            (-warm * 0.055 + shadows * 0.01).clamp(-1.0, 1.0),
            (warm * 0.035 + highlights * 0.018).clamp(-1.0, 1.0),
            (-tint * 0.018).clamp(-1.0, 1.0),
            (-warm * 0.035 + highlights * 0.012).clamp(-1.0, 1.0),
        ),
    ];
    if grain > 0.0 {
        filters.push(format!("noise=alls={:.2}:allf=t+u", grain * 0.32));
    }
    Some(filters.join(","))
}

fn ffmpeg_filter_for_background_removal(settings: Option<&ExportBackgroundRemoval>) -> Option<String> {
    let settings = settings?;
    if !settings.enabled || settings.mode == "off" || settings.export_status.as_deref() == Some("unsupported") {
        return None;
    }
    if settings.mode == "luma-key" {
        return Some(format!(
            "lumakey=threshold={:.3}:tolerance={:.3}:softness={:.3}",
            settings.luma_threshold.clamp(0.0, 1.0),
            settings.luma_softness.clamp(0.001, 1.0),
            settings.feather.clamp(0.0, 0.5)
        ));
    }
    if settings.mode == "green-screen" || settings.mode == "blue-screen" || settings.mode == "custom-color" {
        let color = settings.key_color.trim_start_matches('#');
        if color.len() != 6 || !color.chars().all(|item| item.is_ascii_hexdigit()) {
            return None;
        }
        return Some(format!(
            "chromakey=0x{}:{:.3}:{:.3}",
            color,
            settings.tolerance.clamp(0.0, 1.0),
            settings.softness.max(settings.feather).clamp(0.0, 1.0)
        ));
    }
    None
}

fn ffmpeg_filter_for_effect(effect: &ExportEffect) -> Option<String> {
    if !effect.enabled.unwrap_or(true) {
        return None;
    }
    let intensity = effect.intensity.unwrap_or(0.0).clamp(0.0, 1.0);
    if intensity <= 0.0 {
        return None;
    }
    let effect_type = if effect.r#type.is_empty() {
        effect.effect_type.as_deref().unwrap_or("")
    } else {
        effect.r#type.as_str()
    };
    match effect_type {
        "film-grain" => Some(format!("noise=alls={:.1}:allf=t+u", intensity * 18.0)),
        "vignette" => Some(format!("vignette=PI/4*{:.3}", intensity * 0.8)),
        "glow" => Some(format!(
            "eq=brightness={:.3}:saturation={:.3}",
            intensity * 0.04,
            1.0 + intensity * 0.12
        )),
        "rgb-split" => Some(format!(
            "chromashift=cbh={}:crh={}",
            (intensity * 6.0).round() as i32,
            -((intensity * 6.0).round() as i32)
        )),
        "vhs" => Some(format!(
            "eq=saturation={:.3}:contrast={:.3},noise=alls={:.1}:allf=t",
            1.0 - intensity * 0.18,
            1.0 - intensity * 0.08,
            intensity * 9.0
        )),
        "light-leak" => Some(format!(
            "eq=brightness={:.3}:saturation={:.3}",
            intensity * 0.035,
            1.0 + intensity * 0.08
        )),
        _ => None,
    }
}

fn atempo_filter(speed: f64) -> String {
    let mut remaining = speed.clamp(0.25, 4.0);
    let mut filters = Vec::new();
    while remaining > 2.0 {
        filters.push("atempo=2.00000".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        filters.push("atempo=0.50000".to_string());
        remaining /= 0.5;
    }
    filters.push(format!("atempo={remaining:.5}"));
    filters.join(",")
}

fn emit(app: &AppHandle, phase: &str, progress: f32, message: &str) {
    let _ = app.emit(
        "export-progress",
        ExportProgress {
            phase: phase.to_string(),
            progress,
            message: message.to_string(),
        },
    );
}
