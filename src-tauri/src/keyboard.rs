use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_ESCAPE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
    SetWindowsHookExW, TranslateMessage, EVENT_OBJECT_UNCLOAKED, EVENT_SYSTEM_FOREGROUND, KBDLLHOOKSTRUCT, LLKHF_INJECTED,
    MSG, OBJID_WINDOW, WH_KEYBOARD_LL, WH_MOUSE_LL, WINEVENT_OUTOFCONTEXT, WM_KEYDOWN, WM_SYSKEYDOWN,
};

const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;
const VK_MASK: u16 = 0xE8;

#[derive(Debug, PartialEq)]
enum Action {
    Pass,
    MaskAndToggle,
}

#[derive(Default)]
struct WinKeyTracker {
    win_down: bool,
    combo: bool,
}

impl WinKeyTracker {
    fn on_key(&mut self, vk: u32, down: bool, injected: bool) -> Action {
        if injected {
            return Action::Pass;
        }
        let is_win = vk == VK_LWIN || vk == VK_RWIN;
        match (is_win, down) {
            (true, true) => {
                if !self.win_down {
                    self.win_down = true;
                    self.combo = false;
                }
                Action::Pass
            }
            (true, false) => {
                let lone = self.win_down && !self.combo;
                self.win_down = false;
                if lone { Action::MaskAndToggle } else { Action::Pass }
            }
            (false, true) => {
                if self.win_down {
                    self.combo = true;
                }
                Action::Pass
            }
            (false, false) => Action::Pass,
        }
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);
static TRACKER: Mutex<WinKeyTracker> = Mutex::new(WinKeyTracker { win_down: false, combo: false });
static ACCEPT_INJECTED: AtomicBool = AtomicBool::new(false);
static LAST_OWN: Mutex<Option<Instant>> = Mutex::new(None);
static LAST_START: Mutex<Option<Instant>> = Mutex::new(None);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

pub fn accept_injected() -> bool {
    ACCEPT_INJECTED.load(Ordering::Relaxed)
}

fn send_keys(keys: &[(u16, bool)]) {
    let inputs: Vec<INPUT> = keys
        .iter()
        .map(|&(vk, up)| {
            let mut flags = if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) };
            if vk as u32 == VK_LWIN || vk as u32 == VK_RWIN {
                flags |= KEYEVENTF_EXTENDEDKEY;
            }
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), dwFlags: flags, ..Default::default() } },
            }
        })
        .collect();
    std::thread::spawn(move || unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    });
}

fn tap(vk: u16) {
    send_keys(&[(vk, false), (vk, true)]);
}

pub fn mask_win() {
    tap(VK_MASK);
}

