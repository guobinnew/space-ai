use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Holds the single Server sidecar process (lives for the entire app lifecycle).
struct ServerSidecar(Mutex<Option<Child>>);

impl ServerSidecar {
    fn kill(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                let pid = child.id();
                println!("[SmartSpace] Killing server sidecar (pid={})", pid);

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

                println!("[SmartSpace] Server sidecar killed");
            }
            *guard = None;
        }
    }
}

impl Drop for ServerSidecar {
    fn drop(&mut self) {
        self.kill();
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

/// Get the server sidecar port (fixed at 3721).
#[tauri::command]
fn get_server_port() -> u16 {
    3721
}

/// Resolve the sidecar binary/script path.
/// Production: bundled binary at resource_dir/agent/smart-sidecar[.exe]
/// Dev mode: server/agent/sidecar.ts (run with bun)
fn resolve_sidecar_path(resource_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    let bundled = resource_dir.join("agent").join("smart-sidecar.exe");
    #[cfg(not(target_os = "windows"))]
    let bundled = resource_dir.join("agent").join("smart-sidecar");

    if bundled.exists() {
        return Some(bundled);
    }

    // Dev mode: look for sidecar.ts relative to current dir
    let dev_sidecar = std::env::current_dir()
        .ok()
        .and_then(|d| d.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()))
        .map(|root| root.join("server").join("agent").join("sidecar.ts"));

    if let Some(ref path) = dev_sidecar {
        if path.exists() {
            println!("[SmartSpace] Dev mode: using sidecar at {:?}", path);
            return Some(path.clone());
        }
    }

    eprintln!(
        "[SmartSpace] Sidecar not found at {:?} or {:?}",
        bundled,
        dev_sidecar.as_deref().unwrap_or(std::path::Path::new(""))
    );
    None
}

/// Resolve app root (two levels up from src-tauri dir in dev, resource dir in prod).
fn resolve_app_root() -> std::path::PathBuf {
    std::env::current_dir()
        .unwrap_or_default()
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

/// Start the single Server sidecar process during app setup.
/// This process lives for the entire desktop app lifecycle.
fn start_server_sidecar(app: &tauri::App) -> Result<Child, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {}", e))?;

    let sidecar_path = resolve_sidecar_path(&resource_dir)
        .ok_or_else(|| "Sidecar binary/script not found".to_string())?;

    let app_root = resolve_app_root();
    let app_root_str = app_root.to_string_lossy().to_string();

    // Determine if we're running a compiled binary or a .ts script
    let is_compiled = sidecar_path
        .extension()
        .map(|e| e == "exe" || e == "")
        .unwrap_or(true)
        && sidecar_path
            .file_name()
            .map(|n| n != "sidecar.ts")
            .unwrap_or(true);

    let mut cmd = if is_compiled {
        Command::new(&sidecar_path)
    } else {
        // Dev mode: run .ts with bun --hot (auto-reload on code changes)
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("bun").arg("--hot").arg("run").arg(&sidecar_path);
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("bun");
            c.arg("--hot").arg("run").arg(&sidecar_path);
            c
        }
    };

    // In dev mode, set CWD to the sidecar's directory so Bun --hot can
    // properly detect the project root and watch files for changes.
    if !is_compiled {
        if let Some(sidecar_dir) = sidecar_path.parent() {
            cmd.current_dir(sidecar_dir);
        }
    }

    let child = cmd
        .arg("server")
        .arg("--app-root")
        .arg(&app_root_str)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("3721")
        .env("PORT", "3721")
        .env("HOST", "127.0.0.1")
        .spawn()
        .map_err(|e| format!("Failed to start server sidecar: {}", e))?;

    println!("[SmartSpace] Server sidecar started (pid={})", child.id());
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Start the single Server sidecar process.
            match start_server_sidecar(app) {
                Ok(child) => {
                    app.manage(ServerSidecar(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("[SmartSpace] Failed to start server sidecar: {}", e);
                    app.manage(ServerSidecar(Mutex::new(None)));
                }
            }

            // Fallback: auto-close splash after 15s if the frontend hasn't
            // called close_splashscreen yet (e.g. JS still loading).
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(10));
                if let Some(splash) = app_handle.get_webview_window("splash") {
                    println!("[SmartSpace] Auto-closing splash (10s timeout)");
                    let _ = splash.close();
                }
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill the server sidecar when the MAIN window is destroyed.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let state = window.state::<ServerSidecar>();
                    state.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_server_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
