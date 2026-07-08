use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosaveInfo {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub project_path: Option<String>,
    pub updated_at: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub project_id: String,
    pub project_name: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn save_project_file(path: String, json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        atomic_write(Path::new(&path), json.as_bytes()).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn load_project_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read_to_string(path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_project_autosave(
    app: tauri::AppHandle,
    json: String,
    project_id: String,
    project_path: Option<String>,
    project_name: String,
) -> Result<AutosaveInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let autosave_dir = autosaves_dir(&app)?;
        std::fs::create_dir_all(&autosave_dir).map_err(|error| error.to_string())?;
        let id = sanitize_id(&project_id);
        let project_file = autosave_dir.join(format!("{id}.json"));
        let metadata_file = autosave_dir.join(format!("{id}.meta.json"));
        atomic_write(&project_file, json.as_bytes()).map_err(|error| error.to_string())?;
        let info = AutosaveInfo {
            id,
            project_id,
            project_name,
            project_path,
            updated_at: now_millis_string(),
            file_path: project_file.to_string_lossy().to_string(),
        };
        let metadata = serde_json::to_vec_pretty(&info).map_err(|error| error.to_string())?;
        atomic_write(&metadata_file, &metadata).map_err(|error| error.to_string())?;
        Ok(info)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_project_recoveries(app: tauri::AppHandle) -> Result<Vec<AutosaveInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let autosave_dir = autosaves_dir(&app)?;
        if !autosave_dir.exists() {
            return Ok(Vec::new());
        }
        let mut recoveries = Vec::new();
        for entry in std::fs::read_dir(&autosave_dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json")
                || !path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.ends_with(".meta.json"))
            {
                continue;
            }
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(info) = serde_json::from_str::<AutosaveInfo>(&text) {
                    if Path::new(&info.file_path).exists() {
                        recoveries.push(info);
                    }
                }
            }
        }
        recoveries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(recoveries)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn load_project_autosave(app: tauri::AppHandle, autosave_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let autosave_file = autosaves_dir(&app)?.join(format!("{}.json", sanitize_id(&autosave_id)));
        std::fs::read_to_string(autosave_file).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clear_project_autosave(app: tauri::AppHandle, autosave_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let autosave_dir = autosaves_dir(&app)?;
        let id = sanitize_id(&autosave_id);
        remove_if_exists(autosave_dir.join(format!("{id}.json")))?;
        remove_if_exists(autosave_dir.join(format!("{id}.meta.json")))?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    tauri::async_runtime::spawn_blocking(move || read_recent_projects(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn record_recent_project(
    app: tauri::AppHandle,
    path: String,
    project_id: String,
    project_name: String,
) -> Result<Vec<RecentProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut recent = read_recent_projects(&app)?;
        recent.retain(|item| !paths_equal(&item.path, &path));
        recent.insert(
            0,
            RecentProject {
                path,
                project_id,
                project_name,
                updated_at: now_millis_string(),
            },
        );
        recent.truncate(12);
        write_recent_projects(&app, &recent)?;
        Ok(recent)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn remove_recent_project(app: tauri::AppHandle, path: String) -> Result<Vec<RecentProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut recent = read_recent_projects(&app)?;
        recent.retain(|item| !paths_equal(&item.path, &path));
        write_recent_projects(&app, &recent)?;
        Ok(recent)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn autosaves_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("autosaves"))
}

fn recent_projects_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("recent-projects.json"))
}

fn read_recent_projects(app: &tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    let path = recent_projects_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<Vec<RecentProject>>(&text).map_err(|error| error.to_string())
}

fn write_recent_projects(app: &tauri::AppHandle, recent: &[RecentProject]) -> Result<(), String> {
    let path = recent_projects_path(app)?;
    let json = serde_json::to_vec_pretty(recent).map_err(|error| error.to_string())?;
    atomic_write(&path, &json).map_err(|error| error.to_string())
}

fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, contents)?;
    std::fs::rename(temp, path)
}

fn remove_if_exists(path: PathBuf) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn sanitize_id(value: &str) -> String {
    value
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() || character == '-' || character == '_' { character } else { '_' })
        .collect()
}

fn now_millis_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn paths_equal(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
}
