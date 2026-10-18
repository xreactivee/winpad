use crate::shell::{cache_dir, cache_latest, com, hash_hex};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;
use tauri::AppHandle;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as MediaManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

#[derive(Serialize)]
pub struct Battery {
    percent: u8,
    charging: bool,
}

#[tauri::command(async)]
pub fn battery() -> Option<Battery> {
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()? };
    if s.BatteryFlag & 128 != 0 || s.BatteryLifePercent > 100 {
        return None;
    }
    Some(Battery { percent: s.BatteryLifePercent, charging: s.ACLineStatus == 1 })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    cpu: f32,
    mem_used: u64,
    mem_total: u64,
    disk_used: u64,
    disk_total: u64,
    net_rx: u64,
    net_tx: u64,
}

struct Probe {
    sys: sysinfo::System,
    nets: sysinfo::Networks,
    disks: sysinfo::Disks,
    disks_at: Instant,
}

static PROBE: Mutex<Option<Probe>> = Mutex::new(None);

#[tauri::command(async)]
pub fn sys_stats() -> Stats {
    let mut guard = PROBE.lock().unwrap_or_else(|e| e.into_inner());
    let p = guard.get_or_insert_with(|| Probe {
        sys: sysinfo::System::new(),
        nets: sysinfo::Networks::new_with_refreshed_list(),
        disks: sysinfo::Disks::new_with_refreshed_list(),
        disks_at: Instant::now(),
    });
    p.sys.refresh_cpu_usage();
    p.sys.refresh_memory();
    p.nets.refresh(true);
    if p.disks_at.elapsed().as_secs() >= 60 {
        p.disks.refresh(true);
        p.disks_at = Instant::now();
    }
    let (net_rx, net_tx) = p.nets.iter().fold((0, 0), |(r, t), (_, n)| (r + n.received(), t + n.transmitted()));
    let (disk_used, disk_total) = p
        .disks
        .iter()
        .fold((0, 0), |(u, t), d| (u + d.total_space() - d.available_space(), t + d.total_space()));
    Stats {
        cpu: p.sys.global_cpu_usage(),
        mem_used: p.sys.used_memory(),
        mem_total: p.sys.total_memory(),
        disk_used,
        disk_total,
        net_rx,
        net_tx,
    }
}

#[derive(Serialize)]
pub struct Media {
    title: String,
    artist: String,
    playing: bool,
    thumb: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    Previous,
    Next,
    Toggle,
}

fn read_stream(r: &IRandomAccessStreamReference) -> windows::core::Result<Vec<u8>> {
    let s = r.OpenReadAsync()?.join()?;
    let size = s.Size()? as u32;
    let reader = DataReader::CreateDataReader(&s.GetInputStreamAt(0)?)?;
    reader.LoadAsync(size)?.join()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf)?;
    Ok(buf)
}

#[tauri::command]
pub async fn media_info(app: AppHandle) -> Result<Option<Media>, String> {
    let dir = cache_dir(&app);
    com(move || {
        let mgr = MediaManager::RequestAsync()?.join()?;
        let Ok(session) = mgr.GetCurrentSession() else { return Ok(None) };
        let props = session.TryGetMediaPropertiesAsync()?.join()?;
        let title = props.Title()?.to_string();
        let artist = props.Artist()?.to_string();
        let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == PlaybackStatus::Playing;
        let thumb = props.Thumbnail().ok().and_then(|r| read_stream(&r).ok()).and_then(|bytes| {
            let key = hash_hex((bytes.len(), &bytes[..bytes.len().min(4096)]));
            cache_latest(&dir, "media", &format!("{key}.img"), |path| std::fs::write(path, &bytes).ok())
                .map(|p| p.to_string_lossy().into_owned())
        });
        Ok(Some(Media { title, artist, playing, thumb }))
    })
    .await
}

#[tauri::command]
pub async fn media_control(action: MediaAction) -> Result<(), String> {
    com(move || {
        let session = MediaManager::RequestAsync()?.join()?.GetCurrentSession()?;
        let op = match action {
            MediaAction::Next => session.TrySkipNextAsync()?,
            MediaAction::Previous => session.TrySkipPreviousAsync()?,
            MediaAction::Toggle => session.TryTogglePlayPauseAsync()?,
        };
        op.join()?;
        Ok(())
    })
    .await
}
