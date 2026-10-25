use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once};
use windows::core::{w, BOOL, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE};
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteKeyValueW, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, RegSetKeyValueW, HKEY, HKEY_CURRENT_USER,
    KEY_READ, REG_DWORD, RRF_RT_REG_DWORD,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_GETSTATE, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowW, ShowWindowAsync, EVENT_OBJECT_SHOW, OBJID_WINDOW, SW_HIDE, SW_SHOWNA, WINEVENT_OUTOFCONTEXT,
};

const WATCHDOG_ARG: &str = "--taskbar-watchdog";
const RESTORE_ARG: &str = "--restore-taskbar";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[derive(Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    #[default]
    AutoHide,
    Hidden,
    Visible,
}

#[derive(Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Saved {
    auto_hide: bool,
    toasts: u32,
    banners: Vec<(String, Option<u32>)>,
}

impl Default for Saved {
    fn default() -> Self {
        Self { auto_hide: false, toasts: 1, banners: Vec::new() }
    }
}

static MODE: Mutex<Option<(Mode, bool)>> = Mutex::new(None);
static HIDDEN: AtomicBool = AtomicBool::new(false);
static WATCHDOG: Once = Once::new();
static SHOW_HOOK: Once = Once::new();
static BANNER_WATCH: Once = Once::new();

fn marker() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var_os("APPDATA")?).join("dev.winpad.app");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("taskbar-restore.json"))
}

fn is_tray(class: &str) -> bool {
    class == "Shell_TrayWnd" || class == "Shell_SecondaryTrayWnd"
}

unsafe extern "system" fn collect_tray(h: HWND, out: LPARAM) -> BOOL {
    if is_tray(&crate::shell::class_of(h)) {
        (*(out.0 as *mut Vec<HWND>)).push(h);
    }
    BOOL(1)
}

unsafe fn trays() -> Vec<HWND> {
    let mut out: Vec<HWND> = Vec::new();
    let _ = EnumWindows(Some(collect_tray), LPARAM(&mut out as *mut _ as isize));
    out
}

unsafe fn tray_data() -> APPBARDATA {
    APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).unwrap_or_default(),
        ..Default::default()
    }
}

unsafe fn auto_hidden() -> bool {
    let mut d = tray_data();
    SHAppBarMessage(ABM_GETSTATE, &mut d) as u32 & ABS_AUTOHIDE != 0
}

unsafe fn set_auto_hide(on: bool) {
    let mut d = tray_data();
    let state = SHAppBarMessage(ABM_GETSTATE, &mut d) as u32;
    d.lParam = LPARAM(if on { state | ABS_AUTOHIDE } else { state & !ABS_AUTOHIDE } as isize);
    SHAppBarMessage(ABM_SETSTATE, &mut d);
}

const NOTIFY_KEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings");
const TOASTS_VALUE: PCWSTR = w!("NOC_GLOBAL_SETTING_TOASTS_ENABLED");
const SHOW_BANNER: PCWSTR = w!("ShowBanner");

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn app_keys() -> Vec<String> {
    let mut key = HKEY::default();
    if RegOpenKeyExW(HKEY_CURRENT_USER, NOTIFY_KEY, None, KEY_READ, &mut key).is_err() {
        return vec![];
    }
    let mut out = Vec::new();
    for index in 0.. {
        let mut name = [0u16; 320];
        let mut len = name.len() as u32;
        if RegEnumKeyExW(key, index, Some(PWSTR(name.as_mut_ptr())), &mut len, None, None, None, None).is_err() {
            break;
        }
        out.push(String::from_utf16_lossy(&name[..len as usize]));
    }
    let _ = RegCloseKey(key);
    out
}

unsafe fn banner_of(app: &str) -> Option<u32> {
    let path = wide(&format!(r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\{app}"));
    let mut value = 0u32;
    let mut size = 4u32;
    RegGetValueW(
        HKEY_CURRENT_USER,
        PCWSTR(path.as_ptr()),
        SHOW_BANNER,
        RRF_RT_REG_DWORD,
        None,
        Some(&mut value as *mut u32 as _),
        Some(&mut size),
    )
    .is_ok()
    .then_some(value)
}

unsafe fn set_banner(app: &str, value: Option<u32>) {
    let path = wide(&format!(r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\{app}"));
    match value {
        Some(value) => {
            let _ = RegSetKeyValueW(
                HKEY_CURRENT_USER,
                PCWSTR(path.as_ptr()),
                SHOW_BANNER,
                REG_DWORD.0,
                Some(&value as *const u32 as _),
                4,
            );
        }
        None => {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), SHOW_BANNER);
        }
    }
}

fn suppress_banners(marker: &Path) {
    let mut saved = saved_from(marker);
    let known: Vec<String> = saved.banners.iter().map(|(app, _)| app.clone()).collect();
    unsafe {
        for app in app_keys() {
            if !known.contains(&app) {
                saved.banners.push((app.clone(), banner_of(&app)));
            }
            set_banner(&app, Some(0));
        }
    }
    if let Ok(bytes) = serde_json::to_vec(&saved) {
        let _ = std::fs::write(marker, bytes);
    }
}

fn restore_banners(marker: &Path) {
    let mut saved = saved_from(marker);
    if saved.banners.is_empty() {
        return;
    }
    unsafe {
        for (app, value) in &saved.banners {
            set_banner(app, *value);
        }
    }
    saved.banners.clear();
    if let Ok(bytes) = serde_json::to_vec(&saved) {
        let _ = std::fs::write(marker, bytes);
    }
}

fn watch_banners() {
    BANNER_WATCH.call_once(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let suppress = MODE.lock().unwrap_or_else(|e| e.into_inner()).is_some_and(|(_, s)| s);
            if let (true, Some(marker)) = (suppress, marker()) {
                suppress_banners(&marker);
            }
        });
    });
}

unsafe fn toasts_enabled() -> u32 {
    let mut value = 1u32;
    let mut size = 4u32;
    let _ = RegGetValueW(
        HKEY_CURRENT_USER,
        NOTIFY_KEY,
        TOASTS_VALUE,
        RRF_RT_REG_DWORD,
        None,
        Some(&mut value as *mut u32 as _),
        Some(&mut size),
    );
    value
}

unsafe fn set_toasts(on: u32) {
    let _ = RegSetKeyValueW(HKEY_CURRENT_USER, NOTIFY_KEY, TOASTS_VALUE, REG_DWORD.0, Some(&on as *const u32 as _), 4);
}

unsafe fn show_trays(show: bool) {
    for h in trays() {
        let _ = ShowWindowAsync(h, if show { SW_SHOWNA } else { SW_HIDE });
    }
}

unsafe extern "system" fn on_show(_: HWINEVENTHOOK, _: u32, hwnd: HWND, id_object: i32, _: i32, _: u32, _: u32) {
    if id_object == OBJID_WINDOW.0 && HIDDEN.load(Ordering::Relaxed) && is_tray(&crate::shell::class_of(hwnd)) {
        let _ = ShowWindowAsync(hwnd, SW_HIDE);
    }
}

fn spawn_watchdog(marker: &Path) {
    let marker = marker.to_path_buf();
    WATCHDOG.call_once(move || {
        let Ok(exe) = std::env::current_exe() else { return };
        let _ = std::process::Command::new(exe)
            .arg(WATCHDOG_ARG)
            .arg(std::process::id().to_string())
            .arg(marker)
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn();
    });
}

fn saved_from(marker: &Path) -> Saved {
    std::fs::read(marker).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn apply(mode: Mode, suppress_toasts: bool) {
    *MODE.lock().unwrap_or_else(|e| e.into_inner()) = Some((mode, suppress_toasts));
    let Some(marker) = marker() else { return };
    if mode == Mode::Visible && !suppress_toasts {
        restore();
        return;
    }
    unsafe {
        if !marker.exists() {
            let saved = Saved { auto_hide: auto_hidden(), toasts: toasts_enabled(), banners: Vec::new() };
            let Ok(bytes) = serde_json::to_vec(&saved) else { return };
            if std::fs::write(&marker, bytes).is_err() {
                return;
            }
        }
        spawn_watchdog(&marker);
        if suppress_toasts {
            suppress_banners(&marker);
            watch_banners();
        } else {
            restore_banners(&marker);
        }
        let original = saved_from(&marker);
        set_toasts(original.toasts);
        if mode == Mode::Visible {
            HIDDEN.store(false, Ordering::Relaxed);
            show_trays(true);
            set_auto_hide(original.auto_hide);
        } else {
            set_auto_hide(true);
            HIDDEN.store(mode == Mode::Hidden, Ordering::Relaxed);
            show_trays(mode != Mode::Hidden);
        }
    }
    if mode == Mode::Hidden {
        SHOW_HOOK.call_once(|| {
            crate::keyboard::hook_thread(|| unsafe {
                SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, None, Some(on_show), 0, 0, WINEVENT_OUTOFCONTEXT);
            })
        });
    }
}

pub fn reapply() {
    let current = *MODE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((mode, suppress)) = current {
        apply(mode, suppress);
    }
}

fn restore_from(marker: &Path) {
    if !marker.exists() {
        return;
    }
    restore_banners(marker);
    let saved = saved_from(marker);
    unsafe {
        show_trays(true);
        set_auto_hide(saved.auto_hide);
        set_toasts(saved.toasts);
    }
    let _ = std::fs::remove_file(marker);
}

pub fn restore() {
    HIDDEN.store(false, Ordering::Relaxed);
    if let Some(marker) = marker() {
        restore_from(&marker);
    }
}

pub fn cli() -> bool {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some(RESTORE_ARG) => {
            restore();
            true
        }
        Some(WATCHDOG_ARG) => {
            if let (Some(pid), Some(marker)) = (args.get(1).and_then(|p| p.parse::<u32>().ok()), args.get(2)) {
                unsafe {
                    if let Ok(h) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
                        WaitForSingleObject(h, INFINITE);
                        let _ = CloseHandle(h);
                    }
                }
                restore_from(Path::new(marker));
            }
            true
        }
        _ => false,
    }
}