pub fn open_launchpad(search: bool) {
    *LAST_OWN.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    if let Some(app) = APP.get() {
        let app = app.clone();
        std::thread::spawn(move || crate::toggle_launchpad(&app, search));
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && ENABLED.load(Ordering::Relaxed) {
        let k = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let down = wparam.0 as u32 == WM_KEYDOWN || wparam.0 as u32 == WM_SYSKEYDOWN;
        let injected = k.flags.0 & LLKHF_INJECTED.0 != 0 && !accept_injected();
        let action = TRACKER.lock().map(|mut t| t.on_key(k.vkCode, down, injected)).unwrap_or(Action::Pass);
        if action == Action::MaskAndToggle {
            send_keys(&[(VK_MASK, false), (VK_MASK, true), (k.vkCode as u16, true)]);
            open_launchpad(false);
            return LRESULT(1);
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && ENABLED.load(Ordering::Relaxed) {
        if let Some(r) = crate::startbutton::on_mouse(wparam, lparam) {
            return r;
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe extern "system" fn start_menu_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if id_object != OBJID_WINDOW.0 || hwnd.is_invalid() || !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    if event == EVENT_OBJECT_UNCLOAKED && class_of(hwnd) != "Windows.UI.Core.CoreWindow" {
        return;
    }
    if !exe_of(hwnd).to_lowercase().ends_with("\\startmenuexperiencehost.exe") {
        return;
    }
    if LAST_OWN.lock().unwrap_or_else(|e| e.into_inner()).is_some_and(|t| t.elapsed() < Duration::from_secs(1)) {
        tap(VK_ESCAPE.0);
        return;
    }
    let mut last = LAST_START.lock().unwrap_or_else(|e| e.into_inner());
    if last.is_some_and(|t| t.elapsed() < Duration::from_millis(600)) {
        return;
    }
    *last = Some(Instant::now());
    tap(VK_ESCAPE.0);
    if let Some(app) = APP.get() {
        if crate::launchpad_visible(app) {
            crate::close_launchpad(app);
            return;
        }
    }
    std::thread::spawn(|| {
        let t = Instant::now();
        while focus_in_transit() && t.elapsed() < Duration::from_millis(900) {
            std::thread::sleep(Duration::from_millis(15));
        }
        std::thread::sleep(Duration::from_millis(60));
        if let Some(app) = APP.get() {
            crate::toggle_launchpad(app, false);
            std::thread::sleep(Duration::from_millis(400));
            crate::refocus_launchpad(app);
        }
    });
}

fn focus_in_transit() -> bool {
    let fg = unsafe { GetForegroundWindow() };
    if fg.is_invalid() {
        return true;
    }
    let exe = unsafe { exe_of(fg) }.to_lowercase();
    exe.is_empty() || exe.ends_with("\\startmenuexperiencehost.exe") || exe.ends_with("\\searchhost.exe")
}

unsafe fn class_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 128];
    let n = GetClassNameW(hwnd, &mut buf);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

unsafe fn exe_of(hwnd: HWND) -> String {
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
    let _ = CloseHandle(h);
    if ok { String::from_utf16_lossy(&buf[..len as usize]) } else { String::new() }
}

pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    if cfg!(debug_assertions) && std::env::var_os("WINPAD_TEST_INJECTED").is_some() {
        ACCEPT_INJECTED.store(true, Ordering::Relaxed);
    }
    crate::startbutton::start();
    hook_thread(|| unsafe {
        let module = GetModuleHandleW(None).ok();
        let _ = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module.map(|m| m.into()), 0);
    });
    hook_thread(|| unsafe {
        let module = GetModuleHandleW(None).ok();
        let _ = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), module.map(|m| m.into()), 0);
    });
    hook_thread(|| unsafe {
        for event in [EVENT_SYSTEM_FOREGROUND, EVENT_OBJECT_UNCLOAKED] {
            SetWinEventHook(event, event, None, Some(start_menu_proc), 0, 0, WINEVENT_OUTOFCONTEXT);
        }
    });
}

fn hook_thread(install: impl FnOnce() + Send + 'static) {
    std::thread::spawn(move || unsafe {
        install();
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const E: u32 = 0x45;

    #[test]
    fn lone_win_tap_toggles() {
        let mut t = WinKeyTracker::default();
        assert_eq!(t.on_key(VK_LWIN, true, false), Action::Pass);
        assert_eq!(t.on_key(VK_LWIN, false, false), Action::MaskAndToggle);
    }

    #[test]
    fn win_shortcut_does_not_toggle() {
        let mut t = WinKeyTracker::default();
        t.on_key(VK_LWIN, true, false);
        t.on_key(E, true, false);
        t.on_key(E, false, false);
        assert_eq!(t.on_key(VK_LWIN, false, false), Action::Pass);
        t.on_key(VK_RWIN, true, false);
        assert_eq!(t.on_key(VK_RWIN, false, false), Action::MaskAndToggle);
    }

    #[test]
    fn key_repeat_and_injected_events_are_ignored() {
        let mut t = WinKeyTracker::default();
        t.on_key(VK_LWIN, true, false);
        t.on_key(VK_LWIN, true, false);
        t.on_key(VK_MASK as u32, true, true);
        assert_eq!(t.on_key(VK_LWIN, false, false), Action::MaskAndToggle);
    }

    #[test]
    fn stray_win_up_does_not_toggle() {
        let mut t = WinKeyTracker::default();
        assert_eq!(t.on_key(VK_LWIN, false, false), Action::Pass);
    }
}
