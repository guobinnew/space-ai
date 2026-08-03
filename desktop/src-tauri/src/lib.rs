use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Returns the path to ~/.spaceai/server.port (the file the agent server writes
/// its actual listening port to, in case the default 3721 was unavailable).
fn server_port_file_path() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))?;
    Some(std::path::PathBuf::from(home).join(".spaceai").join("server.port"))
}

/// Returns the path to ~/.spaceai/ (the user-level config/data directory).
fn home_spaceai_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))?;
    Some(std::path::PathBuf::from(home).join(".spaceai"))
}

/// Sync bundled docs from `resource_dir/doc/` to `~/.spaceai/doc/`.
///
/// Skipped when the installed version marker matches the running app version
/// (avoids re-copying on every launch). On any error logs a warning but
/// never aborts startup — the docs tab will just show an empty list.
fn sync_bundled_docs(resource_dir: &std::path::Path, app_version: &str) {
    let Some(ref spaceai_dir) = home_spaceai_dir() else {
        eprintln!("[SmartLab] sync_docs: cannot resolve home dir, skipping");
        return;
    };

    let src_doc = resource_dir.join("doc");
    let dst_doc = spaceai_dir.join("doc");
    let version_marker = dst_doc.join(".installed-version");

    // Skip if version marker already matches current app version.
    if let Ok(installed) = std::fs::read_to_string(&version_marker) {
        if installed.trim() == app_version {
            return;
        }
    }

    if !src_doc.exists() {
        // Dev mode or no bundled docs — silently skip. Frontend falls back
        // to the project doc directory in dev.
        return;
    }

    // Ensure target dir exists.
    if let Err(e) = std::fs::create_dir_all(&dst_doc) {
        eprintln!("[SmartLab] sync_docs: create_dir_all failed: {}", e);
        return;
    }

    // Walk the source doc tree and copy each file (overwrite).
    let mut copied: u32 = 0;
    let mut errors: u32 = 0;
    fn walk_copy(src: &std::path::Path, dst: &std::path::Path, copied: &mut u32, errors: &mut u32) {
        let entries = match std::fs::read_dir(src) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[SmartLab] sync_docs: read_dir {:?} failed: {}", src, e);
                *errors += 1;
                return;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let dst_path = dst.join(&name);
            if path.is_dir() {
                if let Err(e) = std::fs::create_dir_all(&dst_path) {
                    eprintln!("[SmartLab] sync_docs: mkdir {:?} failed: {}", dst_path, e);
                    *errors += 1;
                    continue;
                }
                walk_copy(&path, &dst_path, copied, errors);
            } else if path.is_file() {
                if let Err(e) = std::fs::copy(&path, &dst_path) {
                    eprintln!("[SmartLab] sync_docs: copy {:?} -> {:?} failed: {}", path, dst_path, e);
                    *errors += 1;
                } else {
                    *copied += 1;
                }
            }
        }
    }
    walk_copy(&src_doc, &dst_doc, &mut copied, &mut errors);

    // Clean stale files that no longer exist in source (best-effort).
    fn prune_stale(src: &std::path::Path, dst: &std::path::Path) {
        let Ok(dst_entries) = std::fs::read_dir(dst) else { return };
        for entry in dst_entries.flatten() {
            let name = entry.file_name();
            // Never remove the version marker here.
            if name == ".installed-version" { continue; }
            let dst_path = entry.path();
            let src_path = src.join(&name);
            if !src_path.exists() {
                let _ = std::fs::remove_dir_all(&dst_path).or_else(|_| std::fs::remove_file(&dst_path));
            } else if dst_path.is_dir() && src_path.is_dir() {
                prune_stale(&src_path, &dst_path);
            }
        }
    }
    prune_stale(&src_doc, &dst_doc);

    // Write version marker.
    let _ = std::fs::write(&version_marker, app_version);

    println!(
        "[SmartLab] sync_docs: copied {} files, {} errors (version {})",
        copied, errors, app_version
    );
}

/// Read the actual server port from ~/.spaceai/server.port.
/// Falls back to 3721 if the file doesn't exist or is invalid.
fn read_server_port() -> u16 {
    if let Some(ref path) = server_port_file_path() {
        if let Ok(content) = std::fs::read_to_string(path) {
            let trimmed = content.trim();
            if let Ok(port) = trimmed.parse::<u16>() {
                if port > 0 {
                    return port;
                }
            }
        }
    }
    3721
}

/// Delete the server.port file so stale data isn't read before the server starts.
fn clear_server_port_file() {
    if let Some(ref path) = server_port_file_path() {
        let _ = std::fs::write(path, "");
    }
}

