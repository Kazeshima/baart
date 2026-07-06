#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(VideoRenderManager::default())
        .invoke_handler(tauri::generate_handler![
            save_text_file,
            read_text_file,
            get_data_dir,
            save_text_as,
            save_bytes_as,
            open_text_file,
            select_video_output,
            start_video_render,
            get_video_render_job,
            cancel_video_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Deserialize)]
struct FileFilter {
    name: String,
    extensions: Vec<String>,
}

fn add_filters(mut dialog: rfd::FileDialog, filters: &[FileFilter]) -> rfd::FileDialog {
    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    dialog
}

fn app_file_path(app: &tauri::AppHandle, relative_path: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;

    if relative_path.contains("..") || relative_path.contains(':') || relative_path.starts_with('/') {
        return Err("invalid relative path".to_string());
    }

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    Ok(base.join(relative_path))
}

#[tauri::command]
fn save_text_file(app: tauri::AppHandle, relative_path: String, contents: String) -> Result<String, String> {
    let path = app_file_path(&app, &relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create directory: {e}"))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("failed to write file: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text_file(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let path = app_file_path(&app, &relative_path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("failed to read file: {e}"))
}

#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&path).map_err(|e| format!("failed to create app data dir: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_text_as(default_name: String, contents: String, filters: Vec<FileFilter>) -> Result<Option<String>, String> {
    let dialog = add_filters(rfd::FileDialog::new().set_file_name(default_name), &filters);
    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };
    std::fs::write(&path, contents).map_err(|e| format!("failed to write file: {e}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_bytes_as(default_name: String, bytes: Vec<u8>, filters: Vec<FileFilter>) -> Result<Option<String>, String> {
    let dialog = add_filters(rfd::FileDialog::new().set_file_name(default_name), &filters);
    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };
    std::fs::write(&path, bytes).map_err(|e| format!("failed to write file: {e}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn open_text_file(filters: Vec<FileFilter>) -> Result<Option<String>, String> {
    let dialog = add_filters(rfd::FileDialog::new(), &filters);
    let Some(path) = dialog.pick_file() else {
        return Ok(None);
    };
    std::fs::read_to_string(&path).map(Some).map_err(|e| format!("failed to read file: {e}"))
}

use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

const SIDECAR_EVENT_PREFIX: &str = "BAART_EVENT ";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserDownloadProgress {
    percent: f64,
    already_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoRenderJob {
    id: String,
    status: String,
    progress: f64,
    output: String,
    error: String,
    browser_download: Option<BrowserDownloadProgress>,
}

impl VideoRenderJob {
    fn is_active(&self) -> bool {
        matches!(self.status.as_str(), "queued" | "preparing" | "rendering" | "encoding")
    }
}

#[derive(Default)]
struct VideoRenderManager {
    job: Mutex<Option<VideoRenderJob>>,
    child: Mutex<Option<CommandChild>>,
    manifest: Mutex<Option<PathBuf>>,
    output: Mutex<Option<PathBuf>>,
    sequence: AtomicU64,
}

fn safe_output_name(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut last_was_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            result.push(character);
            last_was_dash = false;
        } else if !last_was_dash && !result.is_empty() {
            result.push('-');
            last_was_dash = true;
        }
    }
    let trimmed = result.trim_matches('-').trim_matches('.');
    if trimmed.is_empty() { "baart-arena-ratings".to_string() } else { trimmed.to_string() }
}

fn unique_frames_path(parent: &Path, output_name: &str) -> PathBuf {
    let base = format!("{}-frames", safe_output_name(output_name));
    let first = parent.join(&base);
    if !first.exists() {
        return first;
    }
    for suffix in 2..10_000 {
        let candidate = parent.join(format!("{base}-{suffix}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{base}-{}", epoch_millis()))
}

fn epoch_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn remove_render_output(path: &Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else {
        let _ = std::fs::remove_file(path);
    }
}

fn finish_render_cleanup(manager: &VideoRenderManager, remove_output: bool) {
    if let Ok(mut manifest) = manager.manifest.lock() {
        if let Some(path) = manifest.take() {
            let _ = std::fs::remove_file(path);
        }
    }
    if let Ok(mut output) = manager.output.lock() {
        if let Some(path) = output.take() {
            if remove_output {
                remove_render_output(&path);
            }
        }
    }
    if let Ok(mut child) = manager.child.lock() {
        child.take();
    }
}

#[tauri::command]
fn select_video_output(format: String, output_name: String) -> Result<Option<String>, String> {
    let name = safe_output_name(&output_name);
    let selected = match format.as_str() {
        "mp4" => rfd::FileDialog::new()
            .add_filter("MP4 Video", &["mp4"])
            .set_file_name(format!("{name}.mp4"))
            .save_file(),
        "png" => rfd::FileDialog::new()
            .set_title("Select parent folder for PNG sequence")
            .pick_folder()
            .map(|parent| unique_frames_path(&parent, &name)),
        _ => return Err("unsupported render format".to_string()),
    };
    Ok(selected.map(|path| path.to_string_lossy().to_string()))
}

fn parse_project_format(project: &serde_json::Value) -> Result<&str, String> {
    project.get("settings")
        .and_then(|settings| settings.get("format"))
        .and_then(serde_json::Value::as_str)
        .filter(|format| matches!(*format, "mp4" | "png"))
        .ok_or_else(|| "project settings contain an invalid render format".to_string())
}

fn validate_output_path(format: &str, output: &Path) -> Result<(), String> {
    if !output.is_absolute() {
        return Err("render output must be an absolute path".to_string());
    }
    if format == "mp4" && output.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("mp4")) != Some(true) {
        return Err("MP4 output must use the .mp4 extension".to_string());
    }
    if format == "png" && output.exists() {
        return Err("PNG sequence output folder already exists".to_string());
    }
    Ok(())
}

fn update_job_from_sidecar(manager: &VideoRenderManager, value: &serde_json::Value) {
    let Some(event_type) = value.get("type").and_then(serde_json::Value::as_str) else { return; };
    let Ok(mut guard) = manager.job.lock() else { return; };
    let Some(job) = guard.as_mut() else { return; };
    if job.status == "cancelled" { return; }
    match event_type {
        "status" => {
            if let Some(status) = value.get("status").and_then(serde_json::Value::as_str) {
                if matches!(status, "preparing" | "rendering" | "encoding") {
                    job.status = status.to_string();
                }
            }
        }
        "progress" => {
            if let Some(progress) = value.get("progress").and_then(serde_json::Value::as_f64) {
                job.progress = job.progress.max(progress.clamp(0.0, 1.0));
            }
        }
        "browserDownload" => {
            let progress = value.get("progress").unwrap_or(&serde_json::Value::Null);
            let raw_percent = progress.get("percent").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
            job.browser_download = Some(BrowserDownloadProgress {
                percent: (if raw_percent <= 1.0 { raw_percent * 100.0 } else { raw_percent }).clamp(0.0, 100.0),
                already_available: progress.get("alreadyAvailable").and_then(serde_json::Value::as_bool).unwrap_or(false),
            });
        }
        "complete" => {
            job.status = "complete".to_string();
            job.progress = 1.0;
            if let Some(output) = value.get("output").and_then(serde_json::Value::as_str) {
                job.output = output.to_string();
            }
        }
        "error" => {
            job.status = "error".to_string();
            job.error = value.get("error").and_then(serde_json::Value::as_str).unwrap_or("renderer sidecar failed").to_string();
        }
        _ => {}
    }
}

#[tauri::command]
fn start_video_render(
    app: tauri::AppHandle,
    manager: State<'_, VideoRenderManager>,
    project: serde_json::Value,
    output_location: String,
) -> Result<VideoRenderJob, String> {
    {
        let guard = manager.job.lock().map_err(|_| "render state is unavailable")?;
        if guard.as_ref().is_some_and(VideoRenderJob::is_active) {
            return Err("another render is already active".to_string());
        }
    }
    let format = parse_project_format(&project)?;
    let output = PathBuf::from(output_location);
    validate_output_path(format, &output)?;
    if format == "mp4" && output.exists() {
        std::fs::remove_file(&output).map_err(|error| format!("failed to replace selected output: {error}"))?;
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("failed to create output directory: {error}"))?;
    }

    let resource_dir = app.path().resource_dir().map_err(|error| format!("failed to resolve renderer resources: {error}"))?;
    let worker = resource_dir.join("renderer/app/video/sidecar/worker.mjs");
    let serve_url = resource_dir.join("renderer/composition");
    let binaries = resource_dir.join("renderer/app/node_modules/@remotion/compositor-win32-x64-msvc");
    for required in [&worker, &serve_url, &binaries] {
        if !required.exists() {
            return Err(format!("packaged renderer resource is missing: {}", required.display()));
        }
    }

    let jobs_dir = app.path().app_cache_dir().map_err(|error| format!("failed to resolve render cache: {error}"))?.join("video-render-jobs");
    std::fs::create_dir_all(&jobs_dir).map_err(|error| format!("failed to create render cache: {error}"))?;
    let sequence = manager.sequence.fetch_add(1, Ordering::Relaxed);
    let id = format!("{}-{sequence}", epoch_millis());
    let manifest = jobs_dir.join(format!("{id}.json"));
    std::fs::write(&manifest, serde_json::to_vec(&project).map_err(|error| error.to_string())?)
        .map_err(|error| format!("failed to write render manifest: {error}"))?;

    let arguments = vec![
        worker.to_string_lossy().to_string(),
        manifest.to_string_lossy().to_string(),
        serve_url.to_string_lossy().to_string(),
        output.to_string_lossy().to_string(),
        binaries.to_string_lossy().to_string(),
    ];
    let command = match app.shell().sidecar("baart-node") {
        Ok(command) => command.args(arguments),
        Err(error) => {
            let _ = std::fs::remove_file(&manifest);
            return Err(format!("failed to prepare renderer sidecar: {error}"));
        }
    };
    let (mut receiver, child) = match command.spawn() {
        Ok(spawned) => spawned,
        Err(error) => {
            let _ = std::fs::remove_file(&manifest);
            return Err(format!("failed to start renderer sidecar: {error}"));
        }
    };

    let job = VideoRenderJob {
        id,
        status: "queued".to_string(),
        progress: 0.0,
        output: output.to_string_lossy().to_string(),
        error: String::new(),
        browser_download: None,
    };
    *manager.job.lock().map_err(|_| "render state is unavailable")? = Some(job.clone());
    *manager.child.lock().map_err(|_| "render state is unavailable")? = Some(child);
    *manager.manifest.lock().map_err(|_| "render state is unavailable")? = Some(manifest);
    *manager.output.lock().map_err(|_| "render state is unavailable")? = Some(output);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            let manager = app_handle.state::<VideoRenderManager>();
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if let Some(json) = line.trim().strip_prefix(SIDECAR_EVENT_PREFIX) {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(json) {
                            update_job_from_sidecar(&manager, &value);
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let message = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !message.is_empty() {
                        if let Ok(mut guard) = manager.job.lock() {
                            if let Some(job) = guard.as_mut() {
                                if job.error.is_empty() { job.error = message; }
                            }
                        }
                    }
                }
                CommandEvent::Error(error) => {
                    if let Ok(mut guard) = manager.job.lock() {
                        if let Some(job) = guard.as_mut() {
                            job.status = "error".to_string();
                            job.error = error;
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let mut remove_output = false;
                    if let Ok(mut guard) = manager.job.lock() {
                        if let Some(job) = guard.as_mut() {
                            if job.is_active() {
                                job.status = "error".to_string();
                                job.error = format!("renderer exited before completion (code {:?})", payload.code);
                            }
                            remove_output = matches!(job.status.as_str(), "error" | "cancelled");
                        }
                    }
                    finish_render_cleanup(&manager, remove_output);
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(job)
}

#[tauri::command]
fn get_video_render_job(manager: State<'_, VideoRenderManager>) -> Result<Option<VideoRenderJob>, String> {
    manager.job.lock().map(|job| job.clone()).map_err(|_| "render state is unavailable".to_string())
}

#[tauri::command]
fn cancel_video_render(manager: State<'_, VideoRenderManager>) -> Result<Option<VideoRenderJob>, String> {
    {
        let mut guard = manager.job.lock().map_err(|_| "render state is unavailable")?;
        let Some(job) = guard.as_mut() else { return Ok(None); };
        if !job.is_active() { return Ok(Some(job.clone())); }
        job.status = "cancelled".to_string();
    }
    if let Some(child) = manager.child.lock().map_err(|_| "render state is unavailable")?.take() {
        child.kill().map_err(|error| format!("failed to cancel renderer: {error}"))?;
    }
    finish_render_cleanup(&manager, true);
    manager.job.lock().map(|job| job.clone()).map_err(|_| "render state is unavailable".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_output_names() {
        assert_eq!(safe_output_name("BA Arena: S9 / ratings"), "BA-Arena-S9-ratings");
        assert_eq!(safe_output_name("..."), "baart-arena-ratings");
    }

    #[test]
    fn validates_output_extensions_and_absolute_paths() {
        assert!(validate_output_path("mp4", Path::new(r"C:\video\ratings.mp4")).is_ok());
        assert!(validate_output_path("mp4", Path::new(r"C:\video\ratings.png")).is_err());
        assert!(validate_output_path("png", Path::new("relative-folder")).is_err());
    }

    #[test]
    fn creates_a_non_colliding_frames_folder_name() {
        let parent = std::env::temp_dir().join(format!("baart-output-test-{}", epoch_millis()));
        std::fs::create_dir_all(parent.join("arena-frames")).unwrap();
        assert_eq!(unique_frames_path(&parent, "arena"), parent.join("arena-frames-2"));
        std::fs::remove_dir_all(parent).unwrap();
    }

    #[test]
    fn sidecar_events_clamp_progress_and_reach_completion() {
        let manager = VideoRenderManager::default();
        *manager.job.lock().unwrap() = Some(VideoRenderJob {
            id: "test".to_string(), status: "queued".to_string(), progress: 0.0,
            output: String::new(), error: String::new(), browser_download: None,
        });
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "status", "status": "rendering" }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "progress", "progress": 5.0 }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "progress", "progress": 0.2 }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "browserDownload", "progress": { "percent": 0.42, "alreadyAvailable": false } }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "complete", "output": r"C:\video\done.mp4" }));
        let job = manager.job.lock().unwrap().clone().unwrap();
        assert_eq!(job.status, "complete");
        assert_eq!(job.progress, 1.0);
        assert_eq!(job.output, r"C:\video\done.mp4");
        assert_eq!(job.browser_download.unwrap().percent, 42.0);
    }
}
