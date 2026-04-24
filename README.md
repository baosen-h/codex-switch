# Codex Switch

Codex Switch is a Windows-first desktop app for managing local provider settings for:

- Codex
- Claude Code
- Gemini

It gives you one place to edit provider profiles, switch the active profile for each agent, browse local session history, and update the config directories these tools use on your machine.

## Features

- Multi-agent provider management for Codex, Claude Code, and Gemini
- Local profile storage in SQLite
- Config preview before writing provider settings
- Session browser with transcript viewer and resume command copy
- Settings UI for config directories, workspace defaults, theme, and language
- Native Windows bundle output via Tauri (`.msi` and NSIS `.exe`)

## Privacy

Codex Switch stores provider metadata and API keys locally on your machine.

- Database location: inside your user profile under `.codex-switch`
- API keys are not sent to any remote server by this app
- Generated config files are written to the local agent config directories you choose

Please review the code before using it with production credentials.

## Install on Windows

Download the latest installer from the GitHub Releases page:

- `.msi` for standard Windows installation
- `.exe` (NSIS) if you prefer the alternative installer

After installation:

1. Open the app
2. Go to **Settings**
3. Confirm your local config directories
4. Add providers under **Agents**
5. Activate the provider you want for each agent

## How to Use

### Add a provider

1. Open **Agents**
2. Select the target agent tab (`Codex`, `Claude Code`, or `Gemini`)
3. Click **Add**
4. Fill in:
   - Name
   - Model
   - Base URL
   - API key
   - Official website (optional)
   - Agent-specific extras
5. Save the profile

### Switch the active provider

Click **Enable** on the provider row for the agent you want to switch.

The app writes the corresponding local config files for that agent.

### Browse sessions

Open **Sessions** to:

- search local sessions
- filter by agent
- inspect transcripts
- copy resume commands
- copy workspace paths

### Settings

Open **Settings** to configure:

- Codex config directory
- Claude Code config directory
- Gemini config directory
- Default workspace
- Terminal program
- Language
- Theme

On Windows, you can use the mouse-based folder picker instead of typing paths manually.

## Local Development

### Requirements

- Node.js 20+
- Rust stable toolchain
- Windows WebView2 runtime

### Run locally

```bash
npm install
npm run tauri dev
```

### Build production bundles

```bash
npm run build
npm run tauri build
```

Expected Windows bundle outputs:

- `src-tauri/target/release/bundle/msi/*.msi`
- `src-tauri/target/release/bundle/nsis/*.exe`

## Publish a Release

This repo includes a GitHub Actions workflow for Windows releases.

### Recommended flow

1. Commit your changes
2. Create a version tag, for example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. GitHub Actions builds the Windows bundles
4. The workflow creates or updates a GitHub Release
5. Users can download the `.msi` from the release page

## Project Structure

- `src/` — React + TypeScript frontend
- `src-tauri/src/` — Rust backend and local config/session logic
- `docs/` — notes and schema documentation
- `scripts/` — helper scripts

## License

MIT. See `LICENSE`.
