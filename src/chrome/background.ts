import {Settings} from './inc/Settings';
import {Debug} from './inc/Utils/Debug';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

function originFromUrl(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch (_e) {
        return null;
    }
}

(async(): Promise<void> => {
    if (Debug.is()) {
        console.log('ProjektXD::background: init');
    }

    if (typeof browser === 'undefined') {
        console.error('ProjektXD::background: browser object is not defined!');
        return;
    }

    // @ts-ignore
    browser.action.onClicked.addListener(async() => {
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

        // -------------------------------------------------------------------------------------------------------------
        // existierenden Tab suchen oder neuen anlegen

        let tabId: number | null = null;
        const queryTabs = await browser.tabs.query({});

        for (const tab of queryTabs) {
            if (tab.url && tab.url.startsWith(origin)) {
                if (tab.id) {
                    tabId = tab.id;
                }
                break;
            }
        }

        let targetTab: any;

        if (tabId !== null) {
            targetTab = await browser.tabs.update(tabId, {
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

        // -------------------------------------------------------------------------------------------------------------
        // Auto-Login nur, wenn aktiviert

        if (!options.autologin) {
            return;
        }

        const tid: number = targetTab.id;

        const triggerLogin = async(): Promise<void> => {
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
        };

        // auf "complete" UND die richtige URL warten — bei frisch geöffneten Tabs
        // feuert "complete" sonst schon für die initiale about:blank-Seite, und dort
        // hat die Extension auch mit <all_urls> keinen Zugriff.
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
            void triggerLogin();
        };

        browser.tabs.onUpdated.addListener(onUpdated);

        try {
            const current = await browser.tabs.get(tid);

            if (current.status === 'complete' && typeof current.url === 'string' && current.url.startsWith(origin)) {
                browser.tabs.onUpdated.removeListener(onUpdated);
                await triggerLogin();
            }
        } catch (e) {
            console.error('ProjektXD: tabs.get failed:', e);
        }
    });
})();