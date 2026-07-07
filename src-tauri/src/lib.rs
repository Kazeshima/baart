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
            benchmark_video_render,
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
    kind: String,
    status: String,
    progress: f64,
    output: String,
    error: String,
    logs: Vec<String>,
    rendered_frames: Option<f64>,
    total_frames: Option<f64>,
    fps_estimate: Option<f64>,
    eta_seconds: Option<f64>,
    browser_download: Option<BrowserDownloadProgress>,
    result: Option<serde_json::Value>,
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

fn renderer_work_dir(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join("renderer-runtime")
}

fn node_cli_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if value.get(..8).is_some_and(|prefix| prefix.eq_ignore_ascii_case(r"\\?\UNC\")) {
        return format!(r"\\{}", &value[8..]);
    }
    if value.starts_with(r"\\?\") {
        return value[4..].to_string();
    }
    value.into_owned()
}

fn benchmark_sidecar_arguments(worker: &Path, manifest: &Path, serve_url: &Path, output_root: &Path, binaries: &Path) -> Vec<String> {
    vec![
        node_cli_path(worker),
        "--benchmark".to_string(),
        node_cli_path(manifest),
        node_cli_path(serve_url),
        node_cli_path(output_root),
        node_cli_path(binaries),
    ]
}

fn append_job_error(job: &mut VideoRenderJob, message: &str) {
    let message = message.trim();
    if message.is_empty() || job.error.contains(message) {
        return;
    }
    if !job.error.is_empty() {
        job.error.push_str("\n");
    }
    job.error.push_str(message);
    const MAX_ERROR_LENGTH: usize = 12_000;
    if job.error.len() > MAX_ERROR_LENGTH {
        let mut boundary = MAX_ERROR_LENGTH;
        while !job.error.is_char_boundary(boundary) {
            boundary -= 1;
        }
        job.error.truncate(boundary);
    }
}

fn strip_ansi_sequences(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for next in chars.by_ref() {
                if ('@'..='~').contains(&next) {
                    break;
                }
            }
        } else {
            result.push(character);
        }
    }
    result.trim().to_string()
}

