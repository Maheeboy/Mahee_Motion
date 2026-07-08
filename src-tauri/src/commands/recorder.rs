use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const RECORDER_EXE: &str = r"E:\Opencode Projects\Screen recorder\dist\PerfectScreenRecorder\PerfectScreenRecorder.exe";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingCandidate {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
    pub size: u64,
}

#[tauri::command]
pub async fn launch_screen_recorder(output_dir: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_screen_recorder_blocking(output_dir))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn recent_recordings(output_dir: String, since_ms: u64) -> Result<Vec<RecordingCandidate>, String> {
    tauri::async_runtime::spawn_blocking(move || recent_recordings_blocking(output_dir, since_ms))
        .await
        .map_err(|error| error.to_string())?
}

fn launch_screen_recorder_blocking(output_dir: String) -> Result<(), String> {
    let output_path = PathBuf::from(&output_dir);
    fs::create_dir_all(&output_path).map_err(|error| format!("Could not create recording folder: {error}"))?;
    persist_recorder_output_dir(&output_path)?;

    let recorder = Path::new(RECORDER_EXE);
    if !recorder.exists() {
        return Err(format!("Perfect Screen Recorder was not found at {}", recorder.display()));
    }

    Command::new(recorder)
        .arg("--output-dir")
        .arg(&output_path)
        .env("PERFECT_RECORDER_OUTPUT_DIR", &output_path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not launch Perfect Screen Recorder: {error}"))
}

fn persist_recorder_output_dir(output_path: &Path) -> Result<(), String> {
    let appdata = std::env::var_os("APPDATA").ok_or("APPDATA is not available, so the recorder folder could not be saved.")?;
    let config_dir = PathBuf::from(appdata).join("PerfectScreenRecorder");
    fs::create_dir_all(&config_dir).map_err(|error| format!("Could not create recorder config folder: {error}"))?;
    let config_path = config_dir.join("config.json");
    let mut config = fs::read_to_string(&config_path)
        .ok()
        .and_then(|value| serde_json::from_str::<Value>(&value).ok())
        .unwrap_or_else(|| json!({}));
    config["save_dir"] = json!(output_path.to_string_lossy().to_string());
    let payload = serde_json::to_string_pretty(&config).map_err(|error| format!("Could not serialize recorder config: {error}"))?;
    fs::write(&config_path, payload).map_err(|error| format!("Could not save recorder config: {error}"))
}

fn recent_recordings_blocking(output_dir: String, since_ms: u64) -> Result<Vec<RecordingCandidate>, String> {
    let output_path = PathBuf::from(output_dir);
    if !output_path.exists() {
        return Ok(Vec::new());
    }

    let now_ms = system_time_ms(SystemTime::now());
    let mut recordings = Vec::new();
    let entries = fs::read_dir(&output_path).map_err(|error| format!("Could not read recording folder: {error}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !matches!(path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()).as_deref(), Some("mp4")) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified_ms = metadata.modified().map(system_time_ms).unwrap_or(0);
        if modified_ms < since_ms || metadata.len() == 0 {
            continue;
        }
        // Avoid prompting while FFmpeg is still flushing the final MP4.
        if now_ms.saturating_sub(modified_ms) < 1500 {
            continue;
        }
        recordings.push(RecordingCandidate {
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Recording.mp4")
                .to_string(),
            path: path.to_string_lossy().to_string(),
            modified_ms,
            size: metadata.len(),
        });
    }
    recordings.sort_by_key(|recording| recording.modified_ms);
    Ok(recordings)
}

fn system_time_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
