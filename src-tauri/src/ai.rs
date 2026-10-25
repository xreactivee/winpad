use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HOUR: u64 = 3_600_000;
const BLOCK: u64 = 5 * HOUR;
const WEEK: u64 = 7 * 24 * HOUR;
const CODEX_TAIL: u64 = 512 * 1024;

#[derive(Clone, Debug, PartialEq)]
struct Entry {
    at: u64,
    id: String,
    tokens: u64,
    model: String,
}

struct Parsed {
    len: u64,
    entries: Vec<Entry>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Claude {
    session_tokens: u64,
    session_resets_at: Option<u64>,
    week_tokens: u64,
    top_model: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    percent: f64,
    minutes: Option<u64>,
    resets_at: Option<u64>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Codex {
    primary: Option<Window>,
    secondary: Option<Window>,
    at: u64,
}

#[derive(Serialize)]
pub struct AiUsage {
    claude: Option<Claude>,
    codex: Option<Codex>,
}

static CLAUDE: Mutex<Option<HashMap<PathBuf, Parsed>>> = Mutex::new(None);
static CODEX: Mutex<Option<(PathBuf, u64, Option<Codex>)>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn iso_ms(s: &str) -> Option<u64> {
    let num = |a: usize, b: usize| s.get(a..b)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (num(0, 4)?, num(5, 7)?, num(8, 10)?, num(11, 13)?, num(14, 16)?, num(17, 19)?);
    let mut rest = s.get(19..)?;
    let mut ms = 0i64;
    if let Some(frac) = rest.strip_prefix('.') {
        let digits = frac.bytes().take_while(u8::is_ascii_digit).count();
        ms = format!("{:0<3}", &frac[..digits.min(3)]).parse().ok()?;
        rest = &frac[digits..];
    }
    let offset = match rest.as_bytes().first() {
        Some(b'+' | b'-') => {
            let sign = if rest.starts_with('-') { -1 } else { 1 };
            sign * (rest.get(1..3)?.parse::<i64>().ok()? * 60 + rest.get(4..6)?.parse::<i64>().ok()?)
        }
        _ => 0,
    };
    let secs = days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se - offset * 60;
    u64::try_from(secs * 1000 + ms).ok()
}

fn parse_claude_line(line: &str) -> Option<Entry> {
    if !line.contains("\"usage\"") {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "assistant" {
        return None;
    }
    let message = v.get("message")?;
    let usage = message.get("usage")?;
    let n = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
    let text = |o: &Value, k: &str| o.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    Some(Entry {
        at: iso_ms(v.get("timestamp")?.as_str()?)?,
        id: format!("{}:{}", text(message, "id"), text(&v, "requestId")),
        tokens: n("input_tokens") + n("output_tokens") + n("cache_creation_input_tokens"),
        model: text(message, "model"),
    })
}

fn summarize(mut entries: Vec<Entry>, now: u64) -> Claude {
    entries.retain(|e| e.tokens > 0 && e.at <= now);
    entries.sort_by_key(|e| e.at);
    let mut block: Option<(u64, u64, u64)> = None;
    for e in &entries {
        match &mut block {
            Some((start, last, tokens)) if e.at < *start + BLOCK && e.at - *last < BLOCK => {
                *last = e.at;
                *tokens += e.tokens;
            }
            _ => block = Some((e.at / HOUR * HOUR, e.at, e.tokens)),
        }
    }
    let (session_tokens, session_resets_at) = match block {
        Some((start, last, tokens)) if now < start + BLOCK && now - last < BLOCK => (tokens, Some(start + BLOCK)),
        _ => (0, None),
    };
    let mut by_model: HashMap<&str, u64> = HashMap::new();
    let mut week_tokens = 0;
    for e in entries.iter().filter(|e| now - e.at < WEEK) {
        week_tokens += e.tokens;
        if !e.model.is_empty() && !e.model.starts_with('<') {
            *by_model.entry(&e.model).or_default() += e.tokens;
        }
    }
    let top_model = by_model.into_iter().max_by_key(|(_, t)| *t).map(|(m, _)| m.to_string());
    Claude { session_tokens, session_resets_at, week_tokens, top_model }
}

fn jsonl_files(dir: &Path, depth: u8, since: SystemTime, out: &mut Vec<(SystemTime, PathBuf)>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let (path, Ok(meta)) = (e.path(), e.metadata()) else { continue };
        if meta.is_dir() {
            if depth > 0 {
                jsonl_files(&path, depth - 1, since, out);
            }
        } else if path.extension().is_some_and(|x| x == "jsonl") {
            match meta.modified() {
                Ok(modified) if modified >= since => out.push((modified, path)),
                _ => {}
            }
        }
    }
}

fn read_from(path: &Path, from: u64) -> Option<(u64, String)> {
    let mut f = File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let start = from.min(len);
    f.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    f.take(len - start).read_to_end(&mut buf).ok()?;
    let end = buf.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    Some((start + end as u64, String::from_utf8_lossy(&buf[..end]).into_owned()))
}

fn claude_usage(now: u64) -> Option<Claude> {
    let root = home()?.join(".claude").join("projects");
    if !root.is_dir() {
        return None;
    }
    let since = SystemTime::now() - Duration::from_millis(WEEK + BLOCK);
    let mut found = Vec::new();
    jsonl_files(&root, 3, since, &mut found);
    let files: Vec<PathBuf> = found.into_iter().map(|(_, p)| p).collect();
    let mut guard = CLAUDE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = guard.get_or_insert_with(HashMap::new);
    cache.retain(|p, _| files.contains(p));
    for path in &files {
        let parsed = cache.entry(path.clone()).or_insert(Parsed { len: 0, entries: Vec::new() });
        let Ok(len) = std::fs::metadata(path).map(|m| m.len()) else { continue };
        if len < parsed.len {
            *parsed = Parsed { len: 0, entries: Vec::new() };
        }
        if len == parsed.len {
            continue;
        }
        if let Some((end, text)) = read_from(path, parsed.len) {
            parsed.len = end;
            parsed.entries.extend(text.lines().filter_map(parse_claude_line));
        }
    }
    let mut unique: HashMap<&str, &Entry> = HashMap::new();
    for e in cache.values().flat_map(|p| &p.entries) {
        unique.insert(&e.id, e);
    }
    Some(summarize(unique.into_values().cloned().collect(), now))
}

fn parse_window(limits: &Value, key: &str, at: u64) -> Option<Window> {
    let field = |name: &str| match limits.get(key).filter(|w| w.is_object()) {
        Some(w) => w.get(name).cloned(),
        None => limits.get(format!("{key}_{name}")).cloned(),
    };
    let percent = field("used_percent")?.as_f64()?;
    let minutes = field("window_minutes").and_then(|v| v.as_u64());
    let resets_at = field("resets_at")
        .and_then(|v| v.as_u64())
        .map(|s| s * 1000)
        .or_else(|| field("resets_in_seconds").and_then(|v| v.as_u64()).map(|s| at + s * 1000));
    Some(Window { percent, minutes, resets_at })
}

fn parse_codex_line(line: &str) -> Option<Codex> {
    if !line.contains("rate_limits") {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let at = v.get("timestamp").and_then(Value::as_str).and_then(iso_ms).unwrap_or(0);
    let limits = v.pointer("/payload/rate_limits").or_else(|| v.pointer("/payload/info/rate_limits"))?;
    if !limits.is_object() {
        return None;
    }
    let codex = Codex { primary: parse_window(limits, "primary", at), secondary: parse_window(limits, "secondary", at), at };
    (codex.primary.is_some() || codex.secondary.is_some()).then_some(codex)
}

fn codex_usage() -> Option<Codex> {
    let root = home()?.join(".codex").join("sessions");
    let mut found = Vec::new();
    jsonl_files(&root, 4, SystemTime::now() - Duration::from_millis(WEEK), &mut found);
    found.sort_by_key(|f| std::cmp::Reverse(f.0));
    let mut guard = CODEX.lock().unwrap_or_else(|e| e.into_inner());
    for (_, path) in found.into_iter().take(3) {
        let Ok(len) = std::fs::metadata(&path).map(|m| m.len()) else { continue };
        if let Some((p, l, result)) = guard.as_ref() {
            if *p == path && *l == len && result.is_some() {
                return result.clone();
            }
        }
        let result = read_from(&path, len.saturating_sub(CODEX_TAIL))
            .and_then(|(_, text)| text.lines().rev().find_map(parse_codex_line));
        if result.is_some() {
            *guard = Some((path, len, result.clone()));
            return result;
        }
    }
    None
}

#[tauri::command(async)]
pub fn ai_usage() -> AiUsage {
    AiUsage { claude: claude_usage(now_ms()), codex: codex_usage() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_timestamps() {
        assert_eq!(iso_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(iso_ms("2026-10-24T20:21:45.120Z"), Some(1_792_873_305_120));
        assert_eq!(iso_ms("2026-10-24T23:21:45.12+03:00"), Some(1_792_873_305_120));
        assert_eq!(iso_ms("nope"), None);
    }

    #[test]
    fn reads_claude_usage_lines() {
        let line = r#"{"type":"assistant","timestamp":"2026-10-24T20:21:45.120Z","requestId":"req_1","message":{"id":"msg_1","model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_creation_input_tokens":300,"cache_read_input_tokens":5000,"output_tokens":40}}}"#;
        let e = parse_claude_line(line).unwrap();
        assert_eq!((e.tokens, e.id.as_str(), e.model.as_str()), (342, "msg_1:req_1", "claude-opus-5-5"));
        assert_eq!(parse_claude_line(r#"{"type":"user","message":{"usage":{}}}"#), None);
    }

    fn entry(at: u64, tokens: u64, model: &str) -> Entry {
        Entry { at, id: at.to_string(), tokens, model: model.into() }
    }

    #[test]
    fn groups_five_hour_blocks() {
        let base = 1_000 * HOUR;
        let entries = vec![
            entry(base - 30 * HOUR, 999, "old"),
            entry(base + 10 * 60_000, 100, "a"),
            entry(base + 2 * HOUR, 50, "b"),
            entry(base + 4 * HOUR, 25, "a"),
        ];
        let got = summarize(entries.clone(), base + 4 * HOUR + 60_000);
        assert_eq!(got.session_tokens, 175);
        assert_eq!(got.session_resets_at, Some(base + BLOCK));
        assert_eq!(got.week_tokens, 1174);
        assert_eq!(got.top_model.as_deref(), Some("old"));
        let later = summarize(entries, base + 6 * HOUR);
        assert_eq!((later.session_tokens, later.session_resets_at), (0, None));
    }

    #[test]
    fn reads_codex_rate_limits_in_both_shapes() {
        let nested = r#"{"timestamp":"1970-01-01T00:00:10Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":92.5,"window_minutes":300,"resets_in_seconds":60},"secondary":{"used_percent":40.0,"window_minutes":10080,"resets_at":5000}}}}"#;
        let c = parse_codex_line(nested).unwrap();
        assert_eq!(c.primary, Some(Window { percent: 92.5, minutes: Some(300), resets_at: Some(70_000) }));
        assert_eq!(c.secondary.unwrap().resets_at, Some(5_000_000));
        let flat = r#"{"timestamp":"1970-01-01T00:00:00Z","payload":{"type":"token_count","info":{"rate_limits":{"primary_used_percent":10.0,"primary_window_minutes":300,"primary_resets_in_seconds":5}}}}"#;
        let c = parse_codex_line(flat).unwrap();
        assert_eq!(c.primary, Some(Window { percent: 10.0, minutes: Some(300), resets_at: Some(5000) }));
        assert_eq!(c.secondary, None);
        assert_eq!(parse_codex_line(r#"{"payload":{"rate_limits":null}}"#), None);
    }
}