/// Holds the single Server sidecar process (lives for the entire app lifecycle).
struct ServerSidecar(Mutex<Option<Child>>);

impl ServerSidecar {
    fn kill(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                let pid = child.id();
                println!("[SmartLab] Killing server sidecar (pid={})", pid);

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

                println!("[SmartLab] Server sidecar killed");
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

/// Close the splash window and show the main window.
/// Called when the server is confirmed ready (or on timeout fallback).
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        println!("[SmartLab] Closing splash window...");
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        println!("[SmartLab] Showing main window...");
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    // Legacy command — now handled by the Rust readiness check thread.
    // kept for backward compatibility but does nothing (the Rust thread
    // will close the splash when the server is ready).
    println!("[SmartLab] close_splashscreen called from frontend (handled by Rust readiness check)");
    let _ = &app;
}

/// Wait for the server to be ready by polling the port file and doing a TCP
/// connect check. Returns the port if ready, or None on timeout.
fn wait_for_server_ready(timeout: std::time::Duration) -> Option<u16> {
    let start = std::time::Instant::now();
    let check_interval = std::time::Duration::from_millis(500);

    loop {
        if start.elapsed() > timeout {
            return None;
        }

        // Read the port file
        if let Some(ref path) = server_port_file_path() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let trimmed = content.trim();
                if let Ok(port) = trimmed.parse::<u16>() {
                    if port > 0 {
                        // Try TCP connect to verify the server is actually listening
                        let addr = format!("127.0.0.1:{}", port);
                        match std::net::TcpStream::connect_timeout(
                            &addr.parse().unwrap_or_else(|_| "127.0.0.1:3721".parse().unwrap()),
                            std::time::Duration::from_secs(2),
                        ) {
                            Ok(_) => {
                                println!("[SmartLab] Server is ready on port {}", port);
                                return Some(port);
                            }
                            Err(_) => {
                                // Port file exists but TCP connect failed — server might
                                // still be starting up, or it's a zombie socket.
                                // Keep polling.
                            }
                        }
                    }
                }
            }
        }

        std::thread::sleep(check_interval);
    }
}

/// Get the server sidecar port — reads from ~/.spaceai/server.port (written by
/// the agent server), falls back to 3721.
#[tauri::command]
fn get_server_port() -> u16 {
    read_server_port()
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
            println!("[SmartLab] Dev mode: using sidecar at {:?}", path);
            return Some(path.clone());
        }
    }

    eprintln!(
        "[SmartLab] Sidecar not found at {:?} or {:?}",
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
    // Read the last successfully used port before clearing the file.
    // This allows the server to try the same port first, avoiding unnecessary
    // retries on 3721 if a previous run already moved to a fallback port.
    let last_port = read_server_port();
    println!("[SmartLab] Last successful port: {}, using as primary", last_port);

    // Clear the stale port file so the readiness check knows to wait for a
    // fresh value from the new server instance.
    clear_server_port_file();

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

    let port_str = last_port.to_string();

    let child = cmd
        .arg("server")
        .arg("--app-root")
        .arg(&app_root_str)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(&port_str)
        .env("PORT", &port_str)
        .env("HOST", "127.0.0.1")
        .spawn()
        .map_err(|e| format!("Failed to start server sidecar: {}", e))?;

    println!("[SmartLab] Server sidecar started (pid={}, port={})", child.id(), last_port);
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Sync bundled docs (~/.spaceai/doc/) from resources.
            // App version is read from tauri.conf.json at compile time.
            let app_version = app.package_info().version.to_string();
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| format!("failed to resolve resource dir: {}", e))?;
            sync_bundled_docs(&resource_dir, &app_version);

            // Start the single Server sidecar process.
            match start_server_sidecar(app) {
                Ok(child) => {
                    app.manage(ServerSidecar(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("[SmartLab] Failed to start server sidecar: {}", e);
                    app.manage(ServerSidecar(Mutex::new(None)));
                }
            }

            // Wait for the server to be ready before showing the main window.
            // This ensures the frontend can connect immediately when it loads.
            // The server resolves port conflicts (zombie sockets, EADDRINUSE)
            // during this wait period.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let timeout = std::time::Duration::from_secs(60);
                println!("[SmartLab] Waiting for server to be ready (timeout {}s)...", timeout.as_secs());

                match wait_for_server_ready(timeout) {
                    Some(port) => {
                        println!("[SmartLab] Server ready on port {}, showing main window", port);
                    }
                    None => {
                        eprintln!("[SmartLab] Server startup timeout ({}s), showing main window anyway", timeout.as_secs());
                    }
                }

                show_main_window(&app_handle);
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
