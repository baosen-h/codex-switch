use crate::app_config::PROXY_USER_AGENT;
use crate::models::{WebSearchCapability, WebSearchResponse, WebSearchResult, WebSearchSettings};
use reqwest::blocking::{Client, ClientBuilder};
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE, LOCATION};
use reqwest::{redirect::Policy, Proxy};
use serde::{Deserialize, Serialize};
use std::env;
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;
use url::Url;

const TAVILY_PROVIDER_ID: &str = "tavily";
const TAVILY_DEFAULT_URL: &str = "https://api.tavily.com/search";
const ZHIPU_PROVIDER_ID: &str = "zhipu";
const ZHIPU_DEFAULT_URL: &str = "https://open.bigmodel.cn/api/paas/v4/web_search";
const EXA_PROVIDER_ID: &str = "exa";
const EXA_DEFAULT_URL: &str = "https://api.exa.ai/search";
const BOCHA_PROVIDER_ID: &str = "bocha";
const BOCHA_DEFAULT_URL: &str = "https://api.bochaai.com/v1/web-search";
const SEARXNG_PROVIDER_ID: &str = "searxng";
const SEARXNG_DEFAULT_URL: &str = "http://localhost:8080/search";
const JINA_PROVIDER_ID: &str = "jina";
const JINA_SEARCH_DEFAULT_URL: &str = "https://s.jina.ai";
const JINA_FETCH_DEFAULT_URL: &str = "https://r.jina.ai";
const SEARCH_TIMEOUT_SECONDS: u64 = 30;
const FETCH_PROVIDER_ID: &str = "direct";
const FETCH_TIMEOUT_SECONDS: u64 = 30;
const FETCH_MAX_REDIRECTS: usize = 5;
const FETCH_MAX_BYTES: u64 = 10 * 1024 * 1024;
static NEXT_API_KEY: AtomicUsize = AtomicUsize::new(0);

pub fn search_keywords(
    settings: &WebSearchSettings,
    keywords: &[String],
) -> Result<WebSearchResponse, String> {
    let settings = settings.clone().normalized();
    let inputs = normalize_inputs(keywords);
    if inputs.is_empty() {
        return Err("Web search requires at least one non-empty query".to_string());
    }
    if settings.search_provider_id.is_empty() {
        return Err("Default web search provider is not configured".to_string());
    }

    let mut handles = Vec::with_capacity(inputs.len());
    for input in &inputs {
        let settings = settings.clone();
        let input = input.clone();
        handles.push(thread::spawn(move || search_one(&settings, &input)));
    }

    let mut results = Vec::new();
    let mut errors = Vec::new();
    for handle in handles {
        match handle.join() {
            Ok(Ok(mut query_results)) => results.append(&mut query_results),
            Ok(Err(error)) => errors.push(error),
            Err(_) => errors.push("Web search worker stopped unexpectedly".to_string()),
        }
    }

    if results.is_empty() && !errors.is_empty() {
        return Err(errors.remove(0));
    }

    results.retain(|result| !is_excluded_url(&result.url, &settings.exclude_domains));
    Ok(WebSearchResponse {
        provider_id: settings.search_provider_id,
        capability: WebSearchCapability::SearchKeywords,
        inputs,
        results,
    })
}

pub fn fetch_urls(
    settings: &WebSearchSettings,
    urls: &[String],
) -> Result<WebSearchResponse, String> {
    let settings = settings.clone().normalized();
    let inputs = normalize_inputs(urls);
    if inputs.is_empty() {
        return Err("Web fetch requires at least one non-empty URL".to_string());
    }
    let mut handles = Vec::with_capacity(inputs.len());
    for input in &inputs {
        let settings = settings.clone();
        let input = input.clone();
        handles.push(thread::spawn(move || {
            match settings.fetch_provider_id.as_str() {
                FETCH_PROVIDER_ID => fetch_direct(&input),
                JINA_PROVIDER_ID => fetch_jina(&settings, &input),
                provider_id => Err(format!("Unsupported web fetch provider: {provider_id}")),
            }
        }));
    }

    let mut results = Vec::new();
    let mut errors = Vec::new();
    for handle in handles {
        match handle.join() {
            Ok(Ok(result)) => results.push(result),
            Ok(Err(error)) => errors.push(error),
            Err(_) => errors.push("Web fetch worker stopped unexpectedly".to_string()),
        }
    }

    if results.is_empty() && !errors.is_empty() {
        return Err(errors.remove(0));
    }

    results.retain(|result| !is_excluded_url(&result.url, &settings.exclude_domains));
    Ok(WebSearchResponse {
        provider_id: settings.fetch_provider_id,
        capability: WebSearchCapability::FetchUrls,
        inputs,
        results,
    })
}

