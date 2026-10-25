use crate::shell::{data_dir, exe_of};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use windows::Win32::System::SystemInformation::{GetLocalTime, GetTickCount};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

const TICK: u64 = 5;
const IDLE_MS: u32 = 120_000;
const KEEP_DAYS: usize = 8;
const SAVE_EVERY: u64 = 12;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Day {
    date: String,
    total: u64,
    hours: Vec<u64>,
    apps: BTreeMap<String, u64>,
}

static ENABLED: AtomicBool = AtomicBool::new(false);
static FILE: OnceLock<PathBuf> = OnceLock::new();
static DAYS: Mutex<Option<Vec<Day>>> = Mutex::new(None);

fn file(app: &AppHandle) -> &'static PathBuf {
    FILE.get_or_init(|| data_dir(app).join("screentime.json"))
}

fn load() -> Vec<Day> {
    FILE.get()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save() {
    let days = DAYS.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if let (Some(path), Some(days)) = (FILE.get(), days) {
        if let Ok(bytes) = serde_json::to_vec(&days) {
            let _ = std::fs::write(path, bytes);
        }
    }
}

unsafe fn current_app() -> Option<String> {
    let mut input = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if GetLastInputInfo(&mut input).as_bool() && GetTickCount().wrapping_sub(input.dwTime) > IDLE_MS {
        return None;
    }
    let fg = GetForegroundWindow();
    if fg.is_invalid() {
        return None;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(fg, Some(&mut pid));
    if pid == std::process::id() {
        return None;
    }
    let exe = exe_of(fg);
    if exe.to_lowercase().ends_with("\\applicationframehost.exe") {
        return crate::tasks::app_id(fg);
    }
    (!exe.is_empty()).then_some(exe)
}

fn record(key: String) {
    let t = unsafe { GetLocalTime() };
    let date = format!("{:04}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay);
    let mut guard = DAYS.lock().unwrap_or_else(|e| e.into_inner());
    let days = guard.get_or_insert_with(load);
    if days.last().is_none_or(|d| d.date != date) {
        days.push(Day { date, hours: vec![0; 24], ..Default::default() });
        if days.len() > KEEP_DAYS {
            days.remove(0);
        }
    }
    if let Some(day) = days.last_mut() {
        day.total += TICK;
        if let Some(h) = day.hours.get_mut(t.wHour as usize) {
            *h += TICK;
        }
        *day.apps.entry(key).or_default() += TICK;
    }
}

pub fn set_enabled(app: &AppHandle, on: bool) {
    let was = ENABLED.swap(on, Ordering::Relaxed);
    if !on || was {
        return;
    }
    file(app);
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        std::thread::spawn(|| {
            let mut ticks = 0u64;
            loop {
                std::thread::sleep(Duration::from_secs(TICK));
                if !ENABLED.load(Ordering::Relaxed) {
                    continue;
                }
                if let Some(key) = unsafe { current_app() } {
                    record(key);
                }
                ticks += 1;
                if ticks.is_multiple_of(SAVE_EVERY) {
                    save();
                }
            }
        });
    });
}

#[tauri::command(async)]
pub fn screen_time(app: AppHandle) -> Vec<Day> {
    file(&app);
    DAYS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(load).clone()
}

#[tauri::command(async)]
pub fn clear_screen_time(app: AppHandle) {
    file(&app);
    *DAYS.lock().unwrap_or_else(|e| e.into_inner()) = Some(Vec::new());
    save();
}
