use base64::{engine::general_purpose, Engine as _};
use rand::{rng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use url::Url;

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_PORT: u16 = 1455;

static PENDING_LOGIN: OnceLock<Mutex<Option<PendingLogin>>> = OnceLock::new();

fn pending_login() -> &'static Mutex<Option<PendingLogin>> {
    PENDING_LOGIN.get_or_init(|| Mutex::new(None))
}

#[derive(Clone)]
struct PendingLogin {
    code_verifier: String,
    state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOauthResult {
    pub auth_url: String,
    pub manual_callback_required: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOauthResult {
    pub email: String,
    pub auth_json: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: Option<u64>,
}

#[tauri::command]
pub fn start_openai_oauth(
    app: AppHandle,
    open_browser: Option<bool>,
) -> Result<StartOauthResult, String> {
    let pkce = generate_pkce();
    let state = generate_state();
    let redirect_uri = redirect_uri();
    let auth_url = build_auth_url(&pkce.code_challenge, &state, &redirect_uri);

    {
        let mut pending = pending_login()
            .lock()
            .map_err(|_| "OAuth state lock failed".to_string())?;
        *pending = Some(PendingLogin {
            code_verifier: pkce.code_verifier,
            state: state.clone(),
        });
    }

    let should_open_browser = open_browser.unwrap_or(true);
    let mut manual_callback_required = !should_open_browser;
    let mut message = manual_callback_required.then(|| {
        "Open the generated URL, finish login, then paste the final callback URL below.".to_string()
    });

    if should_open_browser {
        match bind_redirect_listeners() {
            Ok(listeners) => {
                std::thread::spawn(move || listen_for_callback(listeners, app, state));
            }
            Err(error) => {
                manual_callback_required = true;
                message = Some(format!(
                    "Cannot bind local port {REDIRECT_PORT}: {error}. Finish login in the browser, then paste the final callback URL here."
                ));
            }
        }

        open_external_url(&auth_url)?;
    }

    Ok(StartOauthResult {
        auth_url,
        manual_callback_required,
        message,
    })
}

#[tauri::command]
pub fn complete_openai_oauth(code: String) -> Result<CompleteOauthResult, String> {
    complete_openai_oauth_code(code)
}

#[tauri::command]
pub fn complete_openai_oauth_callback(input: String) -> Result<CompleteOauthResult, String> {
    let (code, state) = parse_callback_input(&input)
        .ok_or_else(|| "Could not find code/state in callback URL".to_string())?;
    validate_state(&state)?;
    complete_openai_oauth_code(code)
}

fn complete_openai_oauth_code(code: String) -> Result<CompleteOauthResult, String> {
    let code_verifier = {
        let mut pending = pending_login()
            .lock()
            .map_err(|_| "OAuth state lock failed".to_string())?;
        let pending = pending
            .take()
            .ok_or_else(|| "OAuth login expired. Start the login again.".to_string())?;
        pending.code_verifier
    };

    let token = exchange_code(&code, &redirect_uri(), &code_verifier)?;
    let id_token = token
        .id_token
        .clone()
        .ok_or_else(|| "OAuth response did not include id_token".to_string())?;
    let email = parse_email_from_id_token(&id_token).unwrap_or_else(|| "OpenAI OAuth".to_string());
    let expires_at = token.expires_in.map(rfc3339_expires_at);
    let refresh_token = token
        .refresh_token
        .clone()
        .ok_or_else(|| "OAuth response did not include refresh_token".to_string())?;

    let auth_json = serde_json::json!({
        "tokens": {
            "access_token": token.access_token,
            "refresh_token": refresh_token,
            "id_token": token.id_token,
            "expires_at": expires_at
        },
        "last_refresh": chrono::Utc::now().to_rfc3339()
    });
    let auth_body = serde_json::to_string_pretty(&auth_json)
        .map_err(|error| format!("Failed to render auth.json: {error}"))?;

    Ok(CompleteOauthResult {
        email,
        auth_json: auth_body,
    })
}

fn listen_for_callback(listeners: Vec<TcpListener>, app: AppHandle, expected_state: String) {
    for listener in &listeners {
        let _ = listener.set_nonblocking(true);
        let _ = listener.set_ttl(64);
    }
    let deadline = Instant::now() + Duration::from_secs(180);

    while Instant::now() < deadline {
        for listener in &listeners {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0u8; 4096];
                    if let Ok(n) = stream.read(&mut buffer) {
                        let request = String::from_utf8_lossy(&buffer[..n]);
                        if let Some((code, state)) = extract_code_from_request(&request) {
                            if state == expected_state {
                                write_callback_response(
                                    &mut stream,
                                    200,
                                    "<html><body><h1>Authorization complete</h1><p>You can close this window and return to Codex Switch.</p></body></html>",
                                    "text/html; charset=utf-8",
                                );
                                let _ = app.emit("openai-oauth-code", code);
                                return;
                            }
                        }
                    }
                    write_callback_response(
                        &mut stream,
                        400,
                        "Authorization failed. Please paste the callback URL into Codex Switch.",
                        "text/plain; charset=utf-8",
                    );
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => return,
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn write_callback_response(stream: &mut impl Write, status: u16, body: &str, content_type: &str) {
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

struct PkceCodes {
    code_verifier: String,
    code_challenge: String,
}

fn generate_pkce() -> PkceCodes {
    let mut bytes = [0u8; 64];
    rng().fill_bytes(&mut bytes);
    let code_verifier = general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let code_challenge = general_purpose::URL_SAFE_NO_PAD.encode(hasher.finalize());
    PkceCodes {
        code_verifier,
        code_challenge,
    }
}

fn generate_state() -> String {
    let mut bytes = [0u8; 32];
    rng().fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn redirect_uri() -> String {
    format!("http://localhost:{REDIRECT_PORT}/auth/callback")
}

fn bind_redirect_listeners() -> Result<Vec<TcpListener>, std::io::Error> {
    let mut listeners = Vec::new();
    let mut first_error = None;

    for bind_result in [
        TcpListener::bind((Ipv4Addr::LOCALHOST, REDIRECT_PORT)),
        TcpListener::bind((Ipv6Addr::LOCALHOST, REDIRECT_PORT)),
    ] {
        match bind_result {
            Ok(listener) => listeners.push(listener),
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }

    if listeners.is_empty() {
        Err(first_error.unwrap_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::AddrNotAvailable, "loopback unavailable")
        }))
    } else {
        Ok(listeners)
    }
}

fn build_auth_url(code_challenge: &str, state: &str, redirect_uri: &str) -> String {
    format!(
        "{AUTH_URL}?response_type=code&client_id={CLIENT_ID}&redirect_uri={redirect_uri}&scope=openid profile email offline_access&code_challenge={code_challenge}&code_challenge_method=S256&id_token_add_organizations=true&codex_cli_simplified_flow=true&state={state}&originator=codex_vscode"
    )
}

fn extract_code_from_request(request: &str) -> Option<(String, String)> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    parse_callback_input(&format!("http://localhost{path}"))
}

fn parse_callback_input(input: &str) -> Option<(String, String)> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(url) = Url::parse(trimmed) {
        return code_state_from_url(&url);
    }

    let stripped = trimmed.trim_start_matches('?');
    if stripped.contains('=') {
        let fake = format!("http://localhost/?{stripped}");
        if let Ok(url) = Url::parse(&fake) {
            return code_state_from_url(&url);
        }
    }
    None
}

fn code_state_from_url(url: &Url) -> Option<(String, String)> {
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    Some((params.get("code")?.clone(), params.get("state")?.clone()))
}

fn validate_state(provided_state: &str) -> Result<(), String> {
    let pending = pending_login()
        .lock()
        .map_err(|_| "OAuth state lock failed".to_string())?;
    let expected = pending
        .as_ref()
        .ok_or_else(|| "OAuth login expired. Start the login again.".to_string())?;
    if expected.state != provided_state {
        return Err("Callback state does not match this login attempt.".to_string());
    }
    Ok(())
}

fn exchange_code(
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let body = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        urlencoding::encode(code),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(CLIENT_ID),
        urlencoding::encode(code_verifier)
    );

    request_token(body, "exchange")
}

pub fn refresh_access_token(refresh_token: &str) -> Result<TokenResponse, String> {
    let body = format!(
        "grant_type=refresh_token&refresh_token={}&client_id={}",
        urlencoding::encode(refresh_token),
        urlencoding::encode(CLIENT_ID),
    );

    request_token(body, "refresh")
}

fn request_token(body: String, operation: &str) -> Result<TokenResponse, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|error| format!("Could not create OAuth client: {error}"))?;
    let response = client
        .post(TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .map_err(|error| format!("Token {operation} request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Failed to read token {operation} response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "OpenAI token {operation} failed ({status}): {text}"
        ));
    }

    serde_json::from_str::<TokenResponse>(&text)
        .map_err(|error| format!("Failed to parse token {operation} response: {error}"))
}

