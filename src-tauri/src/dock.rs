use crate::shell::{class_of, hwnd_of};
use crate::taskbar;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR};
use windows::Win32::UI::Shell::{
    DefSubclassProc, SHAppBarMessage, SetWindowSubclass, ABE_BOTTOM, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE,
    ABM_SETPOS, ABN_FULLSCREENAPP, ABN_POSCHANGED, APPBARDATA,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, RegisterWindowMessageW, SetWindowPos, ShowWindow, HWND_TOPMOST, MSLLHOOKSTRUCT, SWP_NOACTIVATE,
    SW_HIDE, SW_SHOWNOACTIVATE, WM_APP, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN,
};

const INSET: f64 = 8.0;
const BAND: f64 = 0.78;
const BAND_MAX: f64 = 920.0;
const CALLBACK: u32 = WM_APP + 0x51;

#[derive(Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum Edge {
    #[default]
    Bottom,
    Top,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum Size {
    S,
    #[default]
    M,
    L,
}

impl Size {
    fn bar(self) -> f64 {
        match self {
            Size::S => 44.0,
            Size::M => 54.0,
            Size::L => 64.0,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Config {
    pub enabled: bool,
    pub taskbar: taskbar::Mode,
    pub edge: Edge,
    pub size: Size,
    pub auto_hide: bool,
    pub suppress_toasts: bool,
}

#[derive(Clone, Copy)]
struct Placed {
    hwnd: isize,
    origin: (i32, i32),
    scale: f64,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static CONFIG: Mutex<Option<Config>> = Mutex::new(None);
static PLACED: Mutex<Option<Placed>> = Mutex::new(None);
static BOUNDS: Mutex<Vec<RECT>> = Mutex::new(Vec::new());
static POPOVER_OPEN: AtomicBool = AtomicBool::new(false);
static REGISTERED: AtomicBool = AtomicBool::new(false);
static PLACING: AtomicBool = AtomicBool::new(false);
static TASKBAR_CREATED: AtomicU32 = AtomicU32::new(0);
static DISMISS: OnceLock<SyncSender<()>> = OnceLock::new();

fn config() -> Option<Config> {
    *CONFIG.lock().unwrap_or_else(|e| e.into_inner())
}

fn bar_data(hwnd: HWND) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: hwnd, ..Default::default() }
}

fn start_dismisser(app: &AppHandle) {
    let (tx, rx) = sync_channel::<()>(1);
    if DISMISS.set(tx).is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            let _ = app.emit_to("dock", "dock-dismiss", ());
        }
    });
}

pub fn apply(app: &AppHandle, cfg: Config) {
    let _ = APP.set(app.clone());
    {
        let mut current = CONFIG.lock().unwrap_or_else(|e| e.into_inner());
        if *current == Some(cfg) {
            return;
        }
        *current = Some(cfg);
    }
    start_dismisser(app);
    let Some(w) = app.get_webview_window("dock") else { return };
    let _ = app.run_on_main_thread(move || unsafe {
        if cfg.enabled {
            taskbar::apply(cfg.taskbar, cfg.suppress_toasts);
            attach(&w);
            place(&w, cfg);
            let _ = w.show();
        } else {
            if let Some(h) = hwnd_of(&w) {
                unregister(h);
            }
            let _ = w.hide();
            taskbar::restore();
        }
    });
}

unsafe fn attach(w: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(w) else { return };
    let _ = SetWindowSubclass(hwnd, Some(subclass), 1, 0);
    TASKBAR_CREATED.store(RegisterWindowMessageW(w!("TaskbarCreated")), Ordering::Relaxed);
    register(hwnd);
}

unsafe fn register(hwnd: HWND) {
    if !REGISTERED.swap(true, Ordering::Relaxed) {
        let mut abd = bar_data(hwnd);
        abd.uCallbackMessage = CALLBACK;
        SHAppBarMessage(ABM_NEW, &mut abd);
    }
}

unsafe fn unregister(hwnd: HWND) {
    if REGISTERED.swap(false, Ordering::Relaxed) {
        SHAppBarMessage(ABM_REMOVE, &mut bar_data(hwnd));
    }
}

unsafe fn place(w: &WebviewWindow, cfg: Config) {
    let (Some(hwnd), Ok(Some(mon))) = (hwnd_of(w), w.primary_monitor()) else { return };
    let scale = mon.scale_factor();
    let (x, y) = (mon.position().x, mon.position().y);
    let (mw, mh) = (mon.size().width as i32, mon.size().height as i32);
    let px = |v: f64| (v * scale).round() as i32;
    let thick = px(cfg.size.bar() + 2.0 * INSET);
    let reserve = if cfg.auto_hide { 0 } else { thick };
    let bottom = cfg.edge == Edge::Bottom;
    let mut abd = bar_data(hwnd);
    abd.uEdge = if bottom { ABE_BOTTOM } else { ABE_TOP };
    abd.rc = RECT {
        left: x,
        right: x + mw,
        top: if bottom { y + mh - reserve } else { y },
        bottom: if bottom { y + mh } else { y + reserve },
    };
    PLACING.store(true, Ordering::Relaxed);
    SHAppBarMessage(ABM_QUERYPOS, &mut abd);
    if bottom {
        abd.rc.top = abd.rc.bottom - reserve;
    } else {
        abd.rc.bottom = abd.rc.top + reserve;
    }
    SHAppBarMessage(ABM_SETPOS, &mut abd);
    PLACING.store(false, Ordering::Relaxed);
    let total = thick + (mh as f64 * BAND).min(px(BAND_MAX) as f64).round() as i32;
    let top = if bottom { abd.rc.bottom - total } else { abd.rc.top };
    let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, top, mw, total, SWP_NOACTIVATE);
    *PLACED.lock().unwrap_or_else(|e| e.into_inner()) = Some(Placed { hwnd: hwnd.0 as isize, origin: (x, top), scale });
    let (width, strip) = (mw as f64 / scale, thick as f64 / scale);
    set_region(&[[0.0, if bottom { (total - thick) as f64 / scale } else { 0.0 }, width, strip]]);
    if let Some(app) = APP.get() {
        let _ = app.emit_to("dock", "dock-placed", ());
    }
}

fn replace() {
    let (Some(app), Some(cfg)) = (APP.get(), config()) else { return };
    if !cfg.enabled {
        return;
    }
    let Some(w) = app.get_webview_window("dock") else { return };
    unsafe {
        if let Some(h) = hwnd_of(&w) {
            register(h);
        }
        place(&w, cfg);
    }
}

unsafe fn set_region(rects: &[[f64; 4]]) {
    let Some(p) = *PLACED.lock().unwrap_or_else(|e| e.into_inner()) else { return };
    let px = |v: f64| (v * p.scale).round() as i32;
    let rgn = CreateRectRgn(0, 0, 0, 0);
    let mut bounds = Vec::with_capacity(rects.len());
    for r in rects {
        let (left, top, right, bottom) = (px(r[0]) - 1, px(r[1]) - 1, px(r[0] + r[2]) + 1, px(r[1] + r[3]) + 1);
        let part = CreateRectRgn(left, top, right, bottom);
        CombineRgn(Some(rgn), Some(rgn), Some(part), RGN_OR);
        let _ = DeleteObject(part.into());
        bounds.push(RECT {
            left: left + p.origin.0,
            top: top + p.origin.1,
            right: right + p.origin.0,
            bottom: bottom + p.origin.1,
        });
    }
    if SetWindowRgn(HWND(p.hwnd as _), Some(rgn), true) == 0 {
        let _ = DeleteObject(rgn.into());
    }
    *BOUNDS.lock().unwrap_or_else(|e| e.into_inner()) = bounds;
}

unsafe extern "system" fn subclass(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _: usize, _: usize) -> LRESULT {
    if msg == CALLBACK {
        match wparam.0 as u32 {
            ABN_POSCHANGED if !PLACING.load(Ordering::Relaxed) => replace(),
            ABN_FULLSCREENAPP => fullscreen(hwnd, lparam.0 != 0),
            _ => {}
        }
        return LRESULT(0);
    }
    if msg == WM_DISPLAYCHANGE || msg == WM_DPICHANGED {
        let r = DefSubclassProc(hwnd, msg, wparam, lparam);
        replace();
        return r;
    }
    let created = TASKBAR_CREATED.load(Ordering::Relaxed);
    if created != 0 && msg == created {
        REGISTERED.store(false, Ordering::Relaxed);
        taskbar::reapply();
        replace();
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

unsafe fn fullscreen(hwnd: HWND, on: bool) {
    if !config().is_some_and(|c| c.enabled) {
        return;
    }
    if on {
        let class = class_of(GetForegroundWindow());
        if class == "Progman" || class == "WorkerW" {
            return;
        }
    }
    let _ = ShowWindow(hwnd, if on { SW_HIDE } else { SW_SHOWNOACTIVATE });
}

fn inside(r: &RECT, p: POINT) -> bool {
    p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
}

pub fn contains(p: POINT) -> bool {
    BOUNDS.try_lock().is_ok_and(|b| b.iter().any(|r| inside(r, p)))
}

pub unsafe fn on_mouse(wparam: WPARAM, lparam: LPARAM) {
    let msg = wparam.0 as u32;
    if !POPOVER_OPEN.load(Ordering::Relaxed) || !matches!(msg, WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN) {
        return;
    }
    let m = &*(lparam.0 as *const MSLLHOOKSTRUCT);
    if contains(m.pt) {
        return;
    }
    POPOVER_OPEN.store(false, Ordering::Relaxed);
    if let Some(tx) = DISMISS.get() {
        let _ = tx.try_send(());
    }
}

pub fn shutdown() {
    *CONFIG.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let hwnd = PLACED.lock().unwrap_or_else(|e| e.into_inner()).map(|p| HWND(p.hwnd as _));
    if let Some(h) = hwnd {
        unsafe { unregister(h) };
    }
    taskbar::restore();
}

#[tauri::command(async)]
pub fn dock_region(rects: Vec<[f64; 4]>) {
    unsafe { set_region(&rects) };
}

#[tauri::command(async)]
pub fn dock_popover(open: bool) {
    POPOVER_OPEN.store(open, Ordering::Relaxed);
}
