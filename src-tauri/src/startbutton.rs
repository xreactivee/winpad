use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants, UIA_AutomationIdPropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetWindowRect, LLMHF_INJECTED, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE,
};

struct Rects {
    near: RECT,
    start: Option<RECT>,
    search: Option<RECT>,
    at: Instant,
}

static RECTS: Mutex<Option<Rects>> = Mutex::new(None);
static REFRESH: OnceLock<SyncSender<()>> = OnceLock::new();
static SWALLOW_UP: AtomicBool = AtomicBool::new(false);

fn inside(r: &RECT, p: POINT) -> bool {
    p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
}

fn ask_refresh() {
    if let Some(tx) = REFRESH.get() {
        let _ = tx.try_send(());
    }
}

pub unsafe fn on_mouse(wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    let msg = wparam.0 as u32;
    if msg == WM_LBUTTONUP && SWALLOW_UP.swap(false, Ordering::Relaxed) {
        return Some(LRESULT(1));
    }
    if msg != WM_MOUSEMOVE && msg != WM_LBUTTONDOWN {
        return None;
    }
    let m = &*(lparam.0 as *const MSLLHOOKSTRUCT);
    let Ok(guard) = RECTS.try_lock() else { return None };
    let Some(r) = guard.as_ref() else {
        ask_refresh();
        return None;
    };
    if msg == WM_MOUSEMOVE {
        if inside(&r.near, m.pt) && r.at.elapsed() > Duration::from_millis(250) {
            ask_refresh();
        }
        return None;
    }
    let fresh = r.at.elapsed() < Duration::from_secs(5);
    let real = m.flags & LLMHF_INJECTED == 0 || crate::keyboard::accept_injected();
    let hit = |b: Option<RECT>| b.is_some_and(|b| inside(&b, m.pt));
    let search = hit(r.search);
    if real && fresh && (search || hit(r.start)) {
        SWALLOW_UP.store(true, Ordering::Relaxed);
        crate::keyboard::open_launchpad(search);
        return Some(LRESULT(1));
    }
    None
}

pub fn start() {
    let (tx, rx) = sync_channel::<()>(1);
    if REFRESH.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let Ok(uia) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) else { return };
        let by_id = |id: &str| uia.CreatePropertyCondition(UIA_AutomationIdPropertyId, &VARIANT::from(id));
        let (Ok(start_id), Ok(search_id)) = (by_id("StartButton"), by_id("SearchButton")) else { return };
        while rx.recv().is_ok() {
            let Ok(tray) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) else { continue };
            let mut t = RECT::default();
            let _ = GetWindowRect(tray, &mut t);
            let h = (t.bottom - t.top).min(t.right - t.left);
            let near = RECT { left: t.left - h, top: t.top - h, right: t.right + h, bottom: t.bottom + h };
            let xaml = FindWindowExW(Some(tray), None, w!("Windows.UI.Composition.DesktopWindowContentBridge"), PCWSTR::null());
            let root: Option<IUIAutomationElement> = uia.ElementFromHandle(xaml.unwrap_or(tray)).ok();
            let rect = |cond| {
                root.as_ref()?
                    .FindFirst(TreeScope_Descendants, cond)
                    .and_then(|b| b.CurrentBoundingRectangle())
                    .ok()
                    .filter(|r| r.right > r.left && r.bottom > r.top)
            };
            let (start, search) = (rect(&start_id), rect(&search_id));
            *RECTS.lock().unwrap_or_else(|e| e.into_inner()) = Some(Rects { near, start, search, at: Instant::now() });
        }
    });
    ask_refresh();
}
