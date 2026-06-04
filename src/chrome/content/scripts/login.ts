import {ProjektXDApi} from '../../inc/Api/ProjektXDApi';
import {ProjektXDOptions} from '../../inc/Types/ProjektXDOptions';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

console.log('ProjektXD::login: content script loaded');

let handled = false;

browser.runtime.onMessage.addListener((message: object): void => {
    if (handled) {
        return;
    }

    const opts = message as Partial<ProjektXDOptions>;

    if (!opts || typeof opts.url !== 'string') {
        return;
    }

    handled = true;

    void (async(): Promise<void> => {
        try {
            const isLoggedIn = await ProjektXDApi.loadInit(opts.url as string);

            if (isLoggedIn === null) {
                console.error('ProjektXD::login: init request failed');
                return;
            }

            if (isLoggedIn) {
                console.log('ProjektXD::login: already logged in');
                return;
            }

            const success = await ProjektXDApi.login(
                opts.url as string,
                opts.username ?? '',
                opts.password ?? ''
            );

            if (success) {
                console.log('ProjektXD::login: login successful, reloading');
                window.location.reload();
            } else {
                console.error('ProjektXD::login: login failed');
            }
        } catch (e) {
            console.error('ProjektXD::login: error', e);
        }
    })();
});