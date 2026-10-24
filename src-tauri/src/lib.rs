mod account;
mod apps;
mod files;
mod keyboard;
mod phone;
mod power;
mod shell;
mod startbutton;
mod system;
mod update;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "winpad.json";

#[derive(Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ShellSettings {
    win_key: bool,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self { win_key: true }
    }
}

fn launchpad(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("launchpad")
}

fn place_launchpad(w: &WebviewWindow) {
    let Ok(Some(mon)) = w.primary_monitor() else { return };
    let _ = w.set_position(PhysicalPosition::new(mon.position().x, mon.position().y));
    let _ = w.set_size(PhysicalSize::new(mon.size().width, mon.size().height));
}

pub fn toggle_launchpad(app: &AppHandle, search: bool) {
    let Some(w) = launchpad(app) else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.emit("launchpad-close", ());
    } else {
        place_launchpad(&w);
        let _ = w.show();
        shell::focus(&w);
        let _ = w.emit("launchpad-open", search);
    }
}

pub fn launchpad_visible(app: &AppHandle) -> bool {
    launchpad(app).is_some_and(|w| w.is_visible().unwrap_or(false))
}

pub fn close_launchpad(app: &AppHandle) {
    if let Some(w) = launchpad(app) {
        let _ = w.emit("launchpad-close", ());
    }
}

pub fn refocus_launchpad(app: &AppHandle) {
    let Some(w) = launchpad(app) else { return };
    if w.is_visible().unwrap_or(false) && !w.is_focused().unwrap_or(true) {
        shell::focus(&w);
    }
}

#[tauri::command(async)]
fn apply_settings(settings: ShellSettings) {
    keyboard::set_enabled(settings.win_key);
}

#[tauri::command(async)]
fn mask_win() {
    keyboard::mask_win();
}

#[tauri::command(async)]
fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        shell::focus(&w);
    }
}

#[tauri::command(async)]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn read_settings(app: &AppHandle) -> ShellSettings {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| open_settings(app.clone())))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            keyboard::set_enabled(read_settings(&handle).win_key);
            keyboard::start(handle.clone());
            shell::watch_wallpaper(handle.clone());
            update::watch(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            apply_settings,
            mask_win,
            open_settings,
            quit_app,
            apps::list_apps,
            apps::launch_app,
            apps::open_path,
            apps::reveal_app,
            apps::list_images,
            files::search_files,
            account::account_info,
            phone::phone_info,
            power::power_info,
            power::power_action,
            system::battery,
            system::sys_stats,
            system::media_info,
            system::media_control,
            shell::get_wallpaper,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WinPad");
}
