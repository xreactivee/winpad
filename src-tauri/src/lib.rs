mod account;
mod ai;
mod apps;
mod calendar;
mod controls;
mod dock;
mod files;
mod keyboard;
mod notifications;
mod phone;
mod power;
mod screentime;
mod shell;
mod startbutton;
mod system;
mod taskbar;
mod tasks;
mod update;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewWindow};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "winpad.json";

#[derive(Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ShellSettings {
    win_key: bool,
    dock: bool,
    dock_taskbar: taskbar::Mode,
    dock_edge: dock::Edge,
    dock_size: dock::Size,
    dock_auto_hide: bool,
    suppress_toasts: bool,
    screen_time: bool,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            win_key: true,
            dock: false,
            dock_taskbar: taskbar::Mode::default(),
            dock_edge: dock::Edge::default(),
            dock_size: dock::Size::default(),
            dock_auto_hide: false,
            suppress_toasts: false,
            screen_time: false,
        }
    }
}

fn apply(app: &AppHandle, s: &ShellSettings) {
    keyboard::set_enabled(s.win_key);
    dock::apply(
        app,
        dock::Config {
            enabled: s.dock,
            taskbar: s.dock_taskbar,
            edge: s.dock_edge,
            size: s.dock_size,
            auto_hide: s.dock_auto_hide,
            suppress_toasts: s.suppress_toasts,
        },
    );
    screentime::set_enabled(app, s.dock && s.screen_time);
}

pub fn apply_stored(app: &AppHandle) {
    apply(app, &read_settings(app));
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
fn apply_settings(app: AppHandle, settings: ShellSettings) {
    apply(&app, &settings);
}

#[tauri::command(async)]
fn launchpad_toggle(search: bool) {
    keyboard::open_launchpad(search);
}

#[tauri::command(async)]
fn mask_win() {
    keyboard::mask_win();
}

#[tauri::command(async)]
fn open_settings(app: AppHandle, section: Option<String>) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        shell::focus(&w);
        if let Some(section) = section {
            let _ = w.emit("settings-section", section);
        }
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

pub fn cli() -> bool {
    taskbar::cli()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| open_settings(app.clone(), None)))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            apply_stored(&handle);
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
            launchpad_toggle,
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
            dock::dock_region,
            dock::dock_popover,
            tasks::list_windows,
            tasks::window_action,
            tasks::taskbar_pins,
            controls::volume,
            controls::set_volume,
            controls::radios,
            controls::set_radio,
            controls::theme,
            controls::set_theme,
            controls::keep_awake,
            controls::set_keep_awake,
            controls::keyboard_layouts,
            controls::set_keyboard_layout,
            files::recent_files,
            files::recycle_bin,
            files::empty_recycle_bin,
            screentime::screen_time,
            screentime::clear_screen_time,
            ai::ai_usage,
            calendar::fetch_calendar,
            controls::quick_info,
            controls::set_airplane_mode,
            notifications::notifications,
            notifications::dismiss_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building WinPad")
        .run(|_, event| {
            if let RunEvent::Exit = event {
                dock::shutdown();
            }
        });
}
