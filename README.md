# Codex Switch Mini

Private desktop utility for managing Codex providers and Codex session continuity.

## Purpose

- Switch Codex providers from a clean desktop UI.
- Let the app write Codex config instead of manually editing local files.
- Record provider/workspace/session relationships so previous chats are easier to find and resume.

## Initial Scope

- Windows-first.
- Codex-only.
- Private/internal use only.
- No public open-source packaging required.
- No automatic backup feature.

## Current Stack

- Tauri 2 desktop shell.
- React + TypeScript frontend.
- Rust backend.
- SQLite local app database.

## Implemented Scaffold

- Sidebar-based desktop UI with:
  - Dashboard
  - Providers
  - Sessions
  - Settings
- Provider CRUD form for:
  - name
  - base URL
  - API key
  - model
  - reasoning effort
  - extra TOML
- Provider activation flow that is designed to write:
  - `auth.json`
  - `config.toml`
- Session recording foundation:
  - workspace path
  - provider relation
  - title
  - notes
  - session reference
  - status
- SQLite-backed settings for:
  - Codex config directory
  - default workspace
  - terminal program
  - auto-record behavior

## Validation Status

- Frontend dependencies installed.
- Frontend production build passes with `npm run build`.
- Rust/Tauri build has not been validated yet because the Rust toolchain is not available in the current environment.

## Local Setup

1. Install Node.js 20+.
2. Install Rust via `rustup`.
3. From the repository root, run:
   - `npm install`
   - `npm run tauri dev`

## Repository Status

This repository is initialized and already pushed to the private GitHub remote. The first working scaffold is now in place.
