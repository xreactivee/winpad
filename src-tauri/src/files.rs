use crate::apps::cached_icon;
use crate::shell::{cache_dir, com};
use serde::Serialize;
use std::mem::{offset_of, size_of, ManuallyDrop};
use std::path::Path;
use tauri::AppHandle;
use windows::core::{w, Interface, GUID, HSTRING, IUnknown};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Search::{
    IAccessor, ICommandText, IDBCreateCommand, IDBCreateSession, IDBInitialize, IDataInitialize, IRowset, DBACCESSOR_ROWDATA,
    DBBINDING, DBMEMOWNER_CLIENTOWNED, DBPARAMIO_NOTPARAM, DBPART_LENGTH, DBPART_STATUS, DBPART_VALUE, DBSTATUS_S_OK,
    DBTYPE_WSTR, HACCESSOR,
};
use windows::Win32::UI::Shell::{IShellItem, SHCreateItemFromParsingName};

const CLSID_MSDAINITIALIZE: GUID = GUID::from_u128(0x2206cdb0_19c1_11d1_89e0_00c04fd7a829);
const DBGUID_DEFAULT: GUID = GUID::from_u128(0xc8b521fb_5cf3_11ce_ade5_00aa0044773d);
const CANDIDATES: usize = 40;
const MAX_RESULTS: usize = 10;
const NOISE_FOLDERS: &str = r#""node_modules" OR "target" OR "AppData""#;

#[derive(Serialize)]
pub struct FileHit {
    name: String,
    path: String,
    folder: bool,
    icon: Option<String>,
}

#[repr(C)]
struct Cell {
    status: u32,
    len: usize,
    text: [u16; 1024],
}

fn search_sql(query: &str, limit: usize) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.replace(['"', '\'', '*'], ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}*\""))
        .collect();
    if terms.is_empty() {
        return None;
    }
    Some(format!(
        "SELECT TOP {limit} System.ItemUrl FROM SystemIndex \
         WHERE SCOPE='file:' AND System.ItemType <> '.lnk' AND CONTAINS(System.FileName, '{}') \
         AND NOT CONTAINS(System.ItemFolderPathDisplay, '{NOISE_FOLDERS}') \
         ORDER BY System.DateModified DESC",
        terms.join(" AND ")
    ))
}

fn best_matches(query: &str, urls: Vec<String>, limit: usize) -> Vec<String> {
    let q = query.trim().to_lowercase();
    let mut paths: Vec<(u8, String)> = urls
        .into_iter()
        .filter_map(|u| u.strip_prefix("file:").map(|p| p.replace('/', "\\")))
        .map(|p| {
            let name = Path::new(&p).file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
            let stem = Path::new(&name).file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            (if stem == q || name == q { 0 } else if name.starts_with(&q) { 1 } else { 2 }, p)
        })
        .collect();
    paths.sort_by_key(|(tier, _)| *tier);
    paths.into_iter().take(limit).map(|(_, p)| p).collect()
}

