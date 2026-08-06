import {ThunderbirdBrowser} from 'mozilla-webext-types';
import {BridgeResponse, EmailMetaMin, OnEmailMsg, OpenMessageMsg} from '../../inc/Types/bridge';

declare const browser: ThunderbirdBrowser;

/**
 * Bridge content script — injected (isolated world) only on the configured
 * projektXD origin. It exposes `window.projektxd_tb` to the page using the
 * Gecko helpers `exportFunction` / `cloneInto` / `window.wrappedJSObject`, so
 * the page can:
 *
 *  - `openMessage(emlBlob)` — open an EML read-only in Thunderbird.
 *  - `openCompose(emlBlob)` — deprecated alias for `openMessage`.
 *  - `registerOnEmail(cb)`  — receive emails the user picks in Thunderbird.
 *  - `unregisterOnEmail()`  — stop receiving.
 *
 * See `doc/browser-api.md` for the public contract.
 */

const API_VERSION = '1.1.0';
const BUFFER_MS = 10000;

console.log('projektxd_tb: bridge content script loaded');

/** The page's Blob/Promise/Error constructors live on the unwrapped window. */
const pageWindow: any = window.wrappedJSObject;

/** Currently registered page callback (a page-compartment function), or null. */
let registeredCb: any = null;

/** At most one buffered onEmail event, kept for BUFFER_MS if no callback yet. */
let pendingEvent: { eml: ArrayBuffer; contentType: string; meta: EmailMetaMin } | null = null;
let pendingTimer: any = 0;

/**
 * Create a Promise that lives in the page compartment, driven by async `work`.
 * Resolving/rejecting a page-scope promise is required so the page can `await`
 * the result of an exported function.
 */
function pagePromise(work: () => Promise<void>): any {
    return new pageWindow.Promise(exportFunction((resolve: any, reject: any): void => {
        work().then(
            (): void => resolve(),
            (err: any): void => reject(new pageWindow.Error(errorMessage(err)))
        );
    }, pageWindow));
}

function errorMessage(err: any): string {
    if (err && typeof err.message === 'string') {
        return err.message;
    }

    return String(err);
}

/**
 * Implementation of `window.projektxd_tb.openMessage(emlBlob)`.
 * Runs in the isolated world; `emlBlob` is an Xray wrapper of the page Blob.
 */
function openMessageImpl(emlBlob: Blob): any {
    return pagePromise(async(): Promise<void> => {
        const buffer = await emlBlob.arrayBuffer();

        const msg: OpenMessageMsg = {
            type: 'openMessage',
            eml: buffer,
            contentType: emlBlob.type || 'message/rfc822'
        };

        const resp = await browser.runtime.sendMessage(msg) as BridgeResponse | undefined;

        if (!resp || !resp.ok) {
            throw new Error(resp && resp.error ? resp.error : 'openMessage failed');
        }
    });
}

/** Whether the deprecation warning for `openCompose` has already been logged. */
let openComposeWarned = false;

/**
 * Deprecated alias of {@link openMessageImpl}. Kept until the projektXD page
 * migrates to `openMessage`; behaves identically (read-only preview).
 */
function openComposeImpl(emlBlob: Blob): any {
    if (!openComposeWarned) {
        openComposeWarned = true;
        console.warn('projektxd_tb: openCompose() is deprecated and now opens the email read-only — use openMessage() instead.');
    }

    return openMessageImpl(emlBlob);
}

/**
 * Implementation of `window.projektxd_tb.registerOnEmail(cb)`.
 */
function registerOnEmailImpl(cb: any): void {
    registeredCb = cb;

    if (pendingEvent) {
        const event = pendingEvent;
        clearPending();
        deliver(event.eml, event.contentType, event.meta);
    }
}

/**
 * Implementation of `window.projektxd_tb.unregisterOnEmail()`.
 */
function unregisterOnEmailImpl(): void {
    registeredCb = null;
}

/**
 * Deliver an email to the page callback, or buffer it if none is registered.
 */
function deliver(eml: ArrayBuffer, contentType: string, meta: EmailMetaMin): void {
    if (!registeredCb) {
        bufferEvent(eml, contentType, meta);
        return;
    }

    try {
        // Build page-compartment values so the page callback can use them freely.
        const pageBuffer = cloneInto(eml, pageWindow);
        const blob = new pageWindow.Blob(
            cloneInto([pageBuffer], pageWindow),
            cloneInto({type: contentType || 'message/rfc822'}, pageWindow)
        );
        const pageMeta = cloneInto(meta, pageWindow);

        registeredCb(blob, pageMeta);
    } catch (e) {
        console.error('projektxd_tb: onEmail callback threw', e);
    }
}

/**
 * Buffer a single onEmail event (dropping any older one) for BUFFER_MS.
 */
function bufferEvent(eml: ArrayBuffer, contentType: string, meta: EmailMetaMin): void {
    clearPending();
    pendingEvent = {eml, contentType, meta};
    pendingTimer = setTimeout((): void => {
        pendingEvent = null;
        pendingTimer = 0;
    }, BUFFER_MS);
}

function clearPending(): void {
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = 0;
    }

    pendingEvent = null;
}

/**
 * Receive onEmail deliveries from the background script.
 */
browser.runtime.onMessage.addListener((message: object): void => {
    const msg = message as Partial<OnEmailMsg>;

    if (msg && msg.type === 'onEmail' && msg.eml) {
        deliver(msg.eml, msg.contentType ?? 'message/rfc822', msg.meta as EmailMetaMin);
    }
});

/**
 * Build the `window.projektxd_tb` object in the page compartment and attach it.
 */
function installBridge(): void {
    const api: any = cloneInto({}, pageWindow);

    api.version = API_VERSION;
    exportFunction(openMessageImpl, api, {defineAs: 'openMessage'});
    exportFunction(openComposeImpl, api, {defineAs: 'openCompose'});
    exportFunction(registerOnEmailImpl, api, {defineAs: 'registerOnEmail'});
    exportFunction(unregisterOnEmailImpl, api, {defineAs: 'unregisterOnEmail'});

    pageWindow.projektxd_tb = api;
    console.log('projektxd_tb: bridge API v' + API_VERSION + ' installed');
}

installBridge();
