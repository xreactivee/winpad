use crate::shell::{cache_dir, com, data_dir, hash_hex, read_stream};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use windows::core::Interface;
use windows::Foundation::Size;
use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};

const EPOCH_OFFSET: i64 = 116_444_736_000_000_000;
const LOGO: f32 = 48.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notif {
    id: u32,
    app: String,
    app_id: Option<String>,
    title: String,
    body: String,
    icon: Option<String>,
    at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Feed {
    allowed: bool,
    items: Vec<Notif>,
}

static FILE: OnceLock<PathBuf> = OnceLock::new();
static DISMISSED: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

fn file(app: &AppHandle) -> &'static PathBuf {
    FILE.get_or_init(|| data_dir(app).join("dismissed.json"))
}

fn dismissed() -> HashSet<u32> {
    let mut guard = DISMISSED.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .get_or_insert_with(|| {
            FILE.get()
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default()
        })
        .clone()
}

fn remember(ids: HashSet<u32>) {
    if let (Some(path), Ok(bytes)) = (FILE.get(), serde_json::to_vec(&ids)) {
        let _ = std::fs::write(path, bytes);
    }
    *DISMISSED.lock().unwrap_or_else(|e| e.into_inner()) = Some(ids);
}

fn listener() -> windows::core::Result<UserNotificationListener> {
    UserNotificationListener::Current()
}

fn allowed() -> bool {
    listener()
        .and_then(|l| l.RequestAccessAsync()?.join())
        .is_ok_and(|status| status == UserNotificationListenerAccessStatus::Allowed)
}

fn logo(dir: &Path, notification: &UserNotification) -> Option<String> {
    let info = notification.AppInfo().ok()?.DisplayInfo().ok()?;
    let stream = info.GetLogo(Size { Width: LOGO, Height: LOGO }).ok()?;
    let bytes = read_stream(&stream.cast().ok()?).ok()?;
    let key = hash_hex((bytes.len(), &bytes[..bytes.len().min(2048)]));
    let out = dir.join(format!("notif-{key}.png"));
    if !out.exists() {
        std::fs::write(&out, &bytes).ok()?;
    }
    Some(out.to_string_lossy().into_owned())
}

fn read_one(dir: &Path, notification: UserNotification) -> Option<Notif> {
    let id = notification.Id().ok()?;
    let info = notification.AppInfo().ok();
    let app = info
        .as_ref()
        .and_then(|a| a.DisplayInfo().and_then(|d| d.DisplayName()).ok())
        .map(|n| n.to_string())
        .unwrap_or_default();
    let app_id = info
        .as_ref()
        .and_then(|a| a.AppUserModelId().ok())
        .map(|n| n.to_string())
        .filter(|n| !n.is_empty());
    let binding = notification
        .Notification()
        .ok()?
        .Visual()
        .ok()?
        .GetBinding(&KnownNotificationBindings::ToastGeneric().ok()?)
        .ok()?;
    let texts: Vec<String> = binding
        .GetTextElements()
        .ok()?
        .into_iter()
        .filter_map(|t| t.Text().ok().map(|s| s.to_string()))
        .filter(|s| !s.trim().is_empty())
        .collect();
    if texts.is_empty() {
        return None;
    }
    let at = notification.CreationTime().map(|t| (t.UniversalTime - EPOCH_OFFSET) / 10_000).unwrap_or(0);
    Some(Notif { id, app, app_id, title: texts[0].clone(), body: texts[1..].join("\n"), icon: logo(dir, &notification), at })
}

fn live() -> windows::core::Result<Vec<UserNotification>> {
    Ok(listener()?.GetNotificationsAsync(NotificationKinds::Toast)?.join()?.into_iter().collect())
}

#[tauri::command]
pub async fn notifications(app: AppHandle) -> Result<Feed, String> {
    let dir = cache_dir(&app).join("icons");
    let _ = std::fs::create_dir_all(&dir);
    file(&app);
    com(move || {
        if !allowed() {
            return Ok(Feed { allowed: false, items: vec![] });
        }
        let list = live()?;
        let present: HashSet<u32> = list.iter().filter_map(|n| n.Id().ok()).collect();
        let hidden = dismissed();
        let still: HashSet<u32> = hidden.intersection(&present).copied().collect();
        if still.len() != hidden.len() {
            remember(still.clone());
        }
        let mut items: Vec<Notif> =
            list.into_iter().filter_map(|n| read_one(&dir, n)).filter(|n| !still.contains(&n.id)).collect();
        items.sort_by_key(|n| std::cmp::Reverse(n.at));
        Ok(Feed { allowed: true, items })
    })
    .await
}

#[tauri::command]
pub async fn dismiss_notification(app: AppHandle, id: Option<u32>) -> Result<(), String> {
    file(&app);
    com(move || {
        let mut hidden = dismissed();
        let listener = listener();
        let drop_one = |id: u32, hidden: &mut HashSet<u32>| {
            hidden.insert(id);
            if let Ok(l) = &listener {
                let _ = l.RemoveNotification(id);
            }
        };
        match id {
            Some(id) => drop_one(id, &mut hidden),
            None => {
                for id in live().unwrap_or_default().iter().filter_map(|n| n.Id().ok()) {
                    drop_one(id, &mut hidden);
                }
            }
        }
        remember(hidden);
        Ok(())
    })
    .await
}
