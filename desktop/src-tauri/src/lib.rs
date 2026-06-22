use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

/// Holds the server child process handle, killed on drop
struct ServerProcess(Mutex<Option<Child>>);

impl Drop for ServerProcess {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                println!("[SmartSpace] Killing server process (pid={})", child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
        }
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
            // Resolve the bundled server.js path from resources
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            // In dev mode, the server is not bundled as resource;
            // we check for the bundled file first, fall back to a relative path
            let server_path = {
                let bundled = resource_dir.join("server").join("server.js");
                if bundled.exists() {
                    bundled
                } else {
                    // Dev fallback: look for the server dist relative to the project root
                    let dev_path = std::env::current_dir()
                        .unwrap_or_default()
                        .parent()
                        .map(|p| p.join("server").join("dist").join("server.js"))
                        .unwrap_or_default();
                    if dev_path.exists() {
                        println!(
                            "[SmartSpace] Dev mode: using server at {:?}",
                            dev_path
                        );
                        dev_path
                    } else {
                        eprintln!(
                            "[SmartSpace] Server not found at bundled path {:?} or dev path {:?}",
                            bundled, dev_path
                        );
                        // Don't crash in dev – the user may start the server manually
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
        .invoke_handler(tauri::generate_handler![get_server_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
