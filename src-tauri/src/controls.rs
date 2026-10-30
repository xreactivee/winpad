use crate::shell::{com, data_dir};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;
use windows::core::{w, Interface, BSTR, GUID, HSTRING, PCWSTR, PWSTR};
use windows::Devices::Enumeration::{DeviceInformation, DeviceInformationKind};
use windows::Devices::Radios::{Radio, RadioKind, RadioState};
use windows::Devices::WiFi::{WiFiAdapter, WiFiConnectionStatus, WiFiReconnectionKind};
use windows::Foundation::IReference;
use windows::Networking::Connectivity::{NetworkAuthenticationType, NetworkConnectivityLevel, NetworkInformation};
use windows::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL, LPARAM, WPARAM};
use windows::Win32::Globalization::{GetLocaleInfoEx, LCIDToLocaleName, LOCALE_SENGLISHDISPLAYNAME, LOCALE_SISO639LANGNAME};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoSetProxyBlanket, CLSCTX_ALL, CLSCTX_INPROC_SERVER, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Power::{
    PowerCreateRequest, PowerGetActiveScheme, PowerReadACValueIndex, PowerReadDCValueIndex, PowerRequestDisplayRequired,
    PowerRequestSystemRequired, PowerSetActiveScheme, PowerSetRequest, PowerWriteACValueIndex, PowerWriteDCValueIndex,
};
use windows::Win32::System::Rpc::{RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE};
use windows::Win32::System::Registry::{RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD, RRF_RT_REG_DWORD};
use windows::Win32::System::Threading::{POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_GENERIC_FLAG_TYPE, WBEM_INFINITE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayout, GetKeyboardLayoutList, HKL};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG,
    WM_INPUTLANGCHANGEREQUEST, WM_SETTINGCHANGE,
};
use windows_collections::IIterable;

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
    NetworkInformation::GetConnectionProfiles().ok()?.into_iter().find_map(|p| {
        if !p.IsWlanConnectionProfile().ok()? || p.GetNetworkConnectivityLevel().ok()? == NetworkConnectivityLevel::None {
            return None;
        }
        let name = p.WlanConnectionProfileDetails().ok()?.GetConnectedSsid().ok()?.to_string();
        (!name.is_empty()).then_some(name)
    })
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

#[derive(Serialize)]
pub struct WifiNetwork {
    ssid: String,
    bars: u8,
    secure: bool,
    connected: bool,
}

fn wifi_adapter() -> windows::core::Result<Option<WiFiAdapter>> {
    let _ = WiFiAdapter::RequestAccessAsync()?.join();
    Ok(WiFiAdapter::FindAllAdaptersAsync()?.join()?.into_iter().next())
}

#[tauri::command]
pub async fn wifi_networks() -> Result<Vec<WifiNetwork>, String> {
    com(|| {
        let Some(adapter) = wifi_adapter()? else { return Ok(Vec::new()) };
        let _ = adapter.ScanAsync()?.join();
        let connected = ssid();
        let mut out: Vec<WifiNetwork> = Vec::new();
        for n in adapter.NetworkReport()?.AvailableNetworks()? {
            let ssid = n.Ssid()?.to_string();
            let auth = n.SecuritySettings()?.NetworkAuthenticationType()?;
            if !ssid.is_empty() {
                out.push(WifiNetwork {
                    connected: connected.as_deref() == Some(ssid.as_str()),
                    bars: n.SignalBars()?,
                    secure: auth != NetworkAuthenticationType::None && auth != NetworkAuthenticationType::Open80211,
                    ssid,
                });
            }
        }
        out.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.bars.cmp(&a.bars)));
        let mut seen = std::collections::HashSet::new();
        out.retain(|n| seen.insert(n.ssid.clone()));
        Ok(out)
    })
    .await
}

#[tauri::command]
pub async fn wifi_connect(ssid: String) -> Result<bool, String> {
    com(move || {
        let Some(adapter) = wifi_adapter()? else { return Ok(false) };
        let network = adapter
            .NetworkReport()?
            .AvailableNetworks()?
            .into_iter()
            .filter(|n| n.Ssid().is_ok_and(|s| s == ssid.as_str()))
            .max_by_key(|n| n.SignalBars().unwrap_or(0));
        let Some(network) = network else { return Ok(false) };
        let result = adapter.ConnectAsync(&network, WiFiReconnectionKind::Automatic)?.join()?;
        Ok(result.ConnectionStatus()? == WiFiConnectionStatus::Success)
    })
    .await
}

#[tauri::command]
pub async fn wifi_disconnect() -> Result<(), String> {
    com(|| {
        if let Some(adapter) = wifi_adapter()? {
            adapter.Disconnect()?;
        }
        Ok(())
    })
    .await
}

#[derive(Serialize)]
pub struct BluetoothDevice {
    name: String,
    connected: bool,
}

const BLUETOOTH_PAIRED: &str = "(System.Devices.Aep.ProtocolId:=\"{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}\" OR System.Devices.Aep.ProtocolId:=\"{bb7bb05e-5972-42b5-94fc-76eaa7084d49}\") AND System.Devices.Aep.IsPaired:=System.StructuredQueryType.Boolean#True";
const IS_CONNECTED: &str = "System.Devices.Aep.IsConnected";

