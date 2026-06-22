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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let server_path = {
                let bundled = resource_dir.join("server").join("server.js");
                if bundled.exists() {
                    bundled
                } else {
                    let dev_path = std::env::current_dir()
                        .unwrap_or_default()
                        .parent()
                        .map(|p| p.join("server").join("dist").join("server.js"))
                        .unwrap_or_default();
                    if dev_path.exists() {
                        println!("[SmartSpace] Dev mode: using server at {:?}", dev_path);
                        dev_path
                    } else {
                        eprintln!(
                            "[SmartSpace] Server not found at {:?} or {:?}",
                            bundled, dev_path
                        );
                        app.manage(ServerProcess(Mutex::new(None)));
                        return Ok(());
                    }
                }
            };

            println!("[SmartSpace] Starting server: {:?}", server_path);

            let child = Command::new("node")
                .arg(&server_path)
                .env("PORT", "3721")
                .env("HOST", "127.0.0.1")
                .spawn()
                .expect("Failed to start Node.js server process");

            println!("[SmartSpace] Server started (pid={})", child.id());
            app.manage(ServerProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<ServerProcess>();
                state.kill();
            }
        })
        .invoke_handler(tauri::generate_handler![get_server_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
