use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

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
                    // current_dir in dev is desktop/src-tauri, need to go up twice to project root
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
                        eprintln!(
                            "[SmartSpace] Sidecar not found at {:?} or {:?}",
                            bundled, dev_sidecar
                        );
                        app.manage(ServerProcess(Mutex::new(None)));
                        return Ok(());
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
                let mut c = Command::new("bun");
                c.arg("run").arg(&sidecar_path);
                c
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
                .expect("Failed to start sidecar process");

            println!("[SmartSpace] Sidecar started (pid={})", child.id());
            app.manage(ServerProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .on_window_event(|window, event| {
            // Only kill the server when the MAIN window is destroyed.
            // The splash window is also closed during normal startup
            // (via close_splashscreen), which would otherwise trigger
            // a premature server kill.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let state = window.state::<ServerProcess>();
                    state.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_server_port, close_splashscreen])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