fn search_one(settings: &WebSearchSettings, query: &str) -> Result<Vec<WebSearchResult>, String> {
    match settings.search_provider_id.as_str() {
        TAVILY_PROVIDER_ID => search_tavily(settings, query),
        ZHIPU_PROVIDER_ID => search_zhipu(settings, query),
        EXA_PROVIDER_ID => search_exa(settings, query),
        BOCHA_PROVIDER_ID => search_bocha(settings, query),
        SEARXNG_PROVIDER_ID => search_searxng(settings, query),
        JINA_PROVIDER_ID => search_jina(settings, query),
        provider_id => Err(format!("Unsupported web search provider: {provider_id}")),
    }
}

fn search_tavily(
    settings: &WebSearchSettings,
    query: &str,
) -> Result<Vec<WebSearchResult>, String> {
    let api_key = next_api_key(&settings.search_api_keys, TAVILY_PROVIDER_ID)?;
    let endpoint = tavily_endpoint(&settings.search_api_url)?;
    let request = TavilySearchRequest {
        query,
        max_results: settings.max_results,
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(SEARCH_TIMEOUT_SECONDS))
        .user_agent(PROXY_USER_AGENT)
        .build()
        .map_err(|error| format!("Failed to create web search client: {error}"))?;
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .map_err(|error| format!("Tavily search request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Failed to read Tavily response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Tavily search failed with HTTP {status}: {}",
            truncate_error(&body)
        ));
    }

    parse_tavily_response(query, &body, settings.max_results)
}

fn search_zhipu(settings: &WebSearchSettings, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let api_key = next_api_key(&settings.search_api_keys, ZHIPU_PROVIDER_ID)?;
    let endpoint = configured_endpoint(&settings.search_api_url, ZHIPU_DEFAULT_URL, None)?;
    let body = post_search_json(
        &endpoint,
        &[("Authorization", format!("Bearer {api_key}"))],
        &serde_json::json!({
            "search_query": query,
            "search_engine": "search_std",
            "search_intent": false
        }),
        "Zhipu",
    )?;
    parse_zhipu_response(query, &body, settings.max_results)
}

fn search_exa(settings: &WebSearchSettings, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let api_key = next_api_key(&settings.search_api_keys, EXA_PROVIDER_ID)?;
    let endpoint = configured_endpoint(&settings.search_api_url, EXA_DEFAULT_URL, Some("search"))?;
    let body = post_search_json(
        &endpoint,
        &[("x-api-key", api_key.to_string())],
        &serde_json::json!({
            "query": query,
            "numResults": settings.max_results,
            "contents": {"text": true}
        }),
        "Exa",
    )?;
    parse_exa_response(query, &body, settings.max_results)
}

fn search_bocha(settings: &WebSearchSettings, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let api_key = next_api_key(&settings.search_api_keys, BOCHA_PROVIDER_ID)?;
    let endpoint = configured_endpoint(
        &settings.search_api_url,
        BOCHA_DEFAULT_URL,
        Some("v1/web-search"),
    )?;
    let body = post_search_json(
        &endpoint,
        &[("Authorization", format!("Bearer {api_key}"))],
        &serde_json::json!({
            "query": query,
            "count": settings.max_results,
            "exclude": settings.exclude_domains.join(","),
            "summary": true
        }),
        "Bocha",
    )?;
    parse_bocha_response(query, &body, settings.max_results)
}

fn search_searxng(
    settings: &WebSearchSettings,
    query: &str,
) -> Result<Vec<WebSearchResult>, String> {
    let endpoint = configured_endpoint(
        &settings.search_api_url,
        SEARXNG_DEFAULT_URL,
        Some("search"),
    )?;
    let mut url =
        Url::parse(&endpoint).map_err(|error| format!("Invalid SearXNG API URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("q", query)
        .append_pair("language", "auto")
        .append_pair("format", "json");
    let client = search_client()?;
    let response = client
        .get(url)
        .send()
        .map_err(|error| format!("SearXNG search request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Failed to read SearXNG response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "SearXNG search failed with HTTP {status}: {}",
            truncate_error(&body)
        ));
    }
    parse_searxng_response(query, &body, settings.max_results)
}

fn search_jina(settings: &WebSearchSettings, query: &str) -> Result<Vec<WebSearchResult>, String> {
    let api_key = next_api_key(&settings.search_api_keys, JINA_PROVIDER_ID)?;
    let base = configured_endpoint(&settings.search_api_url, JINA_SEARCH_DEFAULT_URL, None)?;
    let endpoint = format!(
        "{}/{}",
        base.trim_end_matches('/'),
        urlencoding::encode(query)
    );
    let client = search_client()?;
    let response = client
        .get(endpoint)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("Jina search request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Failed to read Jina response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Jina search failed with HTTP {status}: {}",
            truncate_error(&body)
        ));
    }
    parse_jina_search_response(query, &body, settings.max_results)
}

fn fetch_jina(settings: &WebSearchSettings, source_url: &str) -> Result<WebSearchResult, String> {
    validate_public_url(
        &Url::parse(source_url)
            .map_err(|error| format!("Invalid web fetch URL {source_url}: {error}"))?,
        false,
    )?;
    let api_key = next_api_key(&settings.fetch_api_keys, JINA_PROVIDER_ID)?;
    let base = configured_endpoint(&settings.fetch_api_url, JINA_FETCH_DEFAULT_URL, None)?;
    let endpoint = format!("{}/{}", base.trim_end_matches('/'), source_url);
    let client = search_client()?;
    let response = client
        .get(endpoint)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .header("X-Retain-Images", "none")
        .send()
        .map_err(|error| format!("Jina fetch request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Failed to read Jina fetch response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Jina fetch failed with HTTP {status}: {}",
            truncate_error(&body)
        ));
    }
    parse_jina_fetch_response(source_url, &body)
}

fn search_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(SEARCH_TIMEOUT_SECONDS))
        .user_agent(PROXY_USER_AGENT)
        .build()
        .map_err(|error| format!("Failed to create web search client: {error}"))
}

fn post_search_json(
    endpoint: &str,
    headers: &[(&str, String)],
    request: &serde_json::Value,
    provider_name: &str,
) -> Result<String, String> {
    let client = search_client()?;
    let mut builder = client.post(endpoint).json(request);
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    let response = builder
        .send()
        .map_err(|error| format!("{provider_name} search request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Failed to read {provider_name} response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "{provider_name} search failed with HTTP {status}: {}",
            truncate_error(&body)
        ));
    }
    Ok(body)
}

fn configured_endpoint(
    configured_url: &str,
    default_url: &str,
    path: Option<&str>,
) -> Result<String, String> {
    let configured_url = configured_url.trim();
    if configured_url.is_empty() {
        return Ok(default_url.to_string());
    }
    let parsed =
        Url::parse(configured_url).map_err(|error| format!("Invalid search API URL: {error}"))?;
    if let Some(path) = path {
        if parsed.path().trim_matches('/').is_empty() {
            return parsed
                .join(path)
                .map(|url| url.to_string())
                .map_err(|error| format!("Invalid search API URL: {error}"));
        }
    }
    Ok(parsed.to_string())
}

