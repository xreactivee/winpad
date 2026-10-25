use crate::shell::com;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use windows::core::{w, PCWSTR, PWSTR};
use windows::Devices::Radios::{Radio, RadioKind, RadioState};
use windows::Win32::Foundation::{CloseHandle, HANDLE, LPARAM, WPARAM};
use windows::Win32::Globalization::{GetLocaleInfoEx, LCIDToLocaleName, LOCALE_SENGLISHDISPLAYNAME, LOCALE_SISO639LANGNAME};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::Power::{PowerCreateRequest, PowerRequestDisplayRequired, PowerRequestSystemRequired, PowerSetRequest};
use windows::Win32::System::Registry::{RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD, RRF_RT_REG_DWORD};
use windows::Win32::System::Threading::{POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayout, GetKeyboardLayoutList, HKL};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG,
    WM_INPUTLANGCHANGEREQUEST, WM_SETTINGCHANGE,
};

const PERSONALIZE: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");

#[derive(Serialize)]
pub struct Volume {
    level: f32,
    muted: bool,
}

unsafe fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
    let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    devices.GetDefaultAudioEndpoint(eRender, eConsole)?.Activate(CLSCTX_ALL, None)
}

#[tauri::command]
pub async fn volume() -> Result<Option<Volume>, String> {
    com(|| unsafe {
        let Ok(v) = endpoint() else { return Ok(None) };
        Ok(Some(Volume { level: v.GetMasterVolumeLevelScalar()?, muted: v.GetMute()?.as_bool() }))
    })
    .await
}

#[tauri::command]
pub async fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    com(move || unsafe {
        let v = endpoint()?;
        if let Some(level) = level {
            v.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())?;
        }
        if let Some(muted) = muted {
            v.SetMute(muted, std::ptr::null())?;
        }
        Ok(())
    })
    .await
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RadioType {
    Wifi,
    Bluetooth,
}

#[derive(Serialize)]
pub struct RadioInfo {
    kind: RadioType,
    on: bool,
}

fn radio_type(r: &Radio) -> Option<RadioType> {
    match r.Kind().ok()? {
        RadioKind::WiFi => Some(RadioType::Wifi),
        RadioKind::Bluetooth => Some(RadioType::Bluetooth),
        _ => None,
    }
}

fn all_radios() -> windows::core::Result<Vec<Radio>> {
    let _ = Radio::RequestAccessAsync()?.join();
    Ok(Radio::GetRadiosAsync()?.join()?.into_iter().collect())
}

#[tauri::command]
pub async fn radios() -> Result<Vec<RadioInfo>, String> {
    com(|| {
        let mut out: Vec<RadioInfo> = Vec::new();
        for r in all_radios()? {
            let Some(kind) = radio_type(&r) else { continue };
            if out.iter().any(|o| o.kind == kind) {
                continue;
            }
            out.push(RadioInfo { kind, on: r.State()? == RadioState::On });
        }
        Ok(out)
    })
    .await
}

