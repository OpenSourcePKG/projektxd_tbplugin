<p align="center">

<img src="./assets/chrome/content/images/projektxd.png" width="96" alt="projektXD logo">
</p>

<h1 align="center">projektXD Thunderbird Add-on</h1>

<p align="center">
  Open your projektXD instance from inside Thunderbird — and sign in automatically.
</p>

---

## About projektXD

[**projektXD**](https://www.pegenau.de/on-premise-produkte/projektmanagement/) is an on-premise project management solution from Pegenau, aimed at small and mid-sized organisations. It bundles Kanban-style task boards, an integrated ticket system, configurable project templates and real-time dashboards into one self-hosted application — and ships with a mobile app that keeps working offline (handy on construction sites or in the field).

### Why combine it with this add-on?

projektXD lives in the browser, your team probably lives in Thunderbird. Without this add-on the daily workflow looks like *"open browser → find the projektXD tab → re-authenticate after the session expired → switch back to Thunderbird"*. The add-on closes that loop:

- **One-click access** straight from the Thunderbird toolbar — no second browser window to juggle.
- **Silent re-auth** when your projektXD session has timed out: the add-on calls the login endpoint with your stored credentials and reloads the tab, so you land on the page you wanted.
- **Tab re-use** instead of opening a new tab every time you click.
- **No server-side changes** required on the projektXD instance — the add-on works against the standard backend endpoints.

## Requirements

- Thunderbird **140 ESR** or newer
- Manifest V3

## User guide

Step-by-step install & configuration instructions:

- 🇬🇧 [English user guide](doc/en.md)
- 🇩🇪 [Deutsche Anleitung](doc/de.md)

## How it works

Clicking the toolbar icon triggers the background script (`src/chrome/background.ts`):

1. Loads the saved settings.
2. Finds an existing tab whose URL matches the configured projektXD origin; otherwise opens a new tab.
3. Waits for `tabs.onUpdated` with `status === 'complete'` **and** the URL actually matching the target (so the script never fires on `about:blank`).
4. If *auto-login* is enabled:
   - Injects `chrome/content/scripts/login.js` via `scripting.executeScript`.
   - Delivers the credentials to the content script through `tabs.sendMessage`.

The content script (`src/chrome/content/scripts/login.ts`):

1. Receives the credentials via `runtime.onMessage`.
2. Calls `POST /backend/main/Init` to check the login state.
3. If not logged in, calls `POST /backend/main/Login` with `credentials: 'include'` — the browser stores the session cookie automatically.
4. Reloads the tab so the SPA picks up the established session.

No server-side changes are required.

## Development

### Install dependencies

```bash
npm install
```

`mozilla-webext-types` is consumed as a local filesystem package (`file:../mozilla-webext-types`).

### Build

```bash
npx grunt
```

produces:

- `dist/` — the unpacked extension, ready for temporary loading via `about:debugging`
- `built/projektXD-<version>.xpi` — installable package

### Type-check

```bash
npx tsc --noEmit -p src/tsconfig.json
```

### Local test environment

`docker-compose.yml` and `thunderbird/Dockerfile` build a container running Thunderbird 140 ESR behind a noVNC server:

```bash
docker compose up
```

then open `http://127.0.0.1:8080` in a browser.

## Project layout

```
assets/                        static add-on files (copied to dist/)
  manifest.json
  _locales/{de,en_US}/messages.json
  chrome/content/
    images/projektxd.png
    ui/options.{html,css}
src/chrome/
  background.ts                toolbar click → open tab → trigger auto-login
  content/
    scripts/login.ts           content script: init check, login, reload
    ui/options.ts              options dialog logic
  inc/
    Api/projektXDApi.ts        fetch wrapper for /backend/main/{Init,Login}
    Settings.ts                browser.storage.local wrapper
    Types/projektXDOptions.ts  settings type
    Utils/{Toast,Translation,JoinUrl,Debug}.ts
doc/                           user guides (EN/DE)
thunderbird/                   docker setup for local testing
webpack.config.js              bundle configuration (outputs under dist/chrome/)
Gruntfile.js                   build pipeline: clean → copy → webpack → compress
```

## License

GPL-3.0