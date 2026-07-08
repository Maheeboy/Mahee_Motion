mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::media::probe_media,
            commands::media::extract_audio_from_video,
            commands::project::save_project_file,
            commands::project::load_project_file,
            commands::project::write_project_autosave,
            commands::project::list_project_recoveries,
            commands::project::load_project_autosave,
            commands::project::clear_project_autosave,
            commands::project::list_recent_projects,
            commands::project::record_recent_project,
            commands::project::remove_recent_project,
            commands::recorder::launch_screen_recorder,
            commands::recorder::recent_recordings,
            commands::export::export_timeline,
            commands::export::export_audio_only
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mahee Motion");
}