fn parse_email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = general_purpose::URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("email")?.as_str().map(ToString::to_string)
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn rfc3339_expires_at(secs: u64) -> String {
    (chrono::Utc::now() + chrono::Duration::seconds(secs as i64)).to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_parser_accepts_full_url_and_query_string() {
        assert_eq!(
            parse_callback_input("http://localhost:1455/auth/callback?code=abc&state=xyz"),
            Some(("abc".to_string(), "xyz".to_string()))
        );
        assert_eq!(
            parse_callback_input("?code=abc&state=xyz"),
            Some(("abc".to_string(), "xyz".to_string()))
        );
        assert_eq!(
            parse_callback_input("code=abc&state=xyz"),
            Some(("abc".to_string(), "xyz".to_string()))
        );
    }

    #[test]
    fn redirect_uri_uses_registered_localhost_callback() {
        assert_eq!(
            redirect_uri(),
            "http://localhost:1455/auth/callback".to_string()
        );
    }

    #[test]
    fn auth_url_contains_pkce_and_codex_parameters() {
        let url = build_auth_url("challenge", "state", &redirect_uri());
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=app_EMoamEEZ73f0CkXaXp7hrann"));
        assert!(url.contains("redirect_uri=http://localhost:1455/auth/callback"));
        assert!(url.contains("code_challenge=challenge"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=state"));
        assert!(url.contains("codex_cli_simplified_flow=true"));
    }
}
