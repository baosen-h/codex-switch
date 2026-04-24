# Codex Switch

Codex Switch is a small Windows desktop app for:

- Codex
- Claude Code
- Gemini

It helps manage providers, local sessions, and config directories.

This project is mainly for learning and communication. Please review the code carefully before using real credentials or relying on it in production.

## Features

- Manage providers for Codex, Claude Code, and Gemini
- Preview config before saving
- Browse local sessions and copy resume commands
- Change config directories, workspace, theme, and language
- Build Windows packages with Tauri

## Use

Download the latest installer from GitHub Releases, then:

https://github.com/baosen-h/codex-switch/releases/latest

1. Open the app
2. Go to **Settings**
3. Confirm your config directories
4. Add providers under **Agents**
5. Enable the provider you want

- **Agents**: add, edit, and enable providers
- **Sessions**: search local sessions and inspect conversation history
- **Settings**: configure directories, workspace, theme, and language

## Local Development

- Node.js 20+
- Rust stable toolchain
- Windows WebView2 runtime

Run locally:

```bash
npm install
npm run tauri dev
```

Build:

```bash
npm run build
npm run tauri build
```

## Release

Build the Windows installers:

```bash
npm run build
npm run tauri build
```

Then upload the generated files from:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

If you want to version the release with git:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT. See `LICENSE`.
