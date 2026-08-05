<p align="center">
  <img src="../assets/chrome/content/images/projektxd.png" width="96" alt="projektXD logo">
</p>

<h1 align="center">projektXD Add-on — Browser Bridge API</h1>

This document describes the `window.projektxd_tb` JavaScript API that the projektXD Thunderbird add-on injects into the projektXD web app. It is intended for projektXD frontend developers who want to integrate with Thunderbird.

> **Status**: implemented contract — bridge API **v1.0.0**, shipping with the projektXD Thunderbird add-on from version **2.1.0**. Target: Thunderbird 140 ESR.

## Overview

When the projektXD web app is opened inside Thunderbird through the add-on, the add-on injects a small bridge object at `window.projektxd_tb` into the page. The web app can use this object to:

1. **Open a Thunderbird compose window** pre-filled with a given EML — for example, to let the user send a reply drafted inside projektXD.
2. **Receive emails from Thunderbird** — when the user clicks the "projektXD" button shown in an opened email's header toolbar, a callback registered by the web app is invoked with the email's EML (plus a little convenience metadata), ready for ticket creation.

The API is only injected on the projektXD origin configured in the add-on's preferences. On every other site, `window.projektxd_tb` is `undefined`.

## Availability check

Always feature-detect before use:

```ts
if (window.projektxd_tb) {
    // Add-on is active — API is available.
} else {
    // Plain browser, or Thunderbird without the add-on.
}
```

The bridge is injected at `document_start` and is reliably present from `DOMContentLoaded` onwards.

## Type definitions

```ts
/**
 * Email address with an optional display name.
 */
type EmailAddress = {
    /** Display name, e.g. "Jane Doe". Empty string if not present. */
    name: string;
    /** Bare email address, e.g. "jane@example.com". */
    email: string;
};

/**
 * Minimal, cheaply-available metadata for an email, provided as a convenience
 * for ticket creation. The complete email is delivered as the accompanying
 * `eml` Blob — parse it yourself if you need more than these fields.
 */
type EmailMeta = {
    /** Decoded Subject header. */
    subject: string;
    /** Sender. */
    from: EmailAddress;
    /** Send date as an ISO-8601 string, e.g. "2026-06-05T13:42:00.000Z". */
    date: string;
    /** RFC 5322 Message-ID header (without surrounding angle brackets). */
    messageId: string;
};

/**
 * Callback signature for `registerOnEmail`.
 *
 * @param eml  The original, complete EML file of the email as a Blob
 *             (including all MIME parts and attachments). Content-Type:
 *             "message/rfc822". Can be uploaded as-is to e.g. a ticket
 *             endpoint.
 * @param meta A few parsed header fields for fast access. Optional —
 *             ignore it if you don't need it.
 *
 * If the callback returns a Promise, the add-on does NOT await it
 * (fire-and-forget). Errors thrown inside the callback are logged by
 * the add-on but not propagated to Thunderbird.
 */
type OnEmailCallback = (eml: Blob, meta: EmailMeta) => void | Promise<void>;

interface ProjektXDTbBridge {
    /** Version string of the bridge API. Follows SemVer. */
    readonly version: string;

    /**
     * Opens a compose window in Thunderbird, pre-filled from the given
     * EML, as a draft in the first account's Drafts folder.
     *
     * The draft remains in the Drafts folder until the user sends or
     * discards it — the add-on does not clean it up.
     *
     * @param emlBlob A complete EML file as a Blob (Content-Type
     *                "message/rfc822" recommended, not enforced).
     * @returns Promise that resolves once the draft has been imported
     *          and the compose window is open. Rejects on invalid EML
     *          or a missing Drafts folder.
     */
    openCompose(emlBlob: Blob): Promise<void>;

    /**
     * Registers a callback to be invoked when the user clicks the
     * "projektXD" button in the header of an opened email in
     * Thunderbird.
     *
     * Only ONE callback is active at a time — calling `registerOnEmail`
     * again replaces the previous one.
     *
     * Lifecycle: the callback is lost on page reload. Register it
     * early after `DOMContentLoaded`. If the user clicks the button
     * before projektXD has registered, the add-on buffers ONE event
     * for up to 10 seconds.
     *
     * Precondition: the user must be logged in to projektXD. If not,
     * the add-on attempts auto-login (when enabled in preferences),
     * then delivers the event. Otherwise the user gets a notification
     * asking them to log in.
     */
    registerOnEmail(cb: OnEmailCallback): void;

    /**
     * Removes the currently registered onEmail callback. Subsequent
     * button clicks have no effect (or get buffered, see above).
     */
    unregisterOnEmail(): void;
}

declare global {
    interface Window {
        /**
         * Bridge API injected by the projektXD Thunderbird add-on.
         * `undefined` when the page is NOT running inside Thunderbird
         * with the add-on installed.
         */
        projektxd_tb?: ProjektXDTbBridge;
    }
}
```

## Example: receive an email and create a ticket

```ts
if (window.projektxd_tb) {
    console.log('Bridge API v' + window.projektxd_tb.version);

    window.projektxd_tb.registerOnEmail(async (eml, meta) => {
        console.log('Mail from', meta.from.email, '— subject:', meta.subject);

        const form = new FormData();
        form.append('subject', meta.subject);
        form.append('from_name', meta.from.name);
        form.append('from_email', meta.from.email);
        form.append('message_id', meta.messageId);
        form.append('date', meta.date);
        form.append('eml', eml, (meta.messageId || 'mail') + '.eml');

        const res = await fetch('/api/tickets', { method: 'POST', body: form });

        if (!res.ok) {
            console.error('Ticket creation failed:', res.status);
        }
    });
}
```

## Example: send a draft to Thunderbird

```ts
async function openInThunderbird(emlBlob: Blob): Promise<void> {
    if (!window.projektxd_tb) {
        throw new Error('projektXD Thunderbird add-on not available');
    }

    await window.projektxd_tb.openCompose(emlBlob);
}
```

## Behavior notes & caveats

- **Origin restriction**: the API is only injected on the projektXD origin configured in the add-on preferences. Other origins never see `window.projektxd_tb`. This is a security boundary — any site could otherwise read the user's mail.
- **Page reload**: all registered callbacks are lost on navigation/reload. Re-register on every page load.
- **Callback errors**: throw freely inside the callback — the add-on catches and logs but does not propagate. Use your own error reporting if you need it.
- **EML payload**: the `eml` Blob is the *original, unmodified* MIME source as Thunderbird stores it, including all attachments. projektXD is responsible for any MIME parsing beyond the convenience fields in `meta`.
- **Metadata scope (v1)**: `meta` intentionally carries only `subject`, `from`, `date` and `messageId`. Everything else (body, attachments, full headers) lives in the `eml` Blob — parse it if you need it. Additional convenience fields may be added in a backwards-compatible way later.
- **Login state**: for the onEmail flow, the add-on checks the login status before delivering the event and, if configured, performs auto-login first. projektXD does not need to handle the unauthenticated case for this flow.
- **Compose flow**: `openCompose` always creates a draft in the first account's Drafts folder. Per-account selection is planned as a future preference.
- **Buffering**: at most ONE pending onEmail event is buffered while the page loads / registers the callback. Older events are discarded.

## Version

This document describes bridge API **v1.0.0**, shipping with the projektXD Thunderbird add-on starting from version **2.1.0** (target).
