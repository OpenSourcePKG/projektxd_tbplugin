<p align="center">
  <img src="../assets/chrome/content/images/projektxd.png" width="96" alt="projektXD logo">
</p>

<h1 align="center">projektXD Add-on — User guide</h1>

This page walks you through installation and configuration. For developer documentation see the [project README](../README.md).

## 1. Install the add-on

1. Download `built/projektXD-<version>.xpi` (e.g. `projektXD-2.0.0.xpi`).
2. In Thunderbird open **Settings → Add-ons & Themes**.
3. Click the gear icon → **Install Add-on From File…** and pick the `.xpi`.
4. Confirm the install dialog. Thunderbird will state that the add-on needs **"Access your data for all websites"** — this is needed because every projektXD instance lives on a different host. The add-on only uses this access for your configured projektXD URL.

## 2. Configure the connection

Open **Add-ons & Themes → projektXD → Preferences** (or right after install: **Options**).

### Connection

| Field | Meaning |
|---|---|
| **URL** | The full address to your projektXD instance, including path, e.g. `https://portal.example.com/projekte/`. Must start with `http://` or `https://`. Invalid input shows an error toast. |
| **Activate** | Required once after install. Click it and confirm the permission prompt — Thunderbird needs an explicit user click to grant the host access. The status pill below the field switches from orange "Access required" to green "Access granted". |

### Credentials

| Field | Meaning |
|---|---|
| **Username** | Your projektXD login name. |
| **Password** | Your projektXD password. The eye button toggles visibility. |
| **Sign in automatically** | If enabled, clicking the toolbar icon will silently sign you in if you're not already logged in. |

Every field auto-saves on blur. A small "Saved" pill in the header flashes after each change.

## 3. Use it

Click the **projektXD icon** in the Thunderbird toolbar:

- If a tab matching the configured URL is already open, it is focused.
- Otherwise a new tab is opened.
- If *Sign in automatically* is enabled and you are not already logged in, the add-on logs you in by calling the projektXD backend and reloads the tab so the SPA picks up the new session.

## Troubleshooting

**The login does not happen.**
Open the Thunderbird Error Console (**Tools → Developer Tools → Error Console**, or `Ctrl+Shift+J`) and look for messages prefixed with `projektXD::`. The background logs the actual tab URL and the granted permissions before each injection attempt:

```
projektXD: about to inject — tab.url=... granted={...}
```

If `granted` does not include `<all_urls>` or your specific origin, return to the options dialog and click **Activate** again.

**The status pill stays orange after I clicked Activate.**
Confirm the Thunderbird permission prompt that pops up. If you missed it, click **Activate** again — the prompt only appears in response to a direct user click.

**I reinstalled the add-on and now nothing works.**
Reinstalling resets runtime-granted host permissions. Open the options dialog and click **Activate** once more.

**The toolbar opens a tab but I'm not logged in.**
Check that *Sign in automatically* is enabled. If yes, check the Error Console for `ProjektXDApi.login: success=...` — `false` means the backend rejected the credentials.