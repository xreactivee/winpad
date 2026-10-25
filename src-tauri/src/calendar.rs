use crate::shell::com;
use windows::core::HSTRING;
use windows::Foundation::Uri;
use windows::Web::Http::HttpClient;

const MAX_BYTES: usize = 5 * 1024 * 1024;

fn normalize(url: &str) -> Option<String> {
    let url = url.trim();
    let rest = url.strip_prefix("webcal://").or_else(|| url.strip_prefix("https://"))?;
    (!rest.is_empty()).then(|| format!("https://{rest}"))
}

#[tauri::command]
pub async fn fetch_calendar(url: String) -> Result<String, String> {
    let url = normalize(&url).ok_or("Use an https:// or webcal:// calendar link")?;
    let text = com(move || {
        let client = HttpClient::new()?;
        let text = client.GetStringAsync(&Uri::CreateUri(&HSTRING::from(url))?)?.join()?;
        Ok(text.to_string())
    })
    .await?;
    if text.len() > MAX_BYTES {
        return Err("The calendar is too large".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn accepts_only_secure_calendar_links() {
        assert_eq!(normalize(" webcal://p01-caldav.icloud.com/x "), Some("https://p01-caldav.icloud.com/x".into()));
        assert_eq!(normalize("https://calendar.google.com/a.ics"), Some("https://calendar.google.com/a.ics".into()));
        assert_eq!(normalize("http://example.com/a.ics"), None);
        assert_eq!(normalize("file:///C:/a.ics"), None);
        assert_eq!(normalize("https://"), None);
    }
}
