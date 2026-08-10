import {ProjektXDApi} from '../../inc/Api/projektXDApi';
import {ProjektXDOptions} from '../../inc/Types/projektXDOptions';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

console.log('projektXD::login: content script loaded');

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
                console.error('projektXD::login: init request failed');
                return;
            }

            if (isLoggedIn) {
                console.log('projektXD::login: already logged in');
                return;
            }

            const success = await ProjektXDApi.login(
                opts.url as string,
                opts.username ?? '',
                opts.password ?? ''
            );

            if (success) {
                console.log('projektXD::login: login successful, reloading');
                window.location.reload();
            } else {
                console.error('projektXD::login: login failed');
            }
        } catch (e) {
            console.error('projektXD::login: error', e);
        }
    })();
});