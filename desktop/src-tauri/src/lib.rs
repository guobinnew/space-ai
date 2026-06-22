use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Holds the server child process handle
struct ServerProcess(Mutex<Option<Child>>);

impl ServerProcess {
    /// Kill the server process, using platform-appropriate method
    fn kill(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                let pid = child.id();
                println!("[SmartSpace] Killing server process (pid={})", pid);

                #[cfg(target_os = "windows")]
                {
                    // On Windows, use taskkill /T to kill the entire process tree
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                        .status();
                }

                #[cfg(not(target_os = "windows"))]
                {
                    let _ = child.kill();
                    let _ = child.wait();
                }

                println!("[SmartSpace] Server process killed");
            }
            *guard = None;
        }
    }

    /// Check if the server process is currently running
    fn is_running(&self) -> bool {
        if let Ok(guard) = self.0.lock() {
            guard.is_some()
        } else {
            false
        }
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

#[tauri::command]
fn get_server_port() -> u16 {
    3721
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    // Close splash window
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    // Show main window
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Start the sidecar server process on demand.
/// Called by the frontend when a session is created or WS connection is needed.
#[tauri::command]
fn start_sidecar(app: tauri::AppHandle, state: State<'_, ServerProcess>) -> Result<bool, String> {
    // Already running
    if state.is_running() {
        return Ok(true);
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {}", e))?;

    let sidecar_path = {
        // Production: compiled sidecar binary bundled as resource
        #[cfg(target_os = "windows")]
        let bundled = resource_dir.join("agent").join("smart-sidecar.exe");
        #[cfg(not(target_os = "windows"))]
        let bundled = resource_dir.join("agent").join("smart-sidecar");
        if bundled.exists() {
            bundled
        } else {
            // Dev mode: run sidecar.ts directly with bun
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
        // Production: run compiled binary directly
        Command::new(&sidecar_path)
    } else {
        // Dev mode: run .ts with bun
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

    let child = cmd
        .arg("server")
        .arg("--app-root")
        .arg(&app_root)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("3721")
        .env("PORT", "3721")
        .env("HOST", "127.0.0.1")
        .spawn()
        .map_err(|e| format!("Failed to start sidecar process: {}", e))?;

    println!("[SmartSpace] Sidecar started (pid={})", child.id());
    *state.0.lock().map_err(|e| format!("Lock error: {}", e))? = Some(child);
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Register ServerProcess state (empty — sidecar NOT started automatically)
            app.manage(ServerProcess(Mutex::new(None)));
            Ok(())
        })
        .on_window_event(|window, event| {
            // Only kill the server when the MAIN window is destroyed.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let state = window.state::<ServerProcess>();
                    state.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            close_splashscreen,
            start_sidecar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
