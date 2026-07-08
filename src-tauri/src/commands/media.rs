use super::ffmpeg::{cache_dir, extension_lower, ffmpeg_bin, generate_thumbnail, run_ffprobe};
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbe {
    pub id: String,
    pub path: String,
    pub name: String,
    pub media_type: String,
    pub duration: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub thumbnail_path: Option<String>,
    pub waveform: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAudio {
    pub path: String,
}

#[tauri::command]
pub async fn probe_media(path: String) -> Result<MediaProbe, String> {
    tauri::async_runtime::spawn_blocking(move || probe_media_blocking(path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn extract_audio_from_video(path: String, clip_name: String) -> Result<ExtractedAudio, String> {
    tauri::async_runtime::spawn_blocking(move || extract_audio_from_video_blocking(path, clip_name))
        .await
        .map_err(|error| error.to_string())?
}

fn extract_audio_from_video_blocking(path: String, clip_name: String) -> Result<ExtractedAudio, String> {
    let safe_stem = sanitize_file_stem(&clip_name);
    let output_path = cache_dir()?.join(format!("{}-audio-{}.m4a", safe_stem, uuid::Uuid::new_v4()));
    let status = Command::new(ffmpeg_bin())
        .args([
            "-y",
            "-i",
            &path,
            "-vn",
            "-map",
            "0:a:0",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
        ])
        .arg(&output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("ffmpeg audio extraction failed to start: {error}"))?;

    if status.success() && output_path.exists() {
        Ok(ExtractedAudio {
            path: output_path.to_string_lossy().to_string(),
        })
    } else {
        Err("No extractable audio stream was found in this video.".to_string())
    }
}

fn sanitize_file_stem(value: &str) -> String {
    let stem = std::path::Path::new(value)
        .file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or("extracted");
    let safe: String = stem
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = safe.trim_matches('-');
    if trimmed.is_empty() {
        "extracted".to_string()
    } else {
        trimmed.chars().take(48).collect()
    }
}

fn probe_media_blocking(path: String) -> Result<MediaProbe, String> {
    let json = run_ffprobe(&path)?;
    let streams = json["streams"].as_array().cloned().unwrap_or_default();
    let format_duration = json["format"]["duration"]
        .as_str()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(5.0);

    let video = streams
        .iter()
        .find(|stream| stream["codec_type"].as_str() == Some("video"));
    let audio = streams
        .iter()
        .find(|stream| stream["codec_type"].as_str() == Some("audio"));

    let ext = extension_lower(&path);
    let is_audio_ext = matches!(
        ext.as_str(),
        "mp3" | "m4a" | "aac" | "flac" | "wav" | "ogg" | "opus" | "wma" | "aiff" | "aif" | "alac"
    );
    let is_image_ext = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif" | "tif" | "tiff");
    let media_type = if audio.is_some() && is_audio_ext {
        "audio"
    } else if video.is_some() && !is_image_ext {
        "video"
    } else if video.is_some() {
        "image"
    } else if audio.is_some() {
        "audio"
    } else {
        "unknown"
    }
    .to_string();

    let width = video.and_then(|stream| stream["width"].as_u64()).map(|value| value as u32);
    let height = video.and_then(|stream| stream["height"].as_u64()).map(|value| value as u32);
    let frame_rate = video.and_then(|stream| parse_frame_rate(stream["r_frame_rate"].as_str()));
    let sample_rate = audio
        .and_then(|stream| stream["sample_rate"].as_str())
        .and_then(|value| value.parse::<u32>().ok());
    let channels = audio.and_then(|stream| stream["channels"].as_u64()).map(|value| value as u32);
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let thumbnail_path = if media_type == "video" || media_type == "image" {
        generate_thumbnail(&path, (format_duration * 0.08).min(2.0)).ok().flatten()
    } else {
        None
    };

    Ok(MediaProbe {
        id: uuid::Uuid::new_v4().to_string(),
        path,
        name,
        media_type,
        duration: if format_duration.is_finite() { format_duration.max(0.1) } else { 5.0 },
        width,
        height,
        frame_rate,
        sample_rate,
        channels,
        thumbnail_path,
        waveform: synthetic_waveform(96),
    })
}

fn parse_frame_rate(value: Option<&str>) -> Option<f64> {
    let value = value?;
    let (left, right) = value.split_once('/')?;
    let numerator = left.parse::<f64>().ok()?;
    let denominator = right.parse::<f64>().ok()?;
    if denominator == 0.0 {
        None
    } else {
        Some(numerator / denominator)
    }
}

fn synthetic_waveform(count: usize) -> Vec<f32> {
    (0..count)
        .map(|index| {
            let x = index as f32 / count as f32;
            (0.18 + (x * 18.0).sin().abs() * 0.58 + (x * 47.0).cos().abs() * 0.2).min(1.0)
        })
        .collect()
}
