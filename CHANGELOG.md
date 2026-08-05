# Changelog

All notable changes to the projektXD Thunderbird add-on are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [2.1.0] — 2026-08-05

Requirements: Thunderbird **140 ESR** or newer · Manifest V3

### Added

- **Browser bridge `window.projektxd_tb`** (bridge API **v1.0.0**) — lets the
  projektXD web app talk to Thunderbird when it runs inside the add-on
  (injected only on the configured projektXD origin). See
  [`doc/browser-api.md`](doc/browser-api.md) for the full contract.
  - `openCompose(emlBlob)` — open a Thunderbird compose window pre-filled from
    an EML (imported as a draft in the account's Drafts folder).
  - `registerOnEmail(cb)` / `unregisterOnEmail()` — receive an opened email
    (raw EML + `subject`/`from`/`date`/`messageId`) for ticket creation.
- **"Als projektXD-Ticket" button** in an opened email's header toolbar
  (`message_display_action`): reads the email, switches to the projektXD tab
  (signing in first if needed) and hands the email to the web app.
- **Auto-login on Thunderbird startup**: if the projektXD tab is restored from
  the previous session, the add-on now signs in automatically — no need to
  close and reopen the tab.
- **Toolbar button visible in every space**: the projektXD button now stays in
  the toolbar across all tabs (mail, calendar, the projektXD web tab, …),
  not just the mail space.

### Changed

- New permissions required by the mail integration: `messagesRead`,
  `messagesImport`, `accountsRead`, `compose`, `notifications`.

### Notes

- Verified end-to-end in Thunderbird 140.11.1 ESR against the projektXD demo
  instance: add-on load, auto-login, all-spaces button, bridge injection and the
  ticket flow. Two Thunderbird-140 API mismatches surfaced during testing and
  were fixed before release: displayed-message lookup now uses
  `messageDisplay.getDisplayedMessages`, and the Drafts folder is located via
  `MailFolder.specialUse` (the older `type` field was removed in TB 121+).

## [2.0.0] — 2025

### Added

- Thunderbird 140 ESR support (Manifest V3) and the automatic-login flow:
  open the projektXD instance from the toolbar, reuse an existing tab, and
  silently re-authenticate with the stored credentials when the session has
  expired.

[2.1.0]: https://git.pegenau.de/pkg/projektxd_tbplugin
[2.0.0]: https://git.pegenau.de/pkg/projektxd_tbplugin