#[tauri::command]
pub async fn set_radio(kind: RadioType, on: bool) -> Result<(), String> {
    com(move || {
        for r in all_radios()? {
            if radio_type(&r) == Some(kind) {
                r.SetStateAsync(if on { RadioState::On } else { RadioState::Off })?.join()?;
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command(async)]
pub fn theme() -> bool {
    let mut light = 1u32;
    let mut size = 4u32;
    unsafe {
        let _ = RegGetValueW(
            HKEY_CURRENT_USER,
            PERSONALIZE,
            w!("AppsUseLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut light as *mut u32 as _),
            Some(&mut size),
        );
    }
    light == 0
}

#[tauri::command(async)]
pub fn set_theme(dark: bool) {
    let light: u32 = if dark { 0 } else { 1 };
    unsafe {
        for name in [w!("AppsUseLightTheme"), w!("SystemUsesLightTheme")] {
            let _ = RegSetKeyValueW(HKEY_CURRENT_USER, PERSONALIZE, name, REG_DWORD.0, Some(&light as *const u32 as _), 4);
        }
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(0),
            LPARAM(w!("ImmersiveColorSet").as_ptr() as isize),
            SMTO_ABORTIFHUNG,
            100,
            None,
        );
    }
}

static AWAKE: Mutex<Option<isize>> = Mutex::new(None);

#[tauri::command(async)]
pub fn keep_awake() -> bool {
    AWAKE.lock().unwrap_or_else(|e| e.into_inner()).is_some()
}

#[tauri::command(async)]
pub fn set_keep_awake(on: bool) -> bool {
    let mut held = AWAKE.lock().unwrap_or_else(|e| e.into_inner());
    unsafe {
        if on && held.is_none() {
            let context = REASON_CONTEXT {
                Version: 0,
                Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
                Reason: REASON_CONTEXT_0 { SimpleReasonString: PWSTR(w!("WinPad Keep Awake").as_ptr() as _) },
            };
            if let Ok(h) = PowerCreateRequest(&context) {
                let _ = PowerSetRequest(h, PowerRequestDisplayRequired);
                let _ = PowerSetRequest(h, PowerRequestSystemRequired);
                *held = Some(h.0 as isize);
            }
        } else if !on {
            if let Some(h) = held.take() {
                let _ = CloseHandle(HANDLE(h as _));
            }
        }
    }
    held.is_some()
}

#[derive(Serialize)]
pub struct Layout {
    id: isize,
    code: String,
    name: String,
}

#[derive(Serialize)]
pub struct Layouts {
    current: isize,
    list: Vec<Layout>,
}

unsafe fn locale_info(locale: &[u16], kind: u32) -> String {
    let mut buf = [0u16; 128];
    let n = GetLocaleInfoEx(PCWSTR(locale.as_ptr()), kind, Some(&mut buf));
    String::from_utf16_lossy(&buf[..(n.max(1) - 1) as usize])
}

#[tauri::command(async)]
pub fn keyboard_layouts() -> Layouts {
    unsafe {
        let count = GetKeyboardLayoutList(None).max(0) as usize;
        let mut hkls = vec![HKL::default(); count];
        GetKeyboardLayoutList(Some(&mut hkls));
        let thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let current = GetKeyboardLayout(thread).0 as isize;
        let list = hkls
            .into_iter()
            .map(|hkl| {
                let mut locale = [0u16; 85];
                LCIDToLocaleName((hkl.0 as usize & 0xffff) as u32, Some(&mut locale), 0);
                Layout {
                    id: hkl.0 as isize,
                    code: locale_info(&locale, LOCALE_SISO639LANGNAME).to_uppercase(),
                    name: locale_info(&locale, LOCALE_SENGLISHDISPLAYNAME),
                }
            })
            .collect();
        Layouts { current, list }
    }
}

#[tauri::command(async)]
pub fn set_keyboard_layout(id: isize) {
    unsafe {
        let _ = PostMessageW(Some(GetForegroundWindow()), WM_INPUTLANGCHANGEREQUEST, WPARAM(0), LPARAM(id));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickInfo {
    airplane: bool,
    battery_saver: bool,
    ssid: Option<String>,
}

fn ssid() -> Option<String> {
    let profile = windows::Networking::Connectivity::NetworkInformation::GetInternetConnectionProfile().ok()?;
    let name = profile.WlanConnectionProfileDetails().ok()?.GetConnectedSsid().ok()?.to_string();
    (!name.is_empty()).then_some(name)
}

#[tauri::command]
pub async fn quick_info() -> Result<QuickInfo, String> {
    com(|| {
        let radios = all_radios().unwrap_or_default();
        let airplane = !radios.is_empty() && radios.iter().all(|r| r.State().is_ok_and(|s| s != RadioState::On));
        let battery_saver = windows::System::Power::PowerManager::EnergySaverStatus()
            .is_ok_and(|s| s == windows::System::Power::EnergySaverStatus::On);
        Ok(QuickInfo { airplane, battery_saver, ssid: ssid() })
    })
    .await
}

#[tauri::command]
pub async fn set_airplane_mode(on: bool) -> Result<(), String> {
    com(move || {
        for r in all_radios()? {
            if radio_type(&r).is_some() {
                r.SetStateAsync(if on { RadioState::Off } else { RadioState::On })?.join()?;
            }
        }
        Ok(())
    })
    .await
}
