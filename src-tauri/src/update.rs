use std::thread::sleep;
use std::time::Duration;
use tauri::async_runtime::block_on;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const BUSY_RETRY: Duration = Duration::from_secs(30);

fn update_once(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = block_on(app.updater()?.check())? else { return Ok(()) };
    let bytes = block_on(update.download(|_, _| {}, || {}))?;
    while crate::launchpad_visible(app) {
        sleep(BUSY_RETRY);
    }
    update.install(bytes)
}

pub fn watch(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        sleep(FIRST_CHECK);
        loop {
            let _ = update_once(&app);
            sleep(CHECK_EVERY);
        }
    });
}
