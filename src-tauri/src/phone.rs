use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Serialize, Debug, PartialEq)]
pub struct Phone {
    name: String,
    wallpaper: Option<String>,
    frame: Option<String>,
    status: Vec<Status>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Status {
    icon: Option<String>,
    alt: Option<String>,
    text: Option<String>,
}

fn card_path() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(PathBuf::from(local).join(r"Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json"))
}

#[tauri::command(async)]
pub fn phone_info() -> Option<Phone> {
    let text = std::fs::read_to_string(card_path()?).ok()?;
    parse(&serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?)
}

fn walk<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            if map.contains_key("type") {
                out.push(v);
            }
            map.values().for_each(|c| walk(c, out));
        }
        Value::Array(items) => items.iter().for_each(|c| walk(c, out)),
        _ => {}
    }
}

fn str_of(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

fn parse(card: &Value) -> Option<Phone> {
    let body = card.get("body")?.as_array()?;
    let at = body.iter().position(|e| e["type"] == "TextBlock")?;
    let name = str_of(&body[at], "text")?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let mut before = Vec::new();
    body[..at].iter().for_each(|e| walk(e, &mut before));
    let mut pictures = before
        .iter()
        .find(|e| e["type"] == "ImageSet")
        .and_then(|s| s["images"].as_array())
        .into_iter()
        .flatten()
        .filter_map(|i| str_of(i, "url"));
    let (wallpaper, frame) = (pictures.next(), pictures.next());
    let mut status = Vec::new();
    if let Some(row) = body[at + 1..].iter().find(|e| e["type"] == "ColumnSet") {
        let mut items = Vec::new();
        walk(row, &mut items);
        for it in items {
            match it["type"].as_str() {
                Some("Image") => status.push(Status { icon: str_of(it, "url"), alt: str_of(it, "altText"), text: None }),
                Some("TextBlock") => status.push(Status { icon: None, alt: None, text: str_of(it, "text") }),
                _ => {}
            }
        }
    }
    Some(Phone { name, wallpaper, frame, status })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_name_picture_and_status_but_nothing_after() {
        let card = json!({ "body": [
            { "type": "ColumnSet", "columns": [{ "type": "Column", "items": [{ "type": "ImageSet", "images": [
                { "type": "Image", "url": "data:wall" }, { "type": "Image", "url": "data:frame" } ] }] }] },
            { "type": "TextBlock", "text": " Yusuf's Phone " },
            { "type": "ColumnSet", "columns": [
                { "type": "Column", "items": [{ "type": "Image", "url": "data:ok", "altText": "Connected" }] },
                { "type": "Column", "items": [{ "type": "Container", "items": [{ "type": "TextBlock", "text": "48%" }] }] } ] },
            { "type": "Container", "items": [{ "type": "TextBlock", "text": "Recent caller" }] }
        ]});
        let p = parse(&card).unwrap();
        assert_eq!(p.name, "Yusuf's Phone");
        assert_eq!((p.wallpaper.as_deref(), p.frame.as_deref()), (Some("data:wall"), Some("data:frame")));
        assert_eq!(
            p.status,
            vec![
                Status { icon: Some("data:ok".into()), alt: Some("Connected".into()), text: None },
                Status { icon: None, alt: None, text: Some("48%".into()) },
            ]
        );
    }

    #[test]
    fn no_name_no_phone() {
        assert_eq!(parse(&json!({ "body": [{ "type": "Container" }] })), None);
        assert_eq!(parse(&json!({})), None);
    }
}
