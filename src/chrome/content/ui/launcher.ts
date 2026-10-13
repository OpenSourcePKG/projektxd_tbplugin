import {Settings} from '../../inc/Settings';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

/**
 * Whether a stored instance URL is a usable http(s) target.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_e) {
        return false;
    }
}

/**
 * Spaces-button launcher.
 *
 * The projektXD entry in Thunderbird's spaces toolbar points at this page via a
 * fixed in-extension URL that never changes. Deciding *where* a click should go
 * — the configured instance, or the settings page when nothing is configured
 * yet — happens here, at click time, by reading the stored options.
 *
 * This indirection is deliberate: a space owns a single tab, and
 * `spaces.update(url)` navigates that tab. If the space URL were switched from
 * the options page to the instance as soon as the add-on is configured, it
 * would redirect the very options tab the user is still filling in. Keeping the
 * space URL constant and routing here avoids that entirely.
 *
 * @returns {Promise<void>}
 */
async function route(): Promise<void> {
    // @ts-ignore — runtime.getURL not typed in mozilla-webext-types
    const optionsUrl: string = browser.runtime.getURL('chrome/content/ui/options.html');
    let target = optionsUrl;

    try {
        const options = await new Settings().get();

        if (options.url && isHttpUrl(options.url)) {
            target = options.url;
        }
    } catch (e) {
        console.error('projektXD::Launcher: reading options failed', e);
    }

    console.log('projektXD::Launcher: routing to', target);

    // replace() so the launcher does not become a "back" entry in the tab.
    window.location.replace(target);
}

void route();