#[tauri::command]
pub async fn bluetooth_devices() -> Result<Vec<BluetoothDevice>, String> {
    com(|| {
        let props = IIterable::<HSTRING>::from(vec![HSTRING::from(IS_CONNECTED)]);
        let found = DeviceInformation::FindAllAsyncWithKindAqsFilterAndAdditionalProperties(
            &HSTRING::from(BLUETOOTH_PAIRED),
            &props,
            DeviceInformationKind::AssociationEndpoint,
        )?
        .join()?;
        let mut out: Vec<BluetoothDevice> = Vec::new();
        for d in found {
            let name = d.Name()?.to_string().trim().to_string();
            let connected = d
                .Properties()
                .and_then(|p| p.Lookup(&HSTRING::from(IS_CONNECTED)))
                .and_then(|v| v.cast::<IReference<bool>>())
                .and_then(|v| v.Value())
                .unwrap_or(false);
            match out.iter_mut().find(|o| o.name == name) {
                Some(o) => o.connected |= connected,
                None if !name.is_empty() => out.push(BluetoothDevice { name, connected }),
                None => {}
            }
        }
        out.sort_by(|a, b| b.connected.cmp(&a.connected).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(out)
    })
    .await
}

unsafe fn wmi() -> windows::core::Result<IWbemServices> {
    let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;
    let services = locator.ConnectServer(&BSTR::from(r"root\WMI"), &BSTR::new(), &BSTR::new(), &BSTR::new(), 0, &BSTR::new(), None)?;
    CoSetProxyBlanket(&services, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, PCWSTR::null(), RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, None, EOAC_NONE)?;
    Ok(services)
}

unsafe fn wmi_first(services: &IWbemServices, query: &str) -> windows::core::Result<Option<IWbemClassObject>> {
    let rows = services.ExecQuery(&BSTR::from("WQL"), &BSTR::from(query), WBEM_FLAG_FORWARD_ONLY, None)?;
    let mut row = [None];
    let mut count = 0;
    rows.Next(WBEM_INFINITE, &mut row, &mut count).ok()?;
    Ok(row[0].take())
}

#[tauri::command]
pub async fn brightness() -> Result<Option<u32>, String> {
    com(|| unsafe {
        let Some(row) = wmi_first(&wmi()?, "SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active=TRUE")? else { return Ok(None) };
        let mut value = VARIANT::default();
        row.Get(w!("CurrentBrightness"), 0, &mut value, None, None)?;
        Ok(Some(u32::try_from(&value)?))
    })
    .await
}

static BRIGHTNESS_LOCK: Mutex<()> = Mutex::new(());
static BRIGHTNESS_WANTED: AtomicU32 = AtomicU32::new(0);

#[tauri::command]
pub async fn set_brightness(level: u32) -> Result<(), String> {
    let level = level.min(100);
    BRIGHTNESS_WANTED.store(level, Ordering::Relaxed);
    com(move || unsafe {
        let _held = BRIGHTNESS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if BRIGHTNESS_WANTED.load(Ordering::Relaxed) != level {
            return Ok(());
        }
        let services = wmi()?;
        let Some(monitor) = wmi_first(&services, "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active=TRUE")? else { return Ok(()) };
        let mut path = VARIANT::default();
        monitor.Get(w!("__PATH"), 0, &mut path, None, None)?;
        let mut class = None;
        services.GetObject(&BSTR::from("WmiMonitorBrightnessMethods"), WBEM_GENERIC_FLAG_TYPE(0), None, Some(&mut class), None)?;
        let Some(class) = class else { return Ok(()) };
        let mut input = None;
        class.GetMethod(w!("WmiSetBrightness"), 0, &mut input, std::ptr::null_mut())?;
        let Some(input) = input else { return Ok(()) };
        let args = input.SpawnInstance(0)?;
        args.Put(w!("Timeout"), 0, &VARIANT::from(0i32), 0)?;
        args.Put(w!("Brightness"), 0, &VARIANT::from(level as u8), 0)?;
        services.ExecMethod(&BSTR::try_from(&path)?, &BSTR::from("WmiSetBrightness"), WBEM_GENERIC_FLAG_TYPE(0), None, &args, None, None)
    })
    .await
}

const ENERGY_SAVER: GUID = GUID::from_u128(0xde830923_a562_41af_a086_e3a2c6bad2da);
const SAVER_THRESHOLD: GUID = GUID::from_u128(0xe69653ca_cf7f_4f05_aa73_cb833fa90ad4);
const SAVER_ALWAYS: u32 = 100;
const SAVER_DEFAULT: (u32, u32) = (0, 20);

#[tauri::command(async)]
pub fn set_battery_saver(app: AppHandle, on: bool) -> Result<(), String> {
    let marker = data_dir(&app).join("battery-saver.json");
    unsafe {
        let mut active: *mut GUID = std::ptr::null_mut();
        PowerGetActiveScheme(None, &mut active).ok().map_err(|e| e.to_string())?;
        let scheme = *active;
        LocalFree(Some(HLOCAL(active as _)));
        let (ac, dc) = if on {
            let (mut ac, mut dc) = (0, 0);
            let _ = PowerReadACValueIndex(None, Some(&scheme), Some(&ENERGY_SAVER), Some(&SAVER_THRESHOLD), &mut ac);
            let _ = PowerReadDCValueIndex(None, Some(&scheme), Some(&ENERGY_SAVER), Some(&SAVER_THRESHOLD), &mut dc);
            if (ac, dc) != (SAVER_ALWAYS, SAVER_ALWAYS) {
                let _ = std::fs::write(&marker, serde_json::to_vec(&(ac, dc)).unwrap_or_default());
            }
            (SAVER_ALWAYS, SAVER_ALWAYS)
        } else {
            let saved = std::fs::read(&marker).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(SAVER_DEFAULT);
            let _ = std::fs::remove_file(&marker);
            saved
        };
        let _ = PowerWriteACValueIndex(None, &scheme, Some(&ENERGY_SAVER), Some(&SAVER_THRESHOLD), ac);
        let _ = PowerWriteDCValueIndex(None, &scheme, Some(&ENERGY_SAVER), Some(&SAVER_THRESHOLD), dc);
        PowerSetActiveScheme(None, Some(&scheme)).ok().map_err(|e| e.to_string())
    }
}
