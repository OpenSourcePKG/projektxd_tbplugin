<h1 align="center">projektXD ↔ Thunderbird — Integration Guide</h1>

How to make the projektXD web app work together with the projektXD Thunderbird
add-on. This is the **implementation guide for the projektXD side** (frontend +
backend). For the exact API surface, see the reference in
[`browser-api.md`](browser-api.md).

Bridge API version: **v1.0.0** (ships with add-on **2.1.0+**, Thunderbird 140 ESR).

---

## What you are integrating with

When projektXD is opened inside Thunderbird through the add-on, the add-on
injects a bridge object at `window.projektxd_tb` **only on the projektXD origin
configured in the add-on preferences**. On any other site it is `undefined`.

Two flows:

1. **Email → ticket** — the user clicks the **"Als projektXD-Ticket"** button in
   an opened email; the add-on invokes a callback you registered, passing the raw
   EML and a little metadata. You create a ticket and attach the email.
2. **EML → Thunderbird** — projektXD hands an EML blob to the add-on, which opens
   a Thunderbird compose window pre-filled from it (as a draft).

The add-on already handles login (auto-login if configured) before delivering an
email, so projektXD does not need to handle the unauthenticated case for flow 1.

---

## Step 0 — Prerequisites

- The user runs **Thunderbird 140 ESR+** with the **projektXD add-on 2.1.0+**
  installed and its URL configured to your projektXD origin.
- Everything below is **progressive enhancement**: in a normal browser
  `window.projektxd_tb` is absent and projektXD must keep working unchanged.

Always feature-detect:

```ts
if (window.projektxd_tb) {
    // Running inside Thunderbird with the add-on — enable integration.
} else {
    // Plain browser — hide the Thunderbird-specific UI.
}
```

The bridge is present from `DOMContentLoaded` onwards.

---

## Step 1 — A drop-in integration helper (recommended)

Wrap the bridge once so the rest of your app never touches `window.projektxd_tb`
directly. Type the bridge yourself (the add-on does not ship types):

```ts
// projektxd-thunderbird.ts
export interface TbEmailMeta {
    subject: string;
    from: { name: string; email: string };
    date: string;        // ISO-8601
    messageId: string;   // without angle brackets
}

interface ProjektxdTbBridge {
    readonly version: string;
    openCompose(eml: Blob): Promise<void>;
    registerOnEmail(cb: (eml: Blob, meta: TbEmailMeta) => void | Promise<void>): void;
    unregisterOnEmail(): void;
}

declare global {
    interface Window { projektxd_tb?: ProjektxdTbBridge; }
}

export const Thunderbird = {
    /** True when running inside Thunderbird with the add-on. */
    isAvailable(): boolean {
        return typeof window.projektxd_tb !== 'undefined';
    },

    version(): string | null {
        return window.projektxd_tb?.version ?? null;
    },

    /** Register the email handler. Safe to call when unavailable (no-op). */
    onEmail(handler: (eml: Blob, meta: TbEmailMeta) => void | Promise<void>): void {
        window.projektxd_tb?.registerOnEmail(handler);
    },

    offEmail(): void {
        window.projektxd_tb?.unregisterOnEmail();
    },

    /** Open an EML in a Thunderbird compose window. Rejects if unavailable. */
    async openInThunderbird(eml: Blob): Promise<void> {
        if (!window.projektxd_tb) {
            throw new Error('projektXD Thunderbird add-on not available');
        }
        await window.projektxd_tb.openCompose(eml);
    }
};
```

---

## Step 2 — Flow 1: create a ticket from an email

### 2a. Frontend — register the handler on every page load

The callback is **lost on every navigation/reload**, so register it early during
app bootstrap, guarded by feature detection. Only one handler is active; calling
`registerOnEmail` again replaces it.

```ts
import { Thunderbird, TbEmailMeta } from './projektxd-thunderbird';

function initThunderbirdIntegration(): void {
    if (!Thunderbird.isAvailable()) {
        return;
    }
    console.info('projektXD bridge v' + Thunderbird.version());

    Thunderbird.onEmail(async (eml: Blob, meta: TbEmailMeta) => {
        try {
            await createTicketFromEmail(eml, meta);
            // e.g. route the SPA to the new ticket, show a toast, …
        } catch (err) {
            // The add-on swallows thrown errors — do your own reporting here.
            console.error('ticket creation failed', err);
            showError('Ticket konnte nicht erstellt werden.');
        }
    });
}

// Register as early as possible (DOMContentLoaded or your framework's bootstrap).
document.addEventListener('DOMContentLoaded', initThunderbirdIntegration);
```

> **Buffering:** if the user clicks the button before you register, the add-on
> buffers **one** event for **10 seconds**. Registering during bootstrap is well
> within that window. Older events are dropped.

### 2b. Frontend — upload the EML to your backend

`eml` is the complete, original `message/rfc822` source (all MIME parts and
attachments included). Upload it as-is; parse it on the server if you need more
than the convenience `meta` fields.

```ts
async function createTicketFromEmail(eml: Blob, meta: TbEmailMeta): Promise<void> {
    const form = new FormData();
    form.append('subject', meta.subject);
    form.append('from_name', meta.from.name);
    form.append('from_email', meta.from.email);
    form.append('message_id', meta.messageId);
    form.append('date', meta.date);
    form.append('eml', eml, (meta.messageId || 'mail') + '.eml');

    const res = await fetch('/backend/main/TicketCreateFromMail', {
        method: 'POST',
        credentials: 'include',
        body: form
    });
    if (!res.ok) {
        throw new Error('HTTP ' + res.status);
    }
}
```

### 2c. Backend — the endpoint you must provide

Implement an authenticated endpoint (session cookie, `credentials: 'include'`)
that accepts the upload and:

1. Validates the session (same auth as the rest of `backend/main/*`).
2. Stores the raw `.eml` as an attachment on the new/target ticket.
3. Optionally parses the EML for the ticket body, sender, attachments, etc.
   (`meta` is only a convenience; the EML is the source of truth.)
4. Returns the created ticket id / URL as JSON.

| Field         | Type   | Notes                                   |
|---------------|--------|-----------------------------------------|
| `eml`         | file   | `message/rfc822`, the full email        |
| `subject`     | string | decoded Subject                         |
| `from_name`   | string | sender display name (may be empty)      |
| `from_email`  | string | sender address                          |
| `message_id`  | string | RFC Message-ID (no angle brackets)      |
| `date`        | string | ISO-8601 send date                      |

Adapt the path/fields to your backend conventions — the values above match the
frontend snippet.

---

## Step 3 — Flow 2: open an EML in Thunderbird

Use this where projektXD holds an email as an EML — e.g. an **"In Thunderbird
öffnen"** action on an `.eml` attachment of a ticket. `openCompose` imports the
EML as a draft in the account's Drafts folder and opens a compose window on it.

```ts
import { Thunderbird } from './projektxd-thunderbird';

// Show the button only inside Thunderbird.
if (Thunderbird.isAvailable()) {
    showOpenInThunderbirdButton();
}

async function onOpenInThunderbird(attachmentUrl: string): Promise<void> {
    // 1. Fetch the EML bytes as a Blob (from your ticket/attachment API).
    const res = await fetch(attachmentUrl, { credentials: 'include' });
    if (!res.ok) {
        throw new Error('download failed: HTTP ' + res.status);
    }
    const eml = new Blob([await res.arrayBuffer()], { type: 'message/rfc822' });

    // 2. Hand it to Thunderbird.
    try {
        await Thunderbird.openInThunderbird(eml);
    } catch (err) {
        console.error('openCompose failed', err);
        showError('Konnte in Thunderbird nicht geöffnet werden.');
    }
}
```

`openCompose` resolves once the compose window is open, and **rejects** on an
invalid EML or when no Drafts folder is available — always handle the rejection.

---

## Step 4 — Robustness checklist

- [ ] **Feature-detect** before showing any Thunderbird-only UI; never assume the
      bridge exists.
- [ ] **Re-register `onEmail` on every page load** (SPA route changes that do a
      full reload lose the callback).
- [ ] **Report your own errors** — thrown errors inside the `onEmail` callback are
      caught and logged by the add-on, not surfaced to the user.
- [ ] **Treat `eml` as the source of truth**; `meta` carries only
      `subject`/`from`/`date`/`messageId`. Parse the EML server-side for anything
      more (body, attachments, full headers).
- [ ] **Version-gate** new behaviour with `Thunderbird.version()` if you later
      depend on a newer bridge API.
- [ ] Keep the app fully functional when `window.projektxd_tb` is `undefined`.

---

## Step 5 — Test checklist

1. Open projektXD in a normal browser → `window.projektxd_tb` is `undefined`,
   app works unchanged, no Thunderbird UI shown.
2. Open projektXD inside Thunderbird (add-on 2.1.0+, URL configured) →
   `window.projektxd_tb` is set; `console` shows the bridge version.
3. Open an email in Thunderbird → click **"Als projektXD-Ticket"** → your
   `onEmail` handler fires; a ticket is created with the `.eml` attached.
4. Click the button **before** projektXD finished loading → the event is still
   delivered once you register (within 10 s).
5. Click **"In Thunderbird öffnen"** on an `.eml` attachment → a Thunderbird
   compose window opens pre-filled from the email.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `window.projektxd_tb` is `undefined` inside Thunderbird | The add-on URL does not match the page origin. Set it to the exact projektXD origin in the add-on preferences. |
| `onEmail` never fires | Registered too late / lost on a reload — register during bootstrap on every load. Also confirm the user is logged in (the add-on auto-logs-in only if enabled). |
| `openCompose` rejects | Invalid EML, or no Drafts folder on the account. Ensure the blob is the raw `message/rfc822` source and the account has a Drafts folder. |
| Ticket has no email | Your backend endpoint did not store the uploaded `eml` file. |

See [`browser-api.md`](browser-api.md) for the full API contract and edge cases.
