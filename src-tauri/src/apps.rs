use crate::shell::{cache_dir, com, hash_hex};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager};
use windows::core::{Interface, GUID, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{PROPERTYKEY, SIZE};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, IShellItem2, IShellItemImageFactory,
    SHGetKnownFolderItem, SHGetKnownFolderPath, ShellExecuteExW, KF_FLAG_DEFAULT, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC,
    SEE_MASK_NO_CONSOLE, SHELLEXECUTEINFOW, SIGDN_NORMALDISPLAY, SIGDN_PARENTRELATIVEPARSING, SIIGBF_ICONONLY,
    SIIGBF_RESIZETOFIT,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const PKEY_LINK_TARGET_PARSING_PATH: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xb9b4b3fc_2b51_4a42_b5d8_324146afcf25),
    pid: 2,
};

#[derive(Serialize)]
pub struct App {
    id: String,
    name: String,
    target: Option<String>,
    icon: Option<String>,
}

unsafe fn take_pwstr(p: PWSTR) -> String {
    let s = p.to_string().unwrap_or_default();
    CoTaskMemFree(Some(p.0 as _));
    s
}

fn is_junk(name: &str, id: &str) -> bool {
    let n = name.to_lowercase();
    let id = id.to_lowercase();
    const WORDS: [&str; 9] = [
        "uninstall", "kaldır", "readme", "help", "documentation", "website", "release notes",
        "yardım", "belgeler",
    ];
    const EXTS: [&str; 6] = [".url", ".html", ".htm", ".txt", ".pdf", ".chm"];
    WORDS.iter().any(|w| n.contains(w)) || EXTS.iter().any(|e| id.ends_with(e))
}

unsafe fn resolve_known_folder(id: &str) -> Option<String> {
    let rest = id.strip_prefix('{')?;
    let (guid, tail) = rest.split_once("}\\")?;
    let guid = GUID::try_from(guid).ok()?;
    let base = SHGetKnownFolderPath(&guid, KF_FLAG_DEFAULT, None).ok()?;
    Some(format!("{}\\{}", take_pwstr(base), tail))
}

unsafe fn save_icon(item: &IShellItem, out: &Path) -> windows::core::Result<()> {
    let factory: IShellItemImageFactory = item.cast()?;
    let hbmp = factory.GetImage(SIZE { cx: 128, cy: 128 }, SIIGBF_RESIZETOFIT | SIIGBF_ICONONLY)?;
    let rgba = bitmap_rgba(hbmp);
    let _ = DeleteObject(hbmp.into());
    if let Some((w, h, px)) = rgba {
        let file = std::fs::File::create(out).map_err(|_| windows::core::Error::empty())?;
        let mut enc = png::Encoder::new(std::io::BufWriter::new(file), w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut wr = enc.write_header().map_err(|_| windows::core::Error::empty())?;
        wr.write_image_data(&px).map_err(|_| windows::core::Error::empty())?;
    }
    Ok(())
}

unsafe fn bitmap_rgba(hbmp: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    let mut bmp = BITMAP::default();
    if GetObjectW(hbmp.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut bmp as *mut _ as _)) == 0 {
        return None;
    }
    let (w, h) = (bmp.bmWidth, bmp.bmHeight);
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut px = vec![0u8; (w * h * 4) as usize];
    let dc = GetDC(None);
    let lines = GetDIBits(dc, hbmp, 0, h as u32, Some(px.as_mut_ptr() as _), &mut info, DIB_RGB_COLORS);
    ReleaseDC(None, dc);
    if lines == 0 {
        return None;
    }
    let no_alpha = px.as_chunks::<4>().0.iter().all(|p| p[3] == 0);
    for p in px.as_chunks_mut::<4>().0 {
        p.swap(0, 2);
        if no_alpha {
            p[3] = 255;
        } else if p[3] > 0 && p[3] < 255 {
            let a = p[3] as u32;
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    Some((w as u32, h as u32, px))
}

fn cached_icon(dir: &Path, key: &str, item: &IShellItem) -> Option<String> {
    let out = dir.join(format!("{}.png", hash_hex(key)));
    if !out.exists() {
        unsafe { save_icon(item, &out).ok()? };
    }
    out.exists().then(|| out.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_apps(app: AppHandle) -> Result<Vec<App>, String> {
    let dir = cache_dir(&app).join("icons");
    let _ = std::fs::create_dir_all(&dir);
    com(move || unsafe {
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems)?;
        let mut out = Vec::new();
        loop {
            let mut batch = [None];
            let mut fetched = 0;
            if items.Next(&mut batch, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = batch[0].take() else { break };
            let name = item.GetDisplayName(SIGDN_NORMALDISPLAY).map(|p| take_pwstr(p)).unwrap_or_default();
            let id = item.GetDisplayName(SIGDN_PARENTRELATIVEPARSING).map(|p| take_pwstr(p)).unwrap_or_default();
            if name.is_empty() || id.is_empty() || is_junk(&name, &id) {
                continue;
            }
            let target = item
                .cast::<IShellItem2>()
                .ok()
                .and_then(|i2| i2.GetString(&PKEY_LINK_TARGET_PARSING_PATH).ok())
                .map(|p| take_pwstr(p))
                .filter(|s| !s.is_empty())
                .or_else(|| resolve_known_folder(&id))
                .or_else(|| id.to_lowercase().ends_with(".exe").then(|| id.clone()));
            let icon = cached_icon(&dir, &id, &item);
            out.push(App { id, name, target, icon });
        }
        out.sort_by_key(|a| a.name.to_lowercase());
        out.dedup_by(|a, b| a.id == b.id);
        Ok(out)
    })
    .await
}

fn shell_open(target: &str) {
    let target = HSTRING::from(target);
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let verb = HSTRING::from("open");
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NO_CONSOLE | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(target.as_ptr()),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        let _ = ShellExecuteExW(&mut info);
        CoUninitialize();
    });
}

#[tauri::command(async)]
pub fn launch_app(id: String) {
    shell_open(&format!("shell:AppsFolder\\{id}"));
}

#[tauri::command(async)]
pub fn open_path(path: String) {
    shell_open(&path);
}

#[tauri::command(async)]
pub fn reveal_app(target: Option<String>) {
    match target.filter(|t| Path::new(t).exists()) {
        Some(t) => {
            let _ = std::process::Command::new("explorer.exe").arg(format!("/select,{t}")).spawn();
        }
        None => shell_open("shell:AppsFolder"),
    }
}

#[tauri::command(async)]
pub fn list_images(app: AppHandle, dir: String) -> Vec<String> {
    let _ = app.asset_protocol_scope().allow_directory(&dir, false);
    let Ok(rd) = std::fs::read_dir(&dir) else { return vec![] };
    let mut out: Vec<String> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp")
        })
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::is_junk;

    #[test]
    fn junk_filter() {
        assert!(is_junk("Uninstall Foo", "x"));
        assert!(is_junk("Foo'yu Kaldır", "x"));
        assert!(is_junk("Foo Website", "x"));
        assert!(is_junk("Manual", "C:\\a\\manual.pdf"));
        assert!(!is_junk("Visual Studio Code", "Microsoft.VisualStudioCode"));
        assert!(!is_junk("Hesap Makinesi", "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"));
    }
}