fn fetch_direct(source_url: &str) -> Result<WebSearchResult, String> {
    let fetch_client = web_fetch_client()?;
    let mut current_url = Url::parse(source_url)
        .map_err(|error| format!("Invalid web fetch URL {source_url}: {error}"))?;

    for redirect_count in 0..=FETCH_MAX_REDIRECTS {
        validate_public_url(&current_url, !fetch_client.uses_proxy)
            .map_err(|error| describe_fetch_url_error(&error, source_url, &current_url))?;
        let response = fetch_client
            .client
            .get(current_url.clone())
            .send()
            .map_err(|error| format!("Failed to fetch {current_url}: {error}"))?;

        if response.status().is_redirection() {
            if redirect_count == FETCH_MAX_REDIRECTS {
                return Err(format!(
                    "Web fetch exceeded {FETCH_MAX_REDIRECTS} redirects for {source_url}"
                ));
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| format!("Redirect from {current_url} did not include a location"))?;
            let previous_url = current_url.clone();
            current_url = current_url
                .join(location)
                .map_err(|error| format!("Invalid redirect from {current_url}: {error}"))?;
            validate_public_url(&current_url, !fetch_client.uses_proxy).map_err(|error| {
                format!("{error} after redirect from {previous_url} to {current_url}")
            })?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!(
                "Web fetch failed with HTTP {} for {current_url}",
                response.status()
            ));
        }
        if response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .is_some_and(|length| length > FETCH_MAX_BYTES)
        {
            return Err(format!(
                "Web fetch response exceeds the {} byte limit",
                FETCH_MAX_BYTES
            ));
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("text/plain")
            .to_ascii_lowercase();
        if !is_readable_content_type(&content_type) {
            return Err(format!(
                "Unsupported web fetch content type: {content_type}"
            ));
        }

        let mut bytes = Vec::new();
        response
            .take(FETCH_MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Failed to read {current_url}: {error}"))?;
        if bytes.len() as u64 > FETCH_MAX_BYTES {
            return Err(format!(
                "Web fetch response exceeds the {} byte limit",
                FETCH_MAX_BYTES
            ));
        }
        let raw = String::from_utf8_lossy(&bytes);
        let (title, content) = if content_type.contains("text/html") {
            (
                extract_html_title(&raw).unwrap_or_else(|| current_url.to_string()),
                html_to_text(&raw),
            )
        } else {
            (current_url.to_string(), raw.trim().to_string())
        };
        if content.is_empty() {
            return Err(format!(
                "Web fetch returned empty content for {current_url}"
            ));
        }

        return Ok(WebSearchResult {
            title,
            url: current_url.to_string(),
            content,
            source_input: source_url.to_string(),
        });
    }

    Err(format!("Web fetch failed for {source_url}"))
}

struct WebFetchClient {
    client: Client,
    uses_proxy: bool,
}

fn web_fetch_client() -> Result<WebFetchClient, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECONDS))
        .user_agent(PROXY_USER_AGENT)
        .redirect(Policy::none());
    let proxy_urls = configured_proxy_urls();
    let uses_proxy = !proxy_urls.is_empty();
    let client = apply_system_proxy(builder, &proxy_urls)?
        .build()
        .map_err(|error| format!("Failed to create web fetch client: {error}"))?;
    Ok(WebFetchClient { client, uses_proxy })
}

fn apply_system_proxy(
    mut builder: ClientBuilder,
    proxy_urls: &[String],
) -> Result<ClientBuilder, String> {
    for proxy_url in proxy_urls {
        builder = builder.proxy(
            Proxy::all(proxy_url)
                .map_err(|error| format!("Invalid system proxy {proxy_url}: {error}"))?,
        );
    }
    Ok(builder)
}

fn configured_proxy_urls() -> Vec<String> {
    if let Some(proxy_url) = env_proxy_url() {
        return vec![proxy_url];
    }
    windows_proxy_urls()
}

fn env_proxy_url() -> Option<String> {
    [
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ]
    .into_iter()
    .filter_map(|name| env::var(name).ok())
    .map(|value| value.trim().to_string())
    .find(|value| !value.is_empty())
    .map(normalize_proxy_url)
}

#[cfg(target_os = "windows")]
fn windows_proxy_urls() -> Vec<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(settings) =
        hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
    else {
        return Vec::new();
    };
    let enabled = settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0) != 0;
    if !enabled {
        return Vec::new();
    }
    let Ok(proxy_server) = settings.get_value::<String, _>("ProxyServer") else {
        return Vec::new();
    };
    parse_windows_proxy_server(&proxy_server)
}

