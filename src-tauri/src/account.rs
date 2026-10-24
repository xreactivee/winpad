use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use windows::core::{w, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::NetworkManagement::NetManagement::{NetApiBufferFree, NetUserGetInfo, USER_INFO_23, USER_INFO_24};
use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

#[derive(Serialize)]
pub struct Account {
    name: String,
    email: Option<String>,
    picture: Option<String>,
}

unsafe fn user_info<T, R>(user: &HSTRING, level: u32, read: impl FnOnce(&T) -> R) -> Option<R> {
    let mut buf = std::ptr::null_mut();
    if NetUserGetInfo(PCWSTR::null(), user, level, &mut buf) != 0 || buf.is_null() {
        return None;
    }
    let out = read(&*(buf as *const T));
    NetApiBufferFree(Some(buf as _));
    Some(out)
}

fn text(p: PWSTR) -> Option<String> {
    unsafe { p.to_string() }.ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn picture(sid: &str) -> Option<PathBuf> {
    let key = HSTRING::from(format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\AccountPicture\Users\{sid}"));
    let mut buf = [0u16; 1024];
    let mut size = size_of_val(&buf) as u32;
    unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, &key, w!("Image192"), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as _), Some(&mut size)) }
        .ok()
        .ok()?;
    let len = buf.iter().position(|&c| c == 0).unwrap_or(0);
    let path = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
    path.exists().then_some(path)
}

#[tauri::command(async)]
pub fn account_info(app: AppHandle) -> Option<Account> {
    let user = std::env::var("USERNAME").ok()?;
    let user_h = HSTRING::from(&user);
    let (full_name, sid) = unsafe {
        user_info(&user_h, 23, |u: &USER_INFO_23| {
            let mut s = PWSTR::null();
            let sid = ConvertSidToStringSidW(u.usri23_user_sid, &mut s).ok().and_then(|_| {
                let out = text(s);
                LocalFree(Some(HLOCAL(s.0 as _)));
                out
            });
            (text(u.usri23_full_name), sid)
        })
    }?;
    let email = unsafe {
        user_info(&user_h, 24, |u: &USER_INFO_24| u.usri24_internet_identity.as_bool().then(|| text(u.usri24_internet_principal_name)).flatten())
    }
    .flatten();
    let picture = sid.as_deref().and_then(picture).map(|p| {
        let _ = app.asset_protocol_scope().allow_file(&p);
        p.to_string_lossy().into_owned()
    });
    Some(Account { name: full_name.unwrap_or(user), email, picture })
}

