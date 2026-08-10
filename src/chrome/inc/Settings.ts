import {ProjektXDOptions} from './Types/projektXDOptions';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

/**
 * The settings object for FindNow.
 */
export class Settings {

    /**
     * The default options for projektXD.
     * @protected {ProjektXDOptions}
     */
    protected _getDefaults(): ProjektXDOptions {
        return {
            url: '',
            username: '',
            password: '',
            autologin: false
        };
    }

    /**
     * Return the options for projektXD settings.
     * @returns {ProjektXDOptions}
     */
    public async get(): Promise<ProjektXDOptions> {
        let options: ProjektXDOptions = this._getDefaults();

        try {
            const storeData = await browser.storage.local.get();

            if (storeData) {
                if (storeData.projektxd) {
                    options = storeData.projektxd as ProjektXDOptions;
                }
            }
        } catch (e) {
            console.log(e);
        }

        return options;
    }

    /**
     * Set the options for projektXD.
     * @param {ProjektXDOptions} options
     * @returns {any}
     */
    public async set(options: ProjektXDOptions): Promise<any> {
        return browser.storage.local.set({
            projektxd: options
        });
    }

}