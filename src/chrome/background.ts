import {Settings} from './inc/Settings';
import {Debug} from './inc/Utils/Debug';
import {ThunderbirdBrowser} from 'mozilla-webext-types';
import {ProjektXDOptions} from './inc/Types/projektXDOptions';

declare const browser: ThunderbirdBrowser;

function originFromUrl(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch (_e) {
        return null;
    }
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
        console.log('ProjektXD: about to inject — tab.url=', tab.url, 'granted=', JSON.stringify(all));

        // @ts-ignore — MV3-API, in mozilla-webext-types nicht typisiert
        await browser.scripting.executeScript({
            target: {tabId: tid},
            files: ['chrome/content/scripts/login.js']
        });
        await browser.tabs.sendMessage(tid, options);
    } catch (e) {
        console.error('ProjektXD: auto-login injection failed:', e);
        console.error('ProjektXD: hint — open the options page and click "Aktivieren" to grant host access.');
    }
}

/**
 * Trigger the auto-login as soon as the tab is fully loaded and shows the
 * configured origin. Works both for freshly opened tabs (waits for the
 * "complete" event) and for tabs that are already loaded — e.g. restored on
 * Thunderbird startup, where no navigation event fires anymore.
 *
 * On freshly created tabs "complete" would otherwise already fire for the
 * initial about:blank page, where the extension has no access even with
 * <all_urls> — hence the extra origin check.
 *
 * @param {number} tid
 * @param {string} origin
 * @param {ProjektXDOptions} options
 */
function loginWhenReady(tid: number, origin: string, options: ProjektXDOptions): void {
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
        void injectAndLogin(tid, options);
    };

    browser.tabs.onUpdated.addListener(onUpdated);

    void (async(): Promise<void> => {
        try {
            const current = await browser.tabs.get(tid);

            if (current.status === 'complete' && typeof current.url === 'string' && current.url.startsWith(origin)) {
                browser.tabs.onUpdated.removeListener(onUpdated);
                await injectAndLogin(tid, options);
            }
        } catch (e) {
            console.error('ProjektXD: tabs.get failed:', e);
        }
    })();
}

if (typeof browser === 'undefined') {
    console.error('ProjektXD::background: browser object is not defined!');
} else {
    if (Debug.is()) {
        console.log('ProjektXD::background: init');
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Toolbar-Klick: bestehenden Tab wiederverwenden oder neuen öffnen, dann Auto-Login

    // @ts-ignore
    browser.action.onClicked.addListener(async(): Promise<void> => {
        const options = await new Settings().get();

        if (!options.url) {
            console.warn('ProjektXD: no URL configured — opening options page');
            // @ts-ignore
            await browser.runtime.openOptionsPage();
            return;
        }

        const origin = originFromUrl(options.url);

        if (!origin) {
            console.error('ProjektXD: invalid URL in options:', options.url);
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
            console.error('ProjektXD: could not open tab');
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

    // @ts-ignore
    browser.runtime.onStartup.addListener(async(): Promise<void> => {
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
                console.log('ProjektXD::background: onStartup — no open projektXD tab, nothing to do');
            }
            return;
        }

        loginWhenReady(existingTabId, origin, options);
    });
}