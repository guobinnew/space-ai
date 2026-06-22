use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Holds per-session sidecar process handles.
/// Each session gets its own sidecar process on a unique port.
struct SidecarManager(Mutex<HashMap<String, Child>>);

/// The base port — session N gets port BASE_PORT + N (allocated dynamically)
const BASE_PORT: u16 = 3721;

impl SidecarManager {
    fn new() -> Self {
        SidecarManager(Mutex::new(HashMap::new()))
    }

    /// Check if a session's sidecar is running
    fn is_running(&self, session_id: &str) -> bool {
        if let Ok(map) = self.0.lock() {
            map.contains_key(session_id)
        } else {
            false
        }
    }

    /// Get the port for a session (deterministic: hash of session_id + base)
    fn get_port(&self, session_id: &str) -> u16 {
        // Simple hash: use the last 4 hex chars of the session id to offset
        let hash = session_id
            .bytes()
            .fold(0u16, |acc, b| acc.wrapping_add(b as u16));
        BASE_PORT + (hash % 1000) + 1
    }

    /// Kill a specific session's sidecar
    fn kill_session(&self, session_id: &str) {
        if let Ok(mut map) = self.0.lock() {
            if let Some(ref mut child) = map.get_mut(session_id) {
                let pid = child.id();
                println!("[SmartSpace] Killing sidecar for session {} (pid={})", session_id, pid);

                #[cfg(target_os = "windows")]
                {
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .creation_flags(0x08000000)
                        .status();
                }

                #[cfg(not(target_os = "windows"))]
                {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            map.remove(session_id);
        }
    }

    /// Kill all sidecar processes
    fn kill_all(&self) {
        // Collect session IDs first, then kill each one
        let session_ids: Vec<String> = {
            let map = self.0.lock();
            match map {
                Ok(m) => m.keys().cloned().collect(),
                Err(_) => return,
            }
        };
        for id in session_ids {
            self.kill_session(&id);
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.kill_all();
    }
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Start a sidecar process for a specific session.
/// Returns the port the sidecar is listening on.
#[tauri::command]
fn start_session_sidecar(
    app: tauri::AppHandle,
    state: State<'_, SidecarManager>,
    session_id: String,
) -> Result<u16, String> {
    // Already running for this session
    if state.is_running(&session_id) {
        return Ok(state.get_port(&session_id));
    }

    let port = state.get_port(&session_id);

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {}", e))?;

    let sidecar_path = {
        #[cfg(target_os = "windows")]
        let bundled = resource_dir.join("agent").join("smart-sidecar.exe");
        #[cfg(not(target_os = "windows"))]
        let bundled = resource_dir.join("agent").join("smart-sidecar");
        if bundled.exists() {
            bundled
        } else {
            let dev_sidecar = std::env::current_dir()
                .unwrap_or_default()
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("server").join("agent").join("sidecar.ts"))
                .unwrap_or_default();
            if dev_sidecar.exists() {
                println!("[SmartSpace] Dev mode: using sidecar at {:?}", dev_sidecar);
                dev_sidecar
            } else {
                return Err(format!(
                    "Sidecar not found at {:?} or {:?}",
                    bundled, dev_sidecar
                ));
            }
        }
    };

    let app_root = std::env::current_dir()
        .unwrap_or_default()
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let is_compiled = sidecar_path.extension().map(|e| e == "exe" || e == "").unwrap_or(true)
        && sidecar_path.file_name().map(|n| n != "sidecar.ts").unwrap_or(true);

    let mut cmd = if is_compiled {
        Command::new(&sidecar_path)
    } else {
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("bun").arg("run").arg(&sidecar_path);
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("bun");
            c.arg("run").arg(&sidecar_path);
            c
        }
    };

    let port_str = port.to_string();

    let child = cmd
        .arg("server")
        .arg("--app-root")
        .arg(&app_root)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(&port_str)
        .env("PORT", &port_str)
        .env("HOST", "127.0.0.1")
        .spawn()
        .map_err(|e| format!("Failed to start sidecar process: {}", e))?;

    println!(
        "[SmartSpace] Sidecar started for session {} on port {} (pid={})",
        session_id,
        port,
        child.id()
    );

    let mut map = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(session_id, child);
    Ok(port)
}

/// Stop the sidecar process for a specific session.
#[tauri::command]
fn stop_session_sidecar(state: State<'_, SidecarManager>, session_id: String) -> Result<bool, String> {
    state.kill_session(&session_id);
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(SidecarManager::new());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let state = window.state::<SidecarManager>();
                    state.kill_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            start_session_sidecar,
            stop_session_sidecar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
