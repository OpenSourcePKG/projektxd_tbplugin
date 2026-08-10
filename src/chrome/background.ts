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
 * (Re-)register the bridge content script (`api.js`) for the configured origin
 * only. This is what limits `window.projektxd_tb` injection to projektXD.
 *
 * @param {string} origin
 */
async function registerBridge(origin: string): Promise<void> {
    try {
        // @ts-ignore — scripting.unregisterContentScripts not fully typed
        await browser.scripting.unregisterContentScripts({ids: [BRIDGE_SCRIPT_ID]});
    } catch (_e) {
        // not registered yet — ignore
    }

    try {
        // @ts-ignore — scripting.registerContentScripts not fully typed
        await browser.scripting.registerContentScripts([{
            id: BRIDGE_SCRIPT_ID,
            js: ['chrome/content/scripts/api.js'],
            matches: [`${origin}/*`],
            runAt: 'document_start',
            persistAcrossSessions: false
        }]);

        if (Debug.is()) {
            console.log('projektXD::background: bridge registered for', origin);
        }
    } catch (e) {
        console.error('projektXD: registerBridge failed:', e);
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

if (typeof browser === 'undefined') {
    console.error('projektXD::background: browser object is not defined!');
} else {
    if (Debug.is()) {
        console.log('projektXD::background: init');
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Toolbar-Klick: bestehenden Tab wiederverwenden oder neuen öffnen, dann Auto-Login

    // @ts-ignore
    browser.action.onClicked.addListener(async(): Promise<void> => {
        const options = await new Settings().get();

        if (!options.url) {
            console.warn('projektXD: no URL configured — opening options page');
            // @ts-ignore
            await browser.runtime.openOptionsPage();
            return;
        }

        const origin = originFromUrl(options.url);

        if (!origin) {
            console.error('projektXD: invalid URL in options:', options.url);
            // @ts-ignore
            await browser.runtime.openOptionsPage();
            return;
        }

        const existingTabId = await findTabByOrigin(origin);

        let targetTab: any;

        if (existingTabId !== null) {
            targetTab = await browser.tabs.update(existingTabId, {
                url: options.url,
                active: true
            });
        } else {
            targetTab = await browser.tabs.create({
                active: true,
                url: options.url
            });
        }

        if (!targetTab || !targetTab.id) {
            console.error('projektXD: could not open tab');
            return;
        }

        if (!options.autologin) {
            return;
        }

        loginWhenReady(targetTab.id, origin, options);
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Thunderbird-Start: ist der projektXD-Tab bereits offen (Session-Restore),
    // feuert kein Klick — daher hier den Auto-Login für den bestehenden Tab anstoßen.
    // Außerdem die Bridge-Registrierung erneuern (überlebt keinen Neustart).

    // @ts-ignore
    browser.runtime.onStartup.addListener(async(): Promise<void> => {
        void refreshBridge();

        const options = await new Settings().get();

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

        loginWhenReady(existingTabId, origin, options);
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Install/Update: Bridge registrieren.

    // @ts-ignore
    browser.runtime.onInstalled.addListener((): void => {
        void refreshBridge();
    });

    // -----------------------------------------------------------------------------------------------------------------
    // Options geändert: Bridge für neue Origin neu registrieren.

    // @ts-ignore — storage.onChanged not typed in mozilla-webext-types
    browser.storage.onChanged.addListener((changes: any, area: string): void => {
        if (area === 'local' && changes && changes.projektxd) {
            void refreshBridge();
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
