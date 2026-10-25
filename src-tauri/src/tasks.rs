use crate::apps::{cached_icon, take_pwstr};
use crate::shell::{cache_dir, com, exe_of, focus_hwnd};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use windows::core::{BOOL, GUID, HSTRING};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, PROPERTYKEY, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::Shell::{IShellItem, SHCreateItemFromParsingName};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindow, IsWindowVisible, PostMessageW, ShowWindowAsync, GWL_EXSTYLE, GW_OWNER, SW_MINIMIZE, SW_RESTORE, WM_CLOSE,
    WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

const PKEY_APP_USER_MODEL_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
    pid: 5,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Win {
    hwnd: isize,
    title: String,
    exe: String,
    app_id: Option<String>,
    icon: Option<String>,
    active: bool,
    minimized: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowAction {
    Focus,
    Minimize,
    Close,
    EndTask,
}

pub unsafe fn app_id(h: HWND) -> Option<String> {
    let store: IPropertyStore = SHGetPropertyStoreForWindow(h).ok()?;
    let value = store.GetValue(&PKEY_APP_USER_MODEL_ID).ok()?;
    let id = take_pwstr(PropVariantToStringAlloc(&value).ok()?);
    (!id.is_empty()).then_some(id)
}

unsafe extern "system" fn collect(h: HWND, out: LPARAM) -> BOOL {
    (*(out.0 as *mut Vec<HWND>)).push(h);
    BOOL(1)
}

unsafe fn is_task(h: HWND) -> bool {
    if !IsWindowVisible(h).as_bool() {
        return false;
    }
    let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
    let app_window = ex & WS_EX_APPWINDOW.0 != 0;
    if ex & WS_EX_TOOLWINDOW.0 != 0 && !app_window {
        return false;
    }
    if !app_window && GetWindow(h, GW_OWNER).is_ok_and(|o| !o.is_invalid()) {
        return false;
    }
    let mut cloaked = 0u32;
    let _ = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut u32 as _, 4);
    cloaked == 0
}

unsafe fn title_of(h: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = GetWindowTextW(h, &mut buf);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

#[tauri::command]
pub async fn list_windows(app: AppHandle) -> Result<Vec<Win>, String> {
    let dir = cache_dir(&app).join("icons");
    let own: Vec<isize> = app.webview_windows().values().filter_map(|w| w.hwnd().ok()).map(|h| h.0 as isize).collect();
    com(move || unsafe {
        let mut all: Vec<HWND> = Vec::new();
        EnumWindows(Some(collect), LPARAM(&mut all as *mut _ as isize))?;
        let fg = GetForegroundWindow();
        Ok(all
            .into_iter()
            .filter(|h| !own.contains(&(h.0 as isize)) && is_task(*h))
            .filter_map(|h| {
                let title = title_of(h);
                if title.is_empty() {
                    return None;
                }
                let exe = exe_of(h);
                let icon = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(&exe), None)
                    .ok()
                    .and_then(|item| cached_icon(&dir, &exe, &item));
                Some(Win {
                    hwnd: h.0 as isize,
                    title,
                    app_id: app_id(h),
                    icon,
                    exe,
                    active: h == fg,
                    minimized: IsIconic(h).as_bool(),
                })
            })
            .collect())
    })
    .await
}

#[tauri::command(async)]
pub fn window_action(hwnd: isize, action: WindowAction) {
    let h = HWND(hwnd as _);
    unsafe {
        if !IsWindow(Some(h)).as_bool() {
            return;
        }
        match action {
            WindowAction::Focus => {
                let minimized = IsIconic(h).as_bool();
                if GetForegroundWindow() == h && !minimized {
                    let _ = ShowWindowAsync(h, SW_MINIMIZE);
                } else {
                    if minimized {
                        let _ = ShowWindowAsync(h, SW_RESTORE);
                    }
                    focus_hwnd(h);
                }
            }
            WindowAction::Minimize => {
                let _ = ShowWindowAsync(h, SW_MINIMIZE);
            }
            WindowAction::Close => {
                let _ = PostMessageW(Some(h), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            WindowAction::EndTask => {
                let mut pid = 0u32;
                GetWindowThreadProcessId(h, Some(&mut pid));
                if pid != std::process::id() {
                    if let Ok(p) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                        let _ = TerminateProcess(p, 1);
                        let _ = CloseHandle(p);
                    }
                }
            }
        }
    }
}

#[tauri::command(async)]
pub fn taskbar_pins() -> Vec<String> {
    let Some(appdata) = std::env::var_os("APPDATA") else { return vec![] };
    let dir = PathBuf::from(appdata).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar");
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    let mut pins: Vec<(std::time::SystemTime, String)> = rd
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")))
        .filter_map(|e| {
            let created = e.metadata().and_then(|m| m.created()).unwrap_or(std::time::UNIX_EPOCH);
            Some((created, e.path().file_stem()?.to_string_lossy().into_owned()))
        })
        .collect();
    pins.sort();
    pins.into_iter().map(|(_, name)| name).collect()
}
