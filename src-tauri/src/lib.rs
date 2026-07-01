#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_text_file,
            read_text_file,
            get_data_dir,
            save_text_as,
            save_bytes_as,
            open_text_file,
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
