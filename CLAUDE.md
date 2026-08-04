# CLAUDE.md

Instructions for working in this repository. Follow these exactly.

> - All project content — code, comments, docs, notes, commit messages — is written in **English**.
> - The app name is spelled **projektXD** (lowercase `projekt`, uppercase `XD`). Spell it this way everywhere: prose, filenames (`projektXDApi.ts`), and the build artifact (`projektXD-<version>.xpi`). Exception: TypeScript class/type identifiers stay PascalCase (`ProjektXDApi`, `ProjektXDOptions`) per language convention.

## Synaipse (MCP) — REQUIRED

**Synaipse MUST be used via MCP.** This project has the `synaipse` MCP server
configured (`.mcp.json`, `http://localhost:3001/mcp`, project header
`X-Synaipse-Project: projektxd_tbplugin`).

Rules:

- Use the `mcp__synaipse__*` tools as the **project knowledge store** — not the
  local file memory. Important design decisions, architecture notes and open
  tasks belong in Synaipse.
- **At session start**, load context (`synaipse_prime` / `synaipse_recent`) and
  search relevant notes (`synaipse_search`) before working on the code.
- **Capture new knowledge** with `synaipse_write_note` / `synaipse_remember`;
  maintain existing notes with `synaipse_edit_note` / `synaipse_update_note` and
  connect them via `synaipse_link_note`.
- **At session end**, log relevant results via `synaipse_log_session`.
- If the server is unreachable (tools unavailable), tell the user instead of
  silently falling back to local memory.

## Project overview

projektXD Thunderbird add-on (Manifest V3, Thunderbird 140 ESR+). Opens the
projektXD instance from within Thunderbird and silently re-authenticates the user
when the session has expired. See `README.md` for details.

## Commands

```bash
npm install                             # dependencies (mozilla-webext-types via file:../)
npx grunt                               # build → dist/ (unpacked) + built/*.xpi
npx tsc --noEmit -p src/tsconfig.json   # type-check
docker compose up                       # Thunderbird 140 ESR (noVNC at http://127.0.0.1:8080)
```

## Layout (short)

- `src/chrome/background.ts` — toolbar click → open/find tab → trigger auto-login.
- `src/chrome/content/scripts/login.ts` — content script: `Init` check, `Login`, reload.
- `src/chrome/inc/Api/projektXDApi.ts` — fetch wrapper for `/backend/main/{Init,Login}`.
- `src/chrome/inc/Settings.ts` — `browser.storage.local` wrapper.
- `assets/` — static add-on files (`manifest.json`, `_locales`, UI), copied to `dist/`.

## Conventions

- TypeScript, no server-side changes — the add-on only uses standard backend endpoints.
- Run the type-check before commits; commit/push only when the user explicitly asks.