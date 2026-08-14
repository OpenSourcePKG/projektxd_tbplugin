# Changelog

All notable changes to the projektXD Thunderbird add-on are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [2.3.2] — 2026-08-14

Requirements: Thunderbird **140 ESR** or newer · Manifest V3

### Fixed

- **Setting up the add-on no longer redirects you away from the settings page.**
  Clicking **Activate** or flipping the **Sign in automatically** toggle used to
  jump straight to the projektXD instance, because every saved change promoted
  the open options tab to the instance URL. That promotion is gone — the
  settings page now stays put while you configure it. (#5)
- **The spaces-toolbar icon opens projektXD instead of the settings page — no
  Thunderbird restart required.** The spaces button owns a single tab and
  *switches to* it on click, so the first (unconfigured) click made the settings
  page "sticky". The button is now kept in sync with the configured instance URL
  as soon as setup is complete, so closing the settings page and clicking the
  icon opens the projektXD instance right away. (#5)

### Changed

- **The separate "Activate" button is no longer needed for the normal setup
  flow.** Turning on **Sign in automatically** now requests the required host
  access to the projektXD URL directly, inside that click; the **Activate**
  button remains as a manual fallback. On Manifest V3 host access is an
  *optional* permission that Thunderbird must grant via a prompt — it cannot be
  granted silently, so a one-time confirmation still appears.

## [2.2.1] — 2026-08-10

Requirements: Thunderbird **140 ESR** or newer · Manifest V3

### Changed

- **Renamed the add-on to "projektXD Connector".** The display name
  (`extensionName`) is updated in both the `en_US` and `de` locales. Brand text
  is normalized from `ProjektXD` to the correct `projektXD` casing across UI
  strings, docs and log output — TypeScript class/type identifiers keep
  PascalCase by language convention.
- **New logo and full icon set.** Replaced the single 120×120 PNG with a
  scalable SVG source (`projektXD.svg`) plus rendered PNGs at 16 / 24 / 32 / 48 /
  64 / 96 / 128 px. The manifest icons are now size-keyed (16–128), and the
  toolbar and message-display buttons ship 16 / 24 / 32 px icons for standard
  and HiDPI displays.

## [2.2.0] — 2026-08-06

Requirements: Thunderbird **140 ESR** or newer · Manifest V3

### Changed

- **EML → Thunderbird now opens the email read-only instead of a compose
  window** (bridge API **v1.1.0**). The old flow imported the EML into the
  Drafts folder and opened a compose window seeded with the original message's
  headers, producing a nonsensical "reply" addressed to the original
  sender/recipient. The add-on now hands the EML to `messageDisplay.open` as a
  file, so it opens read-only in a new message tab — exactly as if opened from
  disk. The user decides for themselves whether to just read it or use
  Thunderbird's native Reply / Reply-All / Forward buttons, which fill all
  fields correctly.
- New bridge method **`openMessage(emlBlob)`** replaces `openCompose`.
  `openCompose(emlBlob)` is kept as a **deprecated alias** with the same
  read-only behavior and logs a one-time console warning; it will be removed in
  a future major version once the projektXD page has migrated.

### Removed

- Dropped the now-unused `messagesImport`, `accountsRead` and `compose`
  permissions — the read-only open needs only `messagesRead`. Removed the
  `ComposeDraft` class (Drafts-folder search + import + `compose.beginNew`).

## [2.1.1] — 2026-08-06

Requirements: Thunderbird **140 ESR** or newer · Manifest V3

### Fixed

- **Sending an email from projektXD to Thunderbird failed** with
  *"Incorrect argument types for messages.import."* The `openCompose` bridge
  path passed the whole `MailFolder` object to `messages.import`, but the
  Thunderbird API (mandatory for Manifest V3) expects a `MailFolderId` string.
  `ComposeDraft.openFromEml` now passes the Drafts folder's `id`. Verified
  end-to-end in Thunderbird 140.11.1 ESR: the EML is imported into the Drafts
  folder and the compose window opens.

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

[2.2.1]: https://git.pegenau.de/pkg/projektxd_tbplugin
[2.2.0]: https://git.pegenau.de/pkg/projektxd_tbplugin
[2.1.1]: https://git.pegenau.de/pkg/projektxd_tbplugin
[2.1.0]: https://git.pegenau.de/pkg/projektxd_tbplugin
[2.0.0]: https://git.pegenau.de/pkg/projektxd_tbplugin
