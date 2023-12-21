import {Debug} from './inc/Utils/Debug';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

/**
 * Main
 */

(async(): Promise<void> => {
    if (Debug.is()) {
        console.log('ProjektXD::background: init');
    }

    browser.browserAction.onClicked.addListener(async() => {
        // TODO
        const urlFn = 'https://<domain>/path/index.html';
        let tabId: number|null = null;

        const queryTabs = await browser.tabs.query({});

        if (queryTabs.length >= 1) {
            for (const tab of queryTabs) {
                if (tab.url) {
                    if (tab.url.includes(urlFn)) {
                        if (tab.id) {
                            tabId = tab.id;
                        }
                        break;
                    }
                }
            }
        }

        let tTab: any;

        if (tabId) {
            tTab = await browser.tabs.update(tabId, {
                url: urlFn,
                active: true
            });
        } else {
            tTab = await browser.tabs.create({
                active: true,
                url: urlFn
            });
        }

        // https://github.com/cool-dev-code/darkreader/blob/3bf6f9947cbfa7d3c2604c61e36c081b5790665e/src/background/tab-manager.ts#L191
        if (tTab) {
            await browser.tabs.executeScript(tTab.id, {
                runAt: 'document_start',
                file: '/inject/index.js',
                allFrames: true,
                matchAboutBlank: true,
            });
        }
    });
})();