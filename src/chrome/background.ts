import {Settings} from './inc/Settings';
import {Debug} from './inc/Utils/Debug';
import {ThunderbirdBrowser} from 'mozilla-webext-types';
import {ProjektXDOptions} from './inc/Types/projektXDOptions';
import {ProjektXDApi} from './inc/Api/projektXDApi';
import {DisplayEml} from './inc/Mail/DisplayEml';
import {DisplayedEmail} from './inc/Mail/DisplayedEmail';
import {BridgeResponse, OnEmailMsg, OpenMessageMsg} from './inc/Types/bridge';

declare const browser: ThunderbirdBrowser;

/** Id of the dynamically registered bridge content script. */
const BRIDGE_SCRIPT_ID = 'projektxd-bridge';

/** Id of the dynamically registered favicon content script. */
const FAVICON_SCRIPT_ID = 'projektxd-favicon';

/** Stable name of the projektXD entry in Thunderbird's spaces toolbar. */
const SPACE_NAME = 'projektxd';

/** Cached origin / autologin flag, kept in sync with the stored options. */
let cfgOrigin: string | null = null;
let cfgAutologin = false;

/** Full URL of the bundled options page (used for the "not configured" hint). */
let optionsPageUrl: string | null = null;

/** Tabs whose projektXD session we already tried to auto-login this visit. */
const loggedInTabs = new Set<number>();

function originFromUrl(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch (_e) {
        return null;
    }
}

function errorMessage(err: any): string {
    if (err && typeof err.message === 'string') {
        return err.message;
    }

    return String(err);
}

/**
 * Find the first open tab whose URL belongs to the given origin.
 *
 * @param {string} origin
 * @returns {Promise<number | null>} tab id or null if none is open
 */
async function findTabByOrigin(origin: string): Promise<number | null> {
    const queryTabs = await browser.tabs.query({});

    for (const tab of queryTabs) {
        if (tab.url && tab.url.startsWith(origin) && tab.id) {
            return tab.id;
        }
    }

    return null;
}

/**
 * Resolve once the tab is fully loaded and shows the configured origin. Works
 * both for freshly opened tabs (waits for the "complete" event) and for tabs
 * that are already loaded — e.g. restored on Thunderbird startup, where no
 * navigation event fires anymore.
 *
 * On freshly created tabs "complete" would otherwise already fire for the
 * initial about:blank page, where the extension has no access even with
 * <all_urls> — hence the extra origin check.
 *
 * @param {number} tid
 * @param {string} origin
 * @returns {Promise<void>}
 */
function whenTabReady(tid: number, origin: string): Promise<void> {
    return new Promise((resolve: () => void): void => {
        const onUpdated = (updatedId: number, info: any, tab: any): void => {
            if (updatedId !== tid) {
                return;
            }
            if (info.status !== 'complete') {
                return;
            }
            if (!tab || typeof tab.url !== 'string' || !tab.url.startsWith(origin)) {
                return;
            }
            browser.tabs.onUpdated.removeListener(onUpdated);
            resolve();
        };

        browser.tabs.onUpdated.addListener(onUpdated);

        browser.tabs.get(tid).then((current: any): void => {
            if (current.status === 'complete' && typeof current.url === 'string' && current.url.startsWith(origin)) {
                browser.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        }).catch((e: any): void => {
            console.error('projektXD: tabs.get failed:', e);
        });
    });
}

/**
 * Inject the content login script into the tab and hand it the credentials.
 * The content script decides on its own whether a login is actually needed.
 *
 * @param {number} tid
 * @param {ProjektXDOptions} options
 */
async function injectAndLogin(tid: number, options: ProjektXDOptions): Promise<void> {
    try {
        const tab = await browser.tabs.get(tid);
        const all = await browser.permissions.getAll();
        console.log('projektXD: about to inject — tab.url=', tab.url, 'granted=', JSON.stringify(all));

        // @ts-ignore — MV3-API, in mozilla-webext-types nicht typisiert
        await browser.scripting.executeScript({
            target: {tabId: tid},
            files: ['chrome/content/scripts/login.js']
        });
        await browser.tabs.sendMessage(tid, options);
    } catch (e) {
        console.error('projektXD: auto-login injection failed:', e);
        console.error('projektXD: hint — open the options page and click "Aktivieren" to grant host access.');
    }
}

/**
 * Trigger the auto-login as soon as the tab is fully loaded and shows the
 * configured origin.
 *
 * @param {number} tid
 * @param {string} origin
 * @param {ProjektXDOptions} options
 */
function loginWhenReady(tid: number, origin: string, options: ProjektXDOptions): void {
    void whenTabReady(tid, origin).then((): Promise<void> => injectAndLogin(tid, options));
}

/**
 * Ensure a projektXD tab is open, active and loaded. Reuses an existing tab or
 * opens a new one.
 *
 * @param {ProjektXDOptions} options
 * @param {string} origin
 * @returns {Promise<number | null>} the ready tab id, or null on failure
 */
async function ensureProjektXDTab(options: ProjektXDOptions, origin: string): Promise<number | null> {
    let tabId = await findTabByOrigin(origin);

    if (tabId !== null) {
        await browser.tabs.update(tabId, {active: true});
    } else {
        const created = await browser.tabs.create({active: true, url: options.url});

        if (!created || !created.id) {
            return null;
        }

        tabId = created.id;
    }

    await whenTabReady(tabId, origin);

    return tabId;
}

/**
 * Ensure the user is logged in to projektXD. Uses the same init-check /
 * auto-login as the content login flow, but from the background context.
 *
 * @param {ProjektXDOptions} options
 * @returns {Promise<boolean>} whether the session is logged in afterwards
 */
async function ensureLoggedIn(options: ProjektXDOptions): Promise<boolean> {
    const isLoggedIn = await ProjektXDApi.loadInit(options.url);

    if (isLoggedIn === true) {
        return true;
    }

    if (options.autologin && options.username) {
        return ProjektXDApi.login(options.url, options.username, options.password);
    }

    return false;
}

/**
 * Show a basic notification, using localized title/body message keys.
 */
async function notify(titleKey: string, bodyKey: string): Promise<void> {
    try {
        // @ts-ignore — runtime.getURL not typed in mozilla-webext-types
        const iconUrl: string = browser.runtime.getURL('chrome/content/images/projektxd.png');

        await browser.notifications.create('projektxd-notice', {
            type: 'basic',
            title: browser.i18n.getMessage(titleKey),
            message: browser.i18n.getMessage(bodyKey),
            iconUrl
        });
    } catch (e) {
        console.error('projektXD: notify failed:', e);
    }
}

/**
 * (Re-)register the projektXD-origin content scripts for the configured origin
 * only: the bridge (`api.js`, which limits `window.projektxd_tb` to projektXD)
 * and the favicon injector (`favicon.js`, which puts the add-on icon on the
 * instance tab).
 *
 * @param {string} origin
 */
async function registerBridge(origin: string): Promise<void> {
    try {
        // @ts-ignore — scripting.unregisterContentScripts not fully typed
        await browser.scripting.unregisterContentScripts({ids: [BRIDGE_SCRIPT_ID, FAVICON_SCRIPT_ID]});
    } catch (_e) {
        // not registered yet — ignore
    }

    try {
        // @ts-ignore — scripting.registerContentScripts not fully typed
        await browser.scripting.registerContentScripts([
            {
                id: BRIDGE_SCRIPT_ID,
                js: ['chrome/content/scripts/api.js'],
                matches: [`${origin}/*`],
                runAt: 'document_start',
                persistAcrossSessions: false
            },
            {
                id: FAVICON_SCRIPT_ID,
                js: ['chrome/content/scripts/favicon.js'],
                matches: [`${origin}/*`],
                runAt: 'document_start',
                persistAcrossSessions: false
            }
        ]);

        if (Debug.is()) {
            console.log('projektXD::background: content scripts registered for', origin);
        }
    } catch (e) {
        console.error('projektXD: registerBridge failed:', e);
    }
}

/**
 * Inject the favicon script into already-open projektXD tabs, so the icon
 * appears immediately — without reloading the tab (which would lose the user's
 * place). Needed after startup (restored tabs) and after (re-)registration,
 * since dynamically registered content scripts only apply to future loads.
 */
async function injectFaviconIntoOpenTabs(): Promise<void> {
    if (!cfgOrigin) {
        return;
    }

    let tabs: any[];

    try {
        tabs = await browser.tabs.query({});
    } catch (e) {
        console.error('projektXD: tabs.query failed:', e);
        return;
    }

    for (const tab of tabs) {
        if (!tab || typeof tab.id !== 'number' || typeof tab.url !== 'string' || !tab.url.startsWith(cfgOrigin)) {
            continue;
        }

        try {
            // @ts-ignore — scripting.executeScript not typed in mozilla-webext-types
            await browser.scripting.executeScript({
                target: {tabId: tab.id},
                files: ['chrome/content/scripts/favicon.js']
            });
        } catch (e) {
            console.error('projektXD: favicon injection failed for tab', tab.id, e);
        }
    }
}

/**
 * Read the current options and (re-)register the bridge for their origin.
 */
async function refreshBridge(): Promise<void> {
    const options = await new Settings().get();

    if (!options.url) {
        return;
    }

    const origin = originFromUrl(options.url);

    if (!origin) {
        return;
    }

    await registerBridge(origin);
}

/**
 * Re-read the stored options into the origin/autologin cache used by the
 * tab-update auto-login listener.
 *
 * @returns {Promise<ProjektXDOptions>} the freshly read options
 */
async function reloadConfig(): Promise<ProjektXDOptions> {
    const options = await new Settings().get();

    cfgOrigin = options.url ? originFromUrl(options.url) : null;
    cfgAutologin = Boolean(options.autologin);

    return options;
}

/**
 * Create — or update — the projektXD entry in Thunderbird's spaces toolbar
 * (the vertical app bar on the left, next to Mail/Contacts/Calendar). Clicking
 * it opens the configured projektXD instance in a tab; the auto-login is then
 * triggered by `onTabUpdated` once that tab has loaded. Falls back to the
 * options page while no instance URL is configured yet.
 *
 * @param {ProjektXDOptions} options
 */
async function ensureSpace(options: ProjektXDOptions): Promise<void> {
    // @ts-ignore — runtime.getURL not typed in mozilla-webext-types
    const optionsUrl: string = browser.runtime.getURL('chrome/content/ui/options.html');
    const defaultUrl = options.url && originFromUrl(options.url) ? options.url : optionsUrl;

    const buttonProperties = {
        title: browser.i18n.getMessage('extensionName'),
        defaultIcons: 'chrome/content/images/projektXD-symbolic.svg'
    };

    try {
        const existing = await browser.spaces.query({name: SPACE_NAME});

        if (existing && existing.length > 0) {
            await browser.spaces.update(SPACE_NAME, defaultUrl, buttonProperties);
        } else {
            await browser.spaces.create(SPACE_NAME, defaultUrl, buttonProperties);
        }
    } catch (e) {
        console.error('projektXD: ensureSpace failed:', e);
    }
}

/**
 * Auto-login hook: whenever a tab finishes loading the configured projektXD
 * origin, inject the login script once per visit. This replaces the former
 * toolbar-click trigger, since spaces-toolbar buttons expose no onClicked
 * event — opening the space loads the tab, which we pick up here.
 *
 * @param {number} tabId
 * @param {any} changeInfo
 * @param {any} tab
 */
async function onTabUpdated(tabId: number, changeInfo: any, tab: any): Promise<void> {
    if (changeInfo.status !== 'complete') {
        return;
    }

    const onOrigin = Boolean(
        cfgOrigin && tab && typeof tab.url === 'string' && tab.url.startsWith(cfgOrigin)
    );

    if (!onOrigin) {
        // Left the projektXD origin — allow a fresh auto-login on the next visit.
        loggedInTabs.delete(tabId);
        return;
    }

    if (!cfgAutologin || loggedInTabs.has(tabId)) {
        return;
    }

    loggedInTabs.add(tabId);

    const options = await new Settings().get();
    await injectAndLogin(tabId, options);
}

/**
 * Re-auth hook: when the user activates (clicks the space / switches to) an
 * already-loaded projektXD tab, re-check the session from the background and
 * silently log in again if it has expired — then reload so the page picks up
 * the fresh session. Uses the background fetch API (credentials: 'include'),
 * so it does not accumulate content scripts across repeated activations.
 *
 * @param {number} tabId
 */
async function reauthActiveTab(tabId: number): Promise<void> {
    if (!cfgAutologin || !cfgOrigin) {
        return;
    }

    let tab: any;

    try {
        tab = await browser.tabs.get(tabId);
    } catch (_e) {
        return;
    }

    if (!tab || tab.status !== 'complete' || typeof tab.url !== 'string' || !tab.url.startsWith(cfgOrigin)) {
        return;
    }

    const options = await new Settings().get();

    if (!options.url || !options.autologin || !options.username) {
        return;
    }

    const isLoggedIn = await ProjektXDApi.loadInit(options.url);

    if (isLoggedIn !== false) {
        // true = still logged in, null = check failed — nothing to do.
        return;
    }

    const success = await ProjektXDApi.login(options.url, options.username, options.password);

    if (success) {
        try {
            await browser.tabs.reload(tabId);
        } catch (e) {
            console.error('projektXD: reload after re-auth failed:', e);
        }
    }
}

/**
 * When the spaces button is used while no instance URL is configured, it opens
 * the options page instead. Show a notification there that points the user to
 * the settings, so it is obvious what to do next.
 *
 * @param {any} tab the tab that just finished loading
 */
async function maybeNotifyUnconfigured(tab: any): Promise<void> {
    if (cfgOrigin || !optionsPageUrl) {
        // URL already configured (or options URL unknown) — no hint needed.
        return;
    }

    if (!tab || typeof tab.url !== 'string' || !tab.url.startsWith(optionsPageUrl)) {
        return;
    }

    await notify('notifyNoUrlTitle', 'notifyNoUrlBody');
}

/**
 * Handle an `openMessage` (or deprecated `openCompose`) request coming from the
 * bridge content script: open the EML read-only, as if opened from disk.
 *
 * @param {OpenMessageMsg} msg
 * @returns {Promise<BridgeResponse>}
 */
async function handleOpenMessage(msg: OpenMessageMsg): Promise<BridgeResponse> {
    try {
        await DisplayEml.openFromEml(msg.eml, msg.contentType);
        return {ok: true};
    } catch (e) {
        console.error('projektXD: openMessage failed:', e);
        return {ok: false, error: errorMessage(e)};
    }
}

/**
 * Handle a click on the "projektXD" button in an opened email: read the mail,
 * make sure the projektXD tab is open and logged in, then deliver the EML to
 * the page's registered onEmail callback.
 *
 * @param {any} tab the message-display tab from messageDisplayAction.onClicked
 */
async function handleTicketFromEmail(tab: any): Promise<void> {
    if (!tab || typeof tab.id !== 'number') {
        return;
    }

    const options = await new Settings().get();

    if (!options.url) {
        await notify('notifyNoUrlTitle', 'notifyNoUrlBody');
        return;
    }

    const origin = originFromUrl(options.url);

    if (!origin) {
        await notify('notifyNoUrlTitle', 'notifyNoUrlBody');
        return;
    }

    let email;

    try {
        email = await DisplayedEmail.fromTab(tab.id);
    } catch (e) {
        console.error('projektXD: could not read displayed email:', e);
        return;
    }

    if (!email) {
        console.warn('projektXD: no message displayed in tab', tab.id);
        return;
    }

    const tabId = await ensureProjektXDTab(options, origin);

    if (tabId === null) {
        console.error('projektXD: could not open projektXD tab');
        return;
    }

    const loggedIn = await ensureLoggedIn(options);

    if (!loggedIn) {
        await notify('notifyLoginRequiredTitle', 'notifyLoginRequiredBody');
    }

    const message: OnEmailMsg = {
        type: 'onEmail',
        eml: email.eml,
        contentType: email.contentType,
        meta: email.meta
    };

    try {
        await browser.tabs.sendMessage(tabId, message);
    } catch (e) {
        console.error('projektXD: delivering onEmail failed:', e);
    }
}

/**
 * After the options changed, bring already-open tabs in line with the new
 * configuration without requiring a Thunderbird restart:
 *
 *  - Any tab already on the projektXD origin is reloaded, so the freshly
 *    (re-)registered bridge content script runs there. This is what makes the
 *    tab favicon and the page API appear immediately instead of only after a
 *    restart.
 *  - The spaces button's options tab is sent straight to the instance once the
 *    add-on is fully configured for silent login (url + username + password +
 *    autologin). That logs the user in and turns the spaces tab into the
 *    instance tab, so clicking the spaces button no longer re-opens settings.
 *    The gate avoids navigating away while the form is still being filled —
 *    fields only save on blur, so all four are present only once the user is
 *    done.
 *
 * @param {ProjektXDOptions} options
 */
async function reconcileTabsAfterConfig(options: ProjektXDOptions): Promise<void> {
    if (!options.url || !cfgOrigin) {
        return;
    }

    const readyForLogin = Boolean(options.autologin && options.username && options.password);

    let tabs: any[];

    try {
        tabs = await browser.tabs.query({});
    } catch (e) {
        console.error('projektXD: tabs.query failed:', e);
        return;
    }

    for (const tab of tabs) {
        if (!tab || typeof tab.id !== 'number' || typeof tab.url !== 'string') {
            continue;
        }

        if (optionsPageUrl && tab.url.startsWith(optionsPageUrl)) {
            if (readyForLogin) {
                try {
                    await browser.tabs.update(tab.id, {url: options.url});
                } catch (e) {
                    console.error('projektXD: promoting options tab failed:', e);
                }
            }
        } else if (tab.url.startsWith(cfgOrigin)) {
            try {
                await browser.tabs.reload(tab.id);
            } catch (e) {
                console.error('projektXD: reloading origin tab failed:', e);
            }
        }
    }
}

/**
 * Handle a change to the stored options. Ordered so the bridge is registered
 * for the (possibly new) origin *before* any tab is (re)loaded — otherwise the
 * content script would not apply to those loads.
 */
async function applyConfigChange(): Promise<void> {
    const options = await reloadConfig();
    await refreshBridge();
    await ensureSpace(options);
    await reconcileTabsAfterConfig(options);
}

if (typeof browser === 'undefined') {
    console.error('projektXD::background: browser object is not defined!');
} else {
    if (Debug.is()) {
        console.log('projektXD::background: init');
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Spaces-Toolbar (linke App-Leiste): projektXD-Eintrag anlegen/aktualisieren.
    // Der Button hat kein onClicked — Thunderbird öffnet beim Klick den Tab mit
    // der konfigurierten URL; der Auto-Login läuft dann über tabs.onUpdated.

    // @ts-ignore — runtime.getURL not typed in mozilla-webext-types
    optionsPageUrl = browser.runtime.getURL('chrome/content/ui/options.html');

    void reloadConfig().then(async(options): Promise<void> => {
        await ensureSpace(options);
        await injectFaviconIntoOpenTabs();
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Tab lädt projektXD → Auto-Login (Ersatz für den früheren Toolbar-Klick).
    // Lädt der Button mangels URL die Optionsseite, wird dort ein Hinweis gezeigt.

    browser.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any): void => {
        void onTabUpdated(tabId, changeInfo, tab);

        if (changeInfo.status === 'complete') {
            void maybeNotifyUnconfigured(tab);
        }
    });

    // Space-Klick / Tab-Wechsel auf einen bereits offenen projektXD-Tab →
    // Session erneut prüfen und ggf. wieder einloggen ("jeder Klick = Login-Check").
    // @ts-ignore — tabs.onActivated shape not fully typed in mozilla-webext-types
    browser.tabs.onActivated.addListener((info: any): void => {
        void reauthActiveTab(info.tabId);
    });

    // @ts-ignore — tabs.onRemoved not typed in mozilla-webext-types
    browser.tabs.onRemoved.addListener((tabId: number): void => {
        loggedInTabs.delete(tabId);
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Thunderbird-Start: ist der projektXD-Tab bereits offen (Session-Restore),
    // feuert kein Klick — daher hier den Auto-Login für den bestehenden Tab anstoßen.
    // Außerdem die Bridge-Registrierung erneuern (überlebt keinen Neustart).

    // @ts-ignore
    browser.runtime.onStartup.addListener(async(): Promise<void> => {
        void refreshBridge();

        const options = await reloadConfig();
        void ensureSpace(options);

        // Restored projektXD tabs loaded before the content scripts were
        // registered — inject the favicon into them now (no reload).
        void injectFaviconIntoOpenTabs();

        if (!options.autologin || !options.url) {
            return;
        }

        const origin = originFromUrl(options.url);

        if (!origin) {
            return;
        }

        const existingTabId = await findTabByOrigin(origin);

        if (existingTabId === null) {
            if (Debug.is()) {
                console.log('projektXD::background: onStartup — no open projektXD tab, nothing to do');
            }
            return;
        }

        // Restored tabs are already "complete", so tabs.onUpdated won't fire —
        // trigger the login here and mark the tab as handled for this visit.
        loggedInTabs.add(existingTabId);
        loginWhenReady(existingTabId, origin, options);
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Install/Update: Bridge registrieren.

    // @ts-ignore
    browser.runtime.onInstalled.addListener((): void => {
        void refreshBridge();
        void reloadConfig().then(async(options): Promise<void> => {
            await ensureSpace(options);
            await injectFaviconIntoOpenTabs();
        });
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Options geändert: Bridge neu registrieren und Spaces-Button (URL/Titel) aktualisieren.

    // @ts-ignore — storage.onChanged not typed in mozilla-webext-types
    browser.storage.onChanged.addListener((changes: any, area: string): void => {
        if (area === 'local' && changes && changes.projektxd) {
            void applyConfigChange();
        }
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Bridge → Background: openMessage(EML) (oder deprecated openCompose) aus der projektXD-Seite.

    // @ts-ignore — sendResponse-Signatur in mozilla-webext-types abweichend
    browser.runtime.onMessage.addListener((message: object, _sender: any, sendResponse: (r: BridgeResponse) => void): boolean => {
        const msg = message as Partial<OpenMessageMsg>;

        if (msg && (msg.type === 'openMessage' || msg.type === 'openCompose') && msg.eml) {
            void handleOpenMessage(msg as OpenMessageMsg).then(sendResponse);
            return true;
        }

        return false;
    });

    // -----------------------------------------------------------------------------------------------------------------
    // "projektXD"-Button in einer offenen Mail → Ticket-Flow.

    // @ts-ignore — messageDisplayAction in mozilla-webext-types nur minimal typisiert
    browser.messageDisplayAction.onClicked.addListener(async(tab: any): Promise<void> => {
        await handleTicketFromEmail(tab);
    });
}
