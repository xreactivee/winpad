use serde::Serialize;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, SystemParametersInfoW,
    SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

pub async fn com<T: Send + 'static>(f: impl FnOnce() -> windows::core::Result<T> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        f().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn focus(w: &WebviewWindow) {
    if let Ok(h) = w.hwnd() {
        let h = HWND(h.0 as _);
        unsafe {
            if !SetForegroundWindow(h).as_bool() {
                let fg_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
                let me = GetCurrentThreadId();
                let _ = AttachThreadInput(me, fg_thread, true);
                let _ = SetForegroundWindow(h);
                let _ = BringWindowToTop(h);
                let _ = AttachThreadInput(me, fg_thread, false);
            }
        }
    }
    let _ = w.set_focus();
}

pub fn hash_hex(value: impl Hash) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut h);
    format!("{:016x}", h.finish())
}

pub fn cache_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_cache_dir().unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn cache_latest(dir: &Path, prefix: &str, key: &str, write: impl FnOnce(&Path) -> Option<()>) -> Option<PathBuf> {
    let file = dir.join(format!("{prefix}-{key}"));
    if !file.exists() {
        let stale = format!("{prefix}-");
        for e in std::fs::read_dir(dir).ok()?.flatten() {
            if e.file_name().to_string_lossy().starts_with(&stale) {
                let _ = std::fs::remove_file(e.path());
            }
        }
        write(&file)?;
    }
    Some(file)
}

#[derive(Serialize, Clone, PartialEq)]
pub struct Wallpaper {
    path: String,
    version: u64,
}

fn wallpaper_source() -> Option<PathBuf> {
    let mut buf = [0u16; 1024];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            Some(buf.as_mut_ptr() as _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(0);
    let path = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
    path.exists().then_some(path)
}

fn read_wallpaper(app: &AppHandle) -> Option<Wallpaper> {
    let src = wallpaper_source()?;
    let meta = std::fs::metadata(&src).ok()?;
    let version = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs() ^ meta.len();
    let file = cache_latest(&cache_dir(app), "wallpaper", &format!("{version}.jpg"), |dst| {
        std::fs::copy(&src, dst).ok().map(drop)
    })?;
    Some(Wallpaper { path: file.to_string_lossy().into_owned(), version })
}

#[tauri::command(async)]
pub fn get_wallpaper(app: AppHandle) -> Option<Wallpaper> {
    read_wallpaper(&app)
}

pub fn watch_wallpaper(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = read_wallpaper(&app);
        loop {
            std::thread::sleep(Duration::from_secs(10));
            let now = read_wallpaper(&app);
            if now != last {
                if let Some(w) = &now {
                    let _ = app.emit("wallpaper-changed", w.clone());
                }
                last = now;
            }
        }
    });
}
