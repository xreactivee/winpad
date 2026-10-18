use serde::{Deserialize, Serialize};
use std::time::Duration;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, LPARAM, LUID, WPARAM};
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED, SE_SHUTDOWN_NAME,
    TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES,
};
use windows::Win32::System::Power::{GetPwrCapabilities, SetSuspendState, SYSTEM_POWER_CAPABILITIES};
use windows::Win32::System::Registry::{RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_DWORD};
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, InitiateShutdownW, LockWorkStation, EWX_LOGOFF, SHTDN_REASON_FLAG_PLANNED, SHTDN_REASON_MAJOR_OTHER,
    SHUTDOWN_FLAGS, SHUTDOWN_INSTALL_UPDATES, SHUTDOWN_POWEROFF, SHUTDOWN_RESTART,
};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, HWND_BROADCAST, SC_MONITORPOWER, WM_SYSCOMMAND};

#[derive(Serialize)]
pub struct Power {
    updates: bool,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum PowerAction {
    Lock,
    SignOut,
    Sleep,
    ShutDown,
    Restart,
    UpdateShutDown,
    UpdateRestart,
}

fn updates_pending() -> bool {
    unsafe {
        let mut options = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        let flyout = RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!(r"SOFTWARE\Microsoft\WindowsUpdate\Orchestrator"),
            w!("ShutdownFlyoutOptions"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut options as *mut u32).cast()),
            Some(&mut size),
        )
        .is_ok()
            && options != 0;
        let mut key = HKEY::default();
        let reboot = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            w!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"),
            None,
            KEY_READ,
            &mut key,
        )
        .is_ok();
        if reboot {
            let _ = RegCloseKey(key);
        }
        flyout || reboot
    }
}

fn enable_shutdown_privilege() {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES, &mut token).is_err() {
            return;
        }
        let mut luid = LUID::default();
        if LookupPrivilegeValueW(PCWSTR::null(), SE_SHUTDOWN_NAME, &mut luid).is_ok() {
            let privileges = TOKEN_PRIVILEGES {
                PrivilegeCount: 1,
                Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
            };
            let _ = AdjustTokenPrivileges(token, false, Some(&privileges as *const _), 0, None, None);
        }
        let _ = CloseHandle(token);
    }
}

fn shut_down(flags: SHUTDOWN_FLAGS) {
    enable_shutdown_privilege();
    unsafe { InitiateShutdownW(PCWSTR::null(), PCWSTR::null(), 0, flags, SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_FLAG_PLANNED) };
}

fn sleep() {
    let mut caps = SYSTEM_POWER_CAPABILITIES::default();
    unsafe {
        if GetPwrCapabilities(&mut caps) && caps.AoAc {
            let _ = PostMessageW(Some(HWND_BROADCAST), WM_SYSCOMMAND, WPARAM(SC_MONITORPOWER as usize), LPARAM(2));
        } else {
            SetSuspendState(false, false, false);
        }
    }
}

#[tauri::command(async)]
pub fn power_info() -> Power {
    Power { updates: updates_pending() }
}

#[tauri::command(async)]
pub fn power_action(action: PowerAction) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        match action {
            PowerAction::Lock => unsafe {
                let _ = LockWorkStation();
            },
            PowerAction::SignOut => unsafe {
                let _ = ExitWindowsEx(EWX_LOGOFF, SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_FLAG_PLANNED);
            },
            PowerAction::Sleep => sleep(),
            PowerAction::ShutDown => shut_down(SHUTDOWN_POWEROFF),
            PowerAction::Restart => shut_down(SHUTDOWN_RESTART),
            PowerAction::UpdateShutDown => shut_down(SHUTDOWN_POWEROFF | SHUTDOWN_INSTALL_UPDATES),
            PowerAction::UpdateRestart => shut_down(SHUTDOWN_RESTART | SHUTDOWN_INSTALL_UPDATES),
        }
    });
}