unsafe fn query_index(sql: &str) -> windows::core::Result<Vec<String>> {
    let init: IDataInitialize = CoCreateInstance(&CLSID_MSDAINITIALIZE, None, CLSCTX_INPROC_SERVER)?;
    let mut source: Option<IUnknown> = None;
    init.GetDataSource(
        None,
        CLSCTX_INPROC_SERVER.0,
        w!("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';"),
        &IDBInitialize::IID,
        &mut source,
    )?;
    let source: IDBInitialize = source.ok_or_else(windows::core::Error::empty)?.cast()?;
    source.Initialize()?;
    let session: IDBCreateCommand = source.cast::<IDBCreateSession>()?.CreateSession(None, &IDBCreateCommand::IID)?.cast()?;
    let command: ICommandText = session.CreateCommand(None, &ICommandText::IID)?.cast()?;
    command.SetCommandText(&DBGUID_DEFAULT, &HSTRING::from(sql))?;
    let mut rows: Option<IUnknown> = None;
    command.Execute(None, &IRowset::IID, None, None, Some(&mut rows))?;
    let rowset: IRowset = rows.ok_or_else(windows::core::Error::empty)?.cast()?;

    let binding = DBBINDING {
        iOrdinal: 1,
        obValue: offset_of!(Cell, text),
        obLength: offset_of!(Cell, len),
        obStatus: offset_of!(Cell, status),
        pTypeInfo: ManuallyDrop::new(None),
        dwPart: (DBPART_VALUE.0 | DBPART_LENGTH.0 | DBPART_STATUS.0) as u32,
        dwMemOwner: DBMEMOWNER_CLIENTOWNED.0 as u32,
        eParamIO: DBPARAMIO_NOTPARAM.0 as u32,
        cbMaxLen: size_of::<[u16; 1024]>(),
        wType: DBTYPE_WSTR.0 as u16,
        ..Default::default()
    };
    let accessor: IAccessor = rowset.cast()?;
    let mut handle = HACCESSOR::default();
    accessor.CreateAccessor(DBACCESSOR_ROWDATA.0 as u32, 1, &binding, size_of::<Cell>(), &mut handle, None)?;

    let mut fetched = [std::ptr::null_mut::<usize>(); CANDIDATES];
    let mut count = 0usize;
    let mut out = Vec::new();
    if rowset.GetNextRows(0, 0, &mut count, &mut fetched).is_ok() && count > 0 && !fetched[0].is_null() {
        for &row in std::slice::from_raw_parts(fetched[0], count) {
            let mut cell = Cell { status: 0, len: 0, text: [0; 1024] };
            if rowset.GetData(row, handle, &mut cell as *mut Cell as _).is_ok() && cell.status == DBSTATUS_S_OK.0 as u32 {
                out.push(String::from_utf16_lossy(&cell.text[..(cell.len / 2).min(1024)]));
            }
        }
        let _ = rowset.ReleaseRows(count, fetched[0], std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut());
        CoTaskMemFree(Some(fetched[0] as _));
    }
    let _ = accessor.ReleaseAccessor(handle, None);
    Ok(out)
}

fn icon_for(dir: &Path, path: &str, folder: bool) -> Option<String> {
    let ext = Path::new(path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let key = match (folder, ext.as_str()) {
        (true, _) => "folder".to_string(),
        (_, "exe" | "ico") => path.to_string(),
        _ => format!("ext:{ext}"),
    };
    let item: IShellItem = unsafe { SHCreateItemFromParsingName(&HSTRING::from(path), None) }.ok()?;
    cached_icon(dir, &key, &item)
}

#[tauri::command]
pub async fn search_files(app: AppHandle, query: String) -> Result<Vec<FileHit>, String> {
    let Some(sql) = search_sql(&query, CANDIDATES) else { return Ok(vec![]) };
    let dir = cache_dir(&app).join("icons");
    com(move || unsafe {
        Ok(best_matches(&query, query_index(&sql)?, MAX_RESULTS)
            .into_iter()
            .map(|path| {
                let folder = Path::new(&path).is_dir();
                let name = Path::new(&path).file_name().map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned());
                let icon = icon_for(&dir, &path, folder);
                FileHit { name, path, folder, icon }
            })
            .collect())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{best_matches, search_sql};

    #[test]
    fn builds_prefix_query_and_strips_quotes() {
        assert_eq!(search_sql("  ", 5), None);
        assert_eq!(search_sql("\"'*", 5), None);
        let sql = search_sql("rap'or  20\"24", 5).unwrap();
        assert!(sql.starts_with("SELECT TOP 5 System.ItemUrl FROM SystemIndex"));
        assert!(sql.contains("CONTAINS(System.FileName, '\"rapor*\" AND \"2024*\"')"));
        assert!(sql.contains("NOT CONTAINS(System.ItemFolderPathDisplay, '\"node_modules\" OR \"target\" OR \"AppData\"')"));
    }

    #[test]
    fn exact_names_first_then_prefixes_keeping_recency() {
        let urls = ["file:C:/a/my winpad notes.txt", "file:C:/a/winpad_lib.o", "file:C:/p/WinPad", "file:C:/b/winpad.json", "mapi:x"];
        let got = best_matches(" Winpad ", urls.map(String::from).to_vec(), 3);
        assert_eq!(got, ["C:\\p\\WinPad", "C:\\b\\winpad.json", "C:\\a\\winpad_lib.o"]);
    }
}
