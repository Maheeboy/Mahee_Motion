use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use uuid::Uuid;

pub fn ffmpeg_bin() -> String {
    std::env::var("MAHEE_FFMPEG").unwrap_or_else(|_| "ffmpeg".to_string())
}

pub fn ffprobe_bin() -> String {
    std::env::var("MAHEE_FFPROBE").unwrap_or_else(|_| "ffprobe".to_string())
}

pub fn cache_dir() -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("mahee-motion-cache");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

pub fn run_ffprobe(path: &str) -> Result<Value, String> {
    let output = Command::new(ffprobe_bin())
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("ffprobe failed to start: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

pub fn generate_thumbnail(path: &str, seconds: f64) -> Result<Option<String>, String> {
    let output_path = cache_dir()?.join(format!("thumb-{}.jpg", Uuid::new_v4()));
    let at = format!("{:.3}", seconds.max(0.0));
    let status = Command::new(ffmpeg_bin())
        .args([
            "-y",
            "-ss",
            &at,
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=360:-1",
            "-q:v",
            "5",
        ])
        .arg(&output_path)
        .stderr(Stdio::null())
        .stdout(Stdio::null())
        .status()
        .map_err(|error| format!("ffmpeg thumbnail failed to start: {error}"))?;

    if status.success() && output_path.exists() {
        Ok(Some(output_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

pub fn write_concat_list(paths: &[PathBuf]) -> Result<PathBuf, String> {
    let list_path = cache_dir()?.join(format!("concat-{}.txt", Uuid::new_v4()));
    let mut body = String::new();
    for path in paths {
        let escaped = path.to_string_lossy().replace('\\', "/").replace('\'', "'\\''");
        body.push_str(&format!("file '{}'\n", escaped));
    }
    std::fs::write(&list_path, body).map_err(|error| error.to_string())?;
    Ok(list_path)
}

pub fn extension_lower(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}