fn append_job_log(job: &mut VideoRenderJob, message: &str) {
    let message = strip_ansi_sequences(message);
    if message.is_empty() || job.logs.iter().any(|existing| existing == &message) {
        return;
    }
    job.logs.push(message);
    const MAX_LOG_LINES: usize = 200;
    if job.logs.len() > MAX_LOG_LINES {
        let drain_count = job.logs.len() - MAX_LOG_LINES;
        job.logs.drain(0..drain_count);
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
        "png" | "jpeg" => rfd::FileDialog::new()
            .set_title(if format == "jpeg" { "Select parent folder for JPEG sequence" } else { "Select parent folder for PNG sequence" })
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
        .filter(|format| matches!(*format, "mp4" | "png" | "jpeg"))
        .ok_or_else(|| "project settings contain an invalid render format".to_string())
}

fn validate_output_path(format: &str, output: &Path) -> Result<(), String> {
    if !output.is_absolute() {
        return Err("render output must be an absolute path".to_string());
    }
    if format == "mp4" && output.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("mp4")) != Some(true) {
        return Err("MP4 output must use the .mp4 extension".to_string());
    }
    if matches!(format, "png" | "jpeg") && output.exists() {
        return Err("image sequence output folder already exists".to_string());
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
            if let Some(rendered_frames) = value.get("renderedFrames").and_then(serde_json::Value::as_f64) {
                job.rendered_frames = Some(rendered_frames);
            }
            if let Some(total_frames) = value.get("totalFrames").and_then(serde_json::Value::as_f64) {
                job.total_frames = Some(total_frames);
            }
            if let Some(fps_estimate) = value.get("fpsEstimate").and_then(serde_json::Value::as_f64) {
                job.fps_estimate = Some(fps_estimate);
            }
            if let Some(eta_seconds) = value.get("etaSeconds").and_then(serde_json::Value::as_f64) {
                job.eta_seconds = Some(eta_seconds);
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
            if let Some(result) = value.get("result") {
                job.result = Some(result.clone());
            }
        }
        "error" => {
            job.status = "error".to_string();
            job.error = value.get("error").and_then(serde_json::Value::as_str).unwrap_or("renderer sidecar failed").to_string();
        }
        "log" => {
            if let Some(message) = value.get("message").and_then(serde_json::Value::as_str) {
                append_job_log(job, message);
            }
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

    let app_cache_dir = app.path().app_cache_dir().map_err(|error| format!("failed to resolve render cache: {error}"))?;
    let renderer_work_dir = renderer_work_dir(&app_cache_dir);
    std::fs::create_dir_all(&renderer_work_dir).map_err(|error| format!("failed to create renderer cache: {error}"))?;
    std::fs::write(renderer_work_dir.join("package.json"), "{\"private\":true}")
        .map_err(|error| format!("failed to initialize renderer cache: {error}"))?;
    let jobs_dir = app_cache_dir.join("video-render-jobs");
    std::fs::create_dir_all(&jobs_dir).map_err(|error| format!("failed to create render cache: {error}"))?;
    let sequence = manager.sequence.fetch_add(1, Ordering::Relaxed);
    let id = format!("{}-{sequence}", epoch_millis());
    let manifest = jobs_dir.join(format!("{id}.json"));
    std::fs::write(&manifest, serde_json::to_vec(&project).map_err(|error| error.to_string())?)
        .map_err(|error| format!("failed to write render manifest: {error}"))?;

    let arguments = vec![
        node_cli_path(&worker),
        node_cli_path(&manifest),
        node_cli_path(&serve_url),
        node_cli_path(&output),
        node_cli_path(&binaries),
    ];
    let node_work_dir = PathBuf::from(node_cli_path(&renderer_work_dir));
    let command = match app.shell().sidecar("baart-node") {
        Ok(command) => command.current_dir(&node_work_dir).args(arguments),
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
        kind: "render".to_string(),
        status: "queued".to_string(),
        progress: 0.0,
        output: output.to_string_lossy().to_string(),
        error: String::new(),
        logs: Vec::new(),
        rendered_frames: None,
        total_frames: None,
        fps_estimate: None,
        eta_seconds: None,
        browser_download: None,
        result: None,
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
                                append_job_log(job, &message);
                            }
                        }
                    }
                }
                CommandEvent::Error(error) => {
                    if let Ok(mut guard) = manager.job.lock() {
                        if let Some(job) = guard.as_mut() {
                            job.status = "error".to_string();
                            append_job_error(job, &error);
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let mut remove_output = false;
                    if let Ok(mut guard) = manager.job.lock() {
                        if let Some(job) = guard.as_mut() {
                            if job.is_active() {
                                job.status = "error".to_string();
                                let exit_message = format!("renderer exited before completion (code {:?})", payload.code);
                                append_job_error(job, &exit_message);
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
async fn benchmark_video_render(
    app: tauri::AppHandle,
    manager: State<'_, VideoRenderManager>,
    project: serde_json::Value,
) -> Result<serde_json::Value, String> {
    {
        let guard = manager.job.lock().map_err(|_| "render state is unavailable")?;
        if guard.as_ref().is_some_and(VideoRenderJob::is_active) {
            return Err("another render is already active".to_string());
        }
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

    let app_cache_dir = app.path().app_cache_dir().map_err(|error| format!("failed to resolve render cache: {error}"))?;
    let renderer_work_dir = renderer_work_dir(&app_cache_dir);
    std::fs::create_dir_all(&renderer_work_dir).map_err(|error| format!("failed to create renderer cache: {error}"))?;
    std::fs::write(renderer_work_dir.join("package.json"), "{\"private\":true}")
        .map_err(|error| format!("failed to initialize renderer cache: {error}"))?;
    let jobs_dir = app_cache_dir.join("video-render-jobs");
    let output_root = app_cache_dir.join("video-render-benchmark");
    std::fs::create_dir_all(&jobs_dir).map_err(|error| format!("failed to create render cache: {error}"))?;
    std::fs::create_dir_all(&output_root).map_err(|error| format!("failed to create benchmark cache: {error}"))?;
    let sequence = manager.sequence.fetch_add(1, Ordering::Relaxed);
    let id = format!("benchmark-{}-{sequence}", epoch_millis());
    let manifest = jobs_dir.join(format!("{id}.json"));
    std::fs::write(&manifest, serde_json::to_vec(&project).map_err(|error| error.to_string())?)
        .map_err(|error| format!("failed to write benchmark manifest: {error}"))?;

    let arguments = benchmark_sidecar_arguments(&worker, &manifest, &serve_url, &output_root, &binaries);
    let node_work_dir = PathBuf::from(node_cli_path(&renderer_work_dir));
    let command = app.shell()
        .sidecar("baart-node")
        .map_err(|error| format!("failed to prepare renderer sidecar: {error}"))?
        .current_dir(&node_work_dir)
        .args(arguments);
    let (mut receiver, _child) = command.spawn().map_err(|error| format!("failed to start renderer sidecar: {error}"))?;
    let job = VideoRenderJob {
        id: id.clone(),
        kind: "benchmark".to_string(),
        status: "queued".to_string(),
        progress: 0.0,
        output: output_root.to_string_lossy().to_string(),
        error: String::new(),
        logs: Vec::new(),
        rendered_frames: None,
        total_frames: None,
        fps_estimate: None,
        eta_seconds: None,
        browser_download: None,
        result: None,
    };
    *manager.job.lock().map_err(|_| "render state is unavailable")? = Some(job);
    let mut result: Option<serde_json::Value> = None;
    let mut stderr = String::new();
    let mut worker_error = String::new();
    while let Some(event) = receiver.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                if let Some(json) = line.trim().strip_prefix(SIDECAR_EVENT_PREFIX) {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(json) {
                        match value.get("type").and_then(serde_json::Value::as_str) {
                            Some("complete") => {
                                update_job_from_sidecar(&manager, &value);
                                result = value.get("result").cloned();
                            }
                            Some("error") => {
                                worker_error = value.get("error").and_then(serde_json::Value::as_str).unwrap_or("benchmark failed").to_string();
                                update_job_from_sidecar(&manager, &value);
                            }
                            _ => update_job_from_sidecar(&manager, &value),
                        }
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                let message = String::from_utf8_lossy(&bytes);
                if !message.trim().is_empty() {
                    stderr.push_str(message.trim());
                    stderr.push('\n');
                    if let Ok(mut guard) = manager.job.lock() {
                        if let Some(job) = guard.as_mut() {
                            append_job_log(job, message.trim());
                        }
                    }
                }
            }
            CommandEvent::Terminated(payload) => {
                let _ = std::fs::remove_file(&manifest);
                if let Some(value) = result {
                    return Ok(value);
                }
                let detail = if !worker_error.is_empty() { worker_error } else if !stderr.trim().is_empty() { stderr.trim().to_string() } else { "benchmark renderer exited before completion".to_string() };
                if let Ok(mut guard) = manager.job.lock() {
                    if let Some(job) = guard.as_mut() {
                        job.status = "error".to_string();
                        append_job_error(job, &format!("{detail} (code {:?})", payload.code));
                    }
                }
                return Err(format!("{detail} (code {:?})", payload.code));
            }
            CommandEvent::Error(error) => worker_error = error,
            _ => {}
        }
    }
    let _ = std::fs::remove_file(&manifest);
    result.ok_or_else(|| "benchmark renderer exited before completion".to_string())
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
        assert!(validate_output_path("jpeg", Path::new(r"C:\video\ratings-frames")).is_ok());
    }

    #[test]
    fn renderer_cache_is_derived_from_the_writable_app_cache() {
        assert_eq!(renderer_work_dir(Path::new(r"C:\Users\Test\AppData\Local\baart")), PathBuf::from(r"C:\Users\Test\AppData\Local\baart\renderer-runtime"));
    }

    #[test]
    fn node_cli_paths_remove_windows_verbatim_prefixes() {
        assert_eq!(node_cli_path(Path::new(r"\\?\C:\Program Files\BAART\worker.mjs")), r"C:\Program Files\BAART\worker.mjs");
        assert_eq!(node_cli_path(Path::new(r"\\?\UNC\server\share\worker.mjs")), r"\\server\share\worker.mjs");
        assert_eq!(node_cli_path(Path::new(r"C:\BAART\worker.mjs")), r"C:\BAART\worker.mjs");
        assert_eq!(node_cli_path(Path::new(r"C:\BAART\评级\worker.mjs")), r"C:\BAART\评级\worker.mjs");
    }

    #[test]
    fn every_node_argument_uses_a_node_compatible_path() {
        let inputs = [
            Path::new(r"\\?\C:\BAART\worker.mjs"),
            Path::new(r"\\?\C:\Cache\project.json"),
            Path::new(r"\\?\C:\BAART\composition"),
            Path::new(r"\\?\C:\Output\video.mp4"),
            Path::new(r"\\?\C:\BAART\compositor"),
        ];
        let arguments: Vec<String> = inputs.iter().map(|path| node_cli_path(path)).collect();
        assert!(arguments.iter().all(|argument| !argument.starts_with(r"\\?\")));
    }

    #[test]
    fn benchmark_sidecar_arguments_pass_worker_before_mode_flag() {
        let arguments = benchmark_sidecar_arguments(
            Path::new(r"\\?\C:\BAART\worker.mjs"),
            Path::new(r"\\?\C:\Cache\project.json"),
            Path::new(r"\\?\C:\BAART\composition"),
            Path::new(r"\\?\C:\Cache\benchmark"),
            Path::new(r"\\?\C:\BAART\compositor"),
        );
        assert_eq!(arguments[0], r"C:\BAART\worker.mjs");
        assert_eq!(arguments[1], "--benchmark");
        assert!(arguments.iter().all(|argument| !argument.starts_with(r"\\?\")));
    }

    #[test]
    fn renderer_exit_details_do_not_overwrite_the_root_error() {
        let mut job = VideoRenderJob {
            id: "test".to_string(), kind: "render".to_string(), status: "rendering".to_string(), progress: 0.0,
            output: String::new(), error: String::new(), logs: Vec::new(),
            rendered_frames: None, total_frames: None, fps_estimate: None, eta_seconds: None,
            browser_download: None,
            result: None,
        };
        append_job_error(&mut job, "Chrome cache is not writable");
        append_job_error(&mut job, "renderer exited before completion (code Some(1))");
        assert!(job.error.starts_with("Chrome cache is not writable"));
        assert!(job.error.ends_with("code Some(1))"));
    }

    #[test]
    fn renderer_stderr_is_kept_as_logs_not_errors() {
        let mut job = VideoRenderJob {
            id: "test".to_string(), kind: "render".to_string(), status: "rendering".to_string(), progress: 0.0,
            output: String::new(), error: String::new(), logs: Vec::new(),
            rendered_frames: None, total_frames: None, fps_estimate: None, eta_seconds: None,
            browser_download: None,
            result: None,
        };
        append_job_log(&mut job, "\u{1b}[33mBrowser failed to load favicon.ico\u{1b}[39m");
        assert_eq!(job.error, "");
        assert_eq!(job.logs, vec!["Browser failed to load favicon.ico"]);
    }

    #[test]
    fn failed_render_cleanup_removes_files_and_frame_directories() {
        let parent = std::env::temp_dir().join(format!("baart-cleanup-test-{}", epoch_millis()));
        let video = parent.join("partial.mp4");
        let frames = parent.join("partial-frames");
        std::fs::create_dir_all(&frames).unwrap();
        std::fs::write(&video, b"partial").unwrap();
        std::fs::write(frames.join("frame-00.png"), b"partial").unwrap();
        remove_render_output(&video);
        remove_render_output(&frames);
        assert!(!video.exists());
        assert!(!frames.exists());
        std::fs::remove_dir_all(parent).unwrap();
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
            id: "test".to_string(), kind: "render".to_string(), status: "queued".to_string(), progress: 0.0,
            output: String::new(), error: String::new(), logs: Vec::new(),
            rendered_frames: None, total_frames: None, fps_estimate: None, eta_seconds: None,
            browser_download: None,
            result: None,
        });
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "status", "status": "rendering" }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "progress", "progress": 5.0, "renderedFrames": 50, "totalFrames": 100, "fpsEstimate": 25.0, "etaSeconds": 2.0 }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "progress", "progress": 0.2 }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "log", "message": "\u{1b}[31mtransient image retry\u{1b}[39m" }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "browserDownload", "progress": { "percent": 0.42, "alreadyAvailable": false } }));
        update_job_from_sidecar(&manager, &serde_json::json!({ "type": "complete", "output": r"C:\video\done.mp4" }));
        let job = manager.job.lock().unwrap().clone().unwrap();
        assert_eq!(job.status, "complete");
        assert_eq!(job.progress, 1.0);
        assert_eq!(job.output, r"C:\video\done.mp4");
        assert_eq!(job.rendered_frames, Some(50.0));
        assert_eq!(job.total_frames, Some(100.0));
        assert_eq!(job.fps_estimate, Some(25.0));
        assert_eq!(job.eta_seconds, Some(2.0));
        assert_eq!(job.logs, vec!["transient image retry"]);
        assert_eq!(job.browser_download.unwrap().percent, 42.0);
    }
}
