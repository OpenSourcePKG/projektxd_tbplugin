/**
 * Shared types for the page↔Thunderbird bridge (`window.projektxd_tb`).
 *
 * The bridge is implemented by the content script `content/scripts/api.ts`
 * (page side) and `background.ts` (Thunderbird side). These types describe the
 * public API surface and the internal message protocol exchanged between them.
 */

/**
 * Email address with an optional display name.
 */
export type EmailAddress = {
    /** Display name, e.g. "Jane Doe". Empty string if not present. */
    name: string;
    /** Bare email address, e.g. "jane@example.com". */
    email: string;
};

/**
 * Minimal, cheaply-available metadata for an email, handed to the onEmail
 * callback alongside the raw EML. Derived from `messages.get` — no MIME parsing.
 */
export type EmailMetaMin = {
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
 * Message sent from the bridge content script to the background when the page
 * calls `openMessage(emlBlob)`. The EML travels as an ArrayBuffer because it
 * survives structured clone across the content↔background boundary reliably.
 *
 * `type` is `'openMessage'` for the current API and `'openCompose'` for the
 * deprecated alias — both are handled identically (read-only preview).
 */
export type OpenMessageMsg = {
    type: 'openMessage' | 'openCompose';
    eml: ArrayBuffer;
    contentType: string;
};

/**
 * @deprecated Use {@link OpenMessageMsg}. Kept as an alias until the projektXD
 * page migrates from `openCompose` to `openMessage`.
 */
export type OpenComposeMsg = OpenMessageMsg;

/**
 * Message sent from the background to the bridge content script to deliver an
 * email the user picked in Thunderbird (message_display_action button click).
 */
export type OnEmailMsg = {
    type: 'onEmail';
    eml: ArrayBuffer;
    contentType: string;
    meta: EmailMetaMin;
};

/**
 * Generic response for request/response messages (e.g. openMessage).
 */
export type BridgeResponse = {
    ok: boolean;
    error?: string;
};