#[cfg(not(target_os = "windows"))]
fn windows_proxy_urls() -> Vec<String> {
    Vec::new()
}

fn parse_windows_proxy_server(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if !trimmed.contains('=') {
        return vec![normalize_proxy_url(trimmed)];
    }
    trimmed
        .split(';')
        .filter_map(|part| {
            let (scheme, proxy) = part.split_once('=')?;
            matches!(
                scheme.trim().to_ascii_lowercase().as_str(),
                "http" | "https"
            )
            .then(|| proxy.trim())
        })
        .filter(|proxy| !proxy.is_empty())
        .map(normalize_proxy_url)
        .collect()
}

fn normalize_proxy_url(value: impl AsRef<str>) -> String {
    let value = value.as_ref().trim();
    if value.contains("://") {
        value.to_string()
    } else {
        format!("http://{value}")
    }
}

fn describe_fetch_url_error(error: &str, source_url: &str, current_url: &Url) -> String {
    if current_url.as_str() == source_url {
        error.to_string()
    } else {
        format!("{error} while fetching {source_url} via {current_url}")
    }
}

fn validate_public_url(url: &Url, resolve_dns: bool) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Web fetch only supports HTTP and HTTPS URLs".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Web fetch URLs cannot include credentials".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Web fetch URL is missing a host".to_string())?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err("Web fetch cannot access localhost".to_string());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err(format!(
                "Web fetch cannot access private or reserved address for {host} ({ip})"
            ));
        }
        return Ok(());
    }
    if !resolve_dns {
        return Ok(());
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Web fetch URL uses an unsupported port".to_string())?;
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("Failed to resolve web fetch host {host}: {error}"))?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(format!("Web fetch host {host} did not resolve"));
    }
    if let Some(address) = addresses.iter().find(|address| is_blocked_ip(address.ip())) {
        return Err(format!(
            "Web fetch cannot access private or reserved address for {host} ({})",
            address.ip()
        ));
    }
    Ok(())
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_blocked_ipv4(ip),
        IpAddr::V6(ip) => is_blocked_ipv6(ip),
    }
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || ip.to_ipv4_mapped().is_some_and(is_blocked_ipv4)
}

fn is_readable_content_type(content_type: &str) -> bool {
    content_type.starts_with("text/")
        || content_type.contains("application/json")
        || content_type.contains("application/xml")
        || content_type.contains("application/xhtml+xml")
}

fn extract_html_title(html: &str) -> Option<String> {
    let lowercase = html.to_ascii_lowercase();
    let title_start = lowercase.find("<title")?;
    let content_start = lowercase[title_start..].find('>')? + title_start + 1;
    let content_end = lowercase[content_start..].find("</title>")? + content_start;
    let title = decode_html_entities(&html[content_start..content_end]);
    let title = collapse_whitespace(&title);
    (!title.is_empty()).then_some(title)
}

fn html_to_text(html: &str) -> String {
    let html = remove_html_section(html, "script");
    let html = remove_html_section(&html, "style");
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;
    for character in html.chars() {
        match character {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    collapse_whitespace(&decode_html_entities(&text))
}

fn remove_html_section(html: &str, tag: &str) -> String {
    let mut output = html.to_string();
    let open_pattern = format!("<{tag}");
    let close_pattern = format!("</{tag}>");
    loop {
        let lowercase = output.to_ascii_lowercase();
        let Some(start) = lowercase.find(&open_pattern) else {
            return output;
        };
        let Some(relative_end) = lowercase[start..].find(&close_pattern) else {
            output.truncate(start);
            return output;
        };
        let end = start + relative_end + close_pattern.len();
        output.replace_range(start..end, " ");
    }
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn tavily_endpoint(configured_url: &str) -> Result<String, String> {
    let configured_url = configured_url.trim();
    let endpoint = if configured_url.is_empty() {
        TAVILY_DEFAULT_URL.to_string()
    } else {
        let parsed = Url::parse(configured_url)
            .map_err(|error| format!("Invalid Tavily API URL: {error}"))?;
        if parsed.path().trim_matches('/').is_empty() {
            parsed
                .join("search")
                .map_err(|error| format!("Invalid Tavily API URL: {error}"))?
                .to_string()
        } else {
            parsed.to_string()
        }
    };
    Ok(endpoint)
}

fn next_api_key<'a>(api_keys: &'a [String], provider_id: &str) -> Result<&'a str, String> {
    if api_keys.is_empty() {
        return Err(format!("API key is required for provider {provider_id}"));
    }
    let index = NEXT_API_KEY.fetch_add(1, Ordering::Relaxed) % api_keys.len();
    Ok(api_keys[index].as_str())
}

fn normalize_inputs(inputs: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for input in inputs {
        let input = input.trim();
        if !input.is_empty() && !normalized.iter().any(|existing| existing == input) {
            normalized.push(input.to_string());
        }
    }
    normalized
}

fn is_excluded_url(url: &str, excluded_domains: &[String]) -> bool {
    let Ok(url) = Url::parse(url) else {
        return false;
    };
    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    excluded_domains
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn truncate_error(body: &str) -> String {
    const MAX_ERROR_LENGTH: usize = 500;
    let body = body.trim();
    if body.chars().count() <= MAX_ERROR_LENGTH {
        return body.to_string();
    }
    format!(
        "{}...",
        body.chars().take(MAX_ERROR_LENGTH).collect::<String>()
    )
}

#[derive(Serialize)]
struct TavilySearchRequest<'a> {
    query: &'a str,
    max_results: u32,
}

#[derive(Deserialize)]
struct TavilySearchResponse {
    #[serde(default)]
    results: Vec<TavilySearchResult>,
}

#[derive(Deserialize)]
struct TavilySearchResult {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    content: String,
}

fn response_items<'a>(value: &'a serde_json::Value, paths: &[&str]) -> &'a [serde_json::Value] {
    paths
        .iter()
        .find_map(|path| value.pointer(path).and_then(serde_json::Value::as_array))
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn map_json_results(
    query: &str,
    items: &[serde_json::Value],
    max_results: u32,
    title_keys: &[&str],
    content_keys: &[&str],
    url_keys: &[&str],
) -> Vec<WebSearchResult> {
    items
        .iter()
        .take(max_results as usize)
        .map(|item| WebSearchResult {
            title: first_string(item, title_keys),
            content: first_string(item, content_keys),
            url: first_string(item, url_keys),
            source_input: query.to_string(),
        })
        .collect()
}

fn first_string(item: &serde_json::Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(serde_json::Value::as_str))
        .unwrap_or("")
        .trim()
        .to_string()
}

fn parse_tavily_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let response: TavilySearchResponse = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Tavily search response: {error}"))?;
    Ok(response
        .results
        .into_iter()
        .take(max_results as usize)
        .map(|result| WebSearchResult {
            title: result.title.trim().to_string(),
            url: result.url.trim().to_string(),
            content: result.content.trim().to_string(),
            source_input: query.to_string(),
        })
        .collect())
}

fn parse_zhipu_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Zhipu search response: {error}"))?;
    Ok(map_json_results(
        query,
        response_items(&value, &["/search_result"]),
        max_results,
        &["title"],
        &["content"],
        &["link"],
    ))
}

fn parse_exa_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Exa search response: {error}"))?;
    Ok(map_json_results(
        query,
        response_items(&value, &["/results"]),
        max_results,
        &["title"],
        &["text"],
        &["url"],
    ))
}

fn parse_bocha_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Bocha search response: {error}"))?;
    if value.get("code").and_then(serde_json::Value::as_i64) != Some(200) {
        return Err(format!(
            "Bocha search failed: {}",
            value
                .get("msg")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown error")
        ));
    }
    Ok(map_json_results(
        query,
        response_items(&value, &["/data/webPages/value"]),
        max_results,
        &["name"],
        &["summary", "snippet"],
        &["url"],
    ))
}

fn parse_searxng_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid SearXNG search response: {error}"))?;
    Ok(map_json_results(
        query,
        response_items(&value, &["/results"]),
        max_results,
        &["title"],
        &["content", "snippet"],
        &["url"],
    ))
}

fn parse_jina_search_response(
    query: &str,
    body: &str,
    max_results: u32,
) -> Result<Vec<WebSearchResult>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Jina search response: {error}"))?;
    Ok(map_json_results(
        query,
        response_items(&value, &["/data", "/results"]),
        max_results,
        &["title"],
        &["content", "description"],
        &["url"],
    ))
}

fn parse_jina_fetch_response(source_url: &str, body: &str) -> Result<WebSearchResult, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid Jina fetch response: {error}"))?;
    let data = value.get("data").unwrap_or(&value);
    let content = first_string(data, &["content", "text"]);
    if content.is_empty() {
        return Err(format!(
            "Jina fetch returned empty content for {source_url}"
        ));
    }
    Ok(WebSearchResult {
        title: {
            let title = first_string(data, &["title"]);
            if title.is_empty() {
                source_url.to_string()
            } else {
                title
            }
        },
        url: {
            let url = first_string(data, &["url"]);
            if url.is_empty() {
                source_url.to_string()
            } else {
                url
            }
        },
        content,
        source_input: source_url.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tavily_base_url_gets_search_path() {
        assert_eq!(
            tavily_endpoint("https://api.tavily.com").unwrap(),
            "https://api.tavily.com/search"
        );
        assert_eq!(
            tavily_endpoint("https://example.test/custom/search").unwrap(),
            "https://example.test/custom/search"
        );
    }

    #[test]
    fn tavily_response_maps_to_common_results() {
        let results = parse_tavily_response(
            "rust releases",
            r#"{
                "results": [
                    {
                        "title": " Rust 1.0 ",
                        "url": " https://example.com/rust ",
                        "content": " Release notes "
                    }
                ]
            }"#,
            5,
        )
        .unwrap();

        assert_eq!(
            results,
            vec![WebSearchResult {
                title: "Rust 1.0".to_string(),
                url: "https://example.com/rust".to_string(),
                content: "Release notes".to_string(),
                source_input: "rust releases".to_string(),
            }]
        );
    }

    #[test]
    fn configured_endpoint_uses_default_and_appends_missing_path() {
        assert_eq!(
            configured_endpoint("", EXA_DEFAULT_URL, Some("search")).unwrap(),
            EXA_DEFAULT_URL
        );
        assert_eq!(
            configured_endpoint(
                "https://search.example.test",
                EXA_DEFAULT_URL,
                Some("search")
            )
            .unwrap(),
            "https://search.example.test/search"
        );
        assert_eq!(
            configured_endpoint(
                "https://search.example.test/custom",
                EXA_DEFAULT_URL,
                Some("search"),
            )
            .unwrap(),
            "https://search.example.test/custom"
        );
    }

    #[test]
    fn zhipu_response_maps_to_common_results() {
        let results = parse_zhipu_response(
            "query",
            r#"{"search_result":[{"title":"Title","content":"Content","link":"https://example.com"}]}"#,
            5,
        )
        .unwrap();
        assert_eq!(results[0].title, "Title");
        assert_eq!(results[0].content, "Content");
        assert_eq!(results[0].url, "https://example.com");
    }

    #[test]
    fn exa_response_maps_to_common_results() {
        let results = parse_exa_response(
            "query",
            r#"{"results":[{"title":"Title","text":"Content","url":"https://example.com"}]}"#,
            5,
        )
        .unwrap();
        assert_eq!(results[0].content, "Content");
    }

    #[test]
    fn bocha_response_prefers_summary_and_checks_status() {
        let results = parse_bocha_response(
            "query",
            r#"{"code":200,"data":{"webPages":{"value":[{"name":"Title","summary":"Summary","snippet":"Snippet","url":"https://example.com"}]}}}"#,
            5,
        )
        .unwrap();
        assert_eq!(results[0].content, "Summary");

        let error = parse_bocha_response("query", r#"{"code":401,"msg":"invalid key"}"#, 5)
            .expect_err("non-200 provider status should fail");
        assert!(error.contains("invalid key"));
    }

    #[test]
    fn searxng_response_maps_to_common_results() {
        let results = parse_searxng_response(
            "query",
            r#"{"results":[{"title":"Title","content":"Content","url":"https://example.com"}]}"#,
            5,
        )
        .unwrap();
        assert_eq!(results[0].title, "Title");
    }

    #[test]
    fn jina_search_and_fetch_responses_map_to_common_results() {
        let search_results = parse_jina_search_response(
            "query",
            r#"{"data":[{"title":"Title","description":"Description","url":"https://example.com"}]}"#,
            5,
        )
        .unwrap();
        assert_eq!(search_results[0].content, "Description");

        let fetched = parse_jina_fetch_response(
            "https://example.com",
            r#"{"data":{"title":"Page","url":"https://example.com/page","content":"Readable text"}}"#,
        )
        .unwrap();
        assert_eq!(fetched.title, "Page");
        assert_eq!(fetched.url, "https://example.com/page");
        assert_eq!(fetched.content, "Readable text");
    }

    #[test]
    fn excluded_domains_include_subdomains() {
        let excluded = vec!["example.com".to_string()];
        assert!(is_excluded_url("https://docs.example.com/page", &excluded));
        assert!(!is_excluded_url("https://example.org/page", &excluded));
    }

    #[test]
    fn search_rejects_missing_provider_before_network_access() {
        let error = search_keywords(&WebSearchSettings::default(), &["query".to_string()])
            .expect_err("missing provider should fail");
        assert_eq!(error, "Default web search provider is not configured");
    }

    #[test]
    fn private_and_reserved_addresses_are_blocked() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "100.64.0.1",
            "192.0.2.1",
            "198.51.100.1",
            "203.0.113.1",
            "::1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(is_blocked_ip(ip.parse().unwrap()), "{ip} should be blocked");
        }
        assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_blocked_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn windows_proxy_settings_are_normalized() {
        assert_eq!(
            parse_windows_proxy_server("127.0.0.1:7890"),
            vec!["http://127.0.0.1:7890".to_string()]
        );
        assert_eq!(
            parse_windows_proxy_server("http=127.0.0.1:7890;https=https://proxy.example:8443"),
            vec![
                "http://127.0.0.1:7890".to_string(),
                "https://proxy.example:8443".to_string(),
            ]
        );
        assert!(parse_windows_proxy_server("ftp=127.0.0.1:7890").is_empty());
    }

    #[test]
    fn html_is_reduced_to_readable_text() {
        let html = r#"
            <html>
              <head><title> Example &amp; Test </title><style>.hidden {}</style></head>
              <body><h1>Hello</h1><script>alert("no")</script><p>World&nbsp;today</p></body>
            </html>
        "#;
        assert_eq!(extract_html_title(html).as_deref(), Some("Example & Test"));
        let text = html_to_text(html);
        assert!(text.contains("Hello World today"));
        assert!(!text.contains("alert"));
        assert!(!text.contains(".hidden"));
    }

    #[test]
    fn fetch_rejects_private_url_before_network_access() {
        let error = fetch_urls(
            &WebSearchSettings::default(),
            &["http://127.0.0.1/private".to_string()],
        )
        .expect_err("private URL should fail");
        assert!(error.contains("private or reserved"));
        assert!(error.contains("127.0.0.1"));
    }

    #[test]
    fn proxy_mode_still_rejects_private_ip_literals() {
        let error = validate_public_url(&Url::parse("http://127.0.0.1/private").unwrap(), false)
            .expect_err("private IP literals must be blocked even through a proxy");

        assert!(error.contains("private or reserved"));
        assert!(error.contains("127.0.0.1"));
    }

    #[test]
    fn proxy_mode_does_not_require_local_dns_for_public_domains() {
        validate_public_url(
            &Url::parse("https://blog.csdn.net/example/article/details/1").unwrap(),
            false,
        )
        .expect("proxy mode should let the proxy resolve public domain names");
    }
}
