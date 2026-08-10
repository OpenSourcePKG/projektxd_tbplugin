import {Settings} from '../../inc/Settings';
import {Toast} from '../../inc/Utils/Toast';
import {Translation} from '../../inc/Utils/Translation';
import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

type onChangeOptionEvent = (event: Event) => void;
type onSaveOptionEvent = () => void;

const HOST_PATTERN = '<all_urls>';

function isValidProjektXDUrl(url: string): boolean {
    if (!url) {
        return true;
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_e) {
        return false;
    }
}

/**
 * Options UI Object.
 */
export class Options {

    /**
     * Return an HTMLInputElement in short call.
     * @param {string} name - Name of HTMLInputElement
     * @param {onChangeOptionEvent} onChange - On change event inline function.
     * @returns {HTMLInputElement}
     * @throws {Error}
     */
    public static getElm(name: string, onChange?: onChangeOptionEvent): HTMLInputElement {
        const elm = document.getElementById(name);

        if (elm) {
            if (onChange) {
                elm.addEventListener('change', (event) => {
                    onChange(event);
                });
            }

            return elm as HTMLInputElement;
        }

        throw Error(`projektXD::Options: Element not found by name: ${name}`);
    }

    /**
     * Call by window laod event.
     */
    public static async onLoad(): Promise<void> {
        console.log('projektXD::Options: onLoad');

        Translation.lang();

        const options = await new Settings().get();
        let onSave: onSaveOptionEvent|null = null;

        // save indicator ----------------------------------------------------------------------------------------------

        const saveIndicator = document.getElementById('save-indicator');
        let saveIndicatorTimer: number | null = null;

        const flashSaved = (): void => {
            if (!saveIndicator) {
                return;
            }

            saveIndicator.classList.add('is-visible');

            if (saveIndicatorTimer !== null) {
                window.clearTimeout(saveIndicatorTimer);
            }

            saveIndicatorTimer = window.setTimeout(() => {
                saveIndicator.classList.remove('is-visible');
                saveIndicatorTimer = null;
            }, 1400);
        };

        // save onChange event -----------------------------------------------------------------------------------------

        const onChange: onChangeOptionEvent = () => {
            if (onSave) {
                onSave();
            }
        };

        // inputs ------------------------------------------------------------------------------------------------------

        const inputUrl = Options.getElm('url', onChange);
        const inputUsername = Options.getElm('username', onChange);
        const inputPassword = Options.getElm('password', onChange);
        const inputAutoLogin = Options.getElm('autologin', onChange);

        inputUrl.value = options.url;
        inputUsername.value = options.username;

        if (options.password) {
            inputPassword.placeholder = '••••••••';
        }

        inputAutoLogin.checked = options.autologin === true;

        // show/hide password ------------------------------------------------------------------------------------------

        const togglePwBtn = document.getElementById('toggle-password');

        if (togglePwBtn) {
            togglePwBtn.addEventListener('click', () => {
                const isText = inputPassword.type === 'text';
                inputPassword.type = isText ? 'password' : 'text';
                togglePwBtn.classList.toggle('is-visible', !isText);
            });
        }

        // permission status -------------------------------------------------------------------------------------------

        const grantBtn = document.getElementById('permission-grant') as HTMLButtonElement | null;
        const statusOk = document.querySelector('#permission-status [data-status="ok"]') as HTMLElement | null;
        const statusMissing = document.querySelector('#permission-status [data-status="missing"]') as HTMLElement | null;

        const refreshStatus = async(): Promise<void> => {
            let granted = false;

            try {
                granted = await browser.permissions.contains({origins: [HOST_PATTERN]});
            } catch (e) {
                console.error('projektXD::Options: permissions.contains failed', e);
            }

            if (statusOk) {
                statusOk.hidden = !granted;
            }
            if (statusMissing) {
                statusMissing.hidden = granted;
            }
            if (grantBtn) {
                // Button bleibt sichtbar, damit der Nutzer die Berechtigung jederzeit
                // neu anfordern kann (z. B. nach versehentlichem Entzug).
                grantBtn.classList.toggle('btn-secondary', granted);
                grantBtn.classList.toggle('btn-primary', !granted);
            }
        };

        if (grantBtn) {
            grantBtn.addEventListener('click', () => {
                // permissions.request MUSS synchron im User-Gesture-Handler aufgerufen werden —
                // jedes vorhergehende await bricht den Gesture-Kontext und Thunderbird lehnt ab.
                const requestPromise = browser.permissions.request({origins: [HOST_PATTERN]});

                requestPromise.then(async(granted) => {
                    console.log('projektXD::Options: permissions.request →', granted);

                    // Settings danach speichern (kein Gesture nötig).
                    if (onSave) {
                        await onSave();
                    }

                    await refreshStatus();
                }).catch((e) => {
                    console.error('projektXD::Options: permission request failed', e);
                    void refreshStatus();
                });
            });
        }

        void refreshStatus();

        // save --------------------------------------------------------------------------------------------------------
        onSave = async(): Promise<void> => {
            const newUrl = inputUrl.value.trim();

            if (!isValidProjektXDUrl(newUrl)) {
                Toast.show({
                    type: 'error',
                    title: browser.i18n.getMessage('toastInvalidUrlTitle'),
                    message: browser.i18n.getMessage('toastInvalidUrlBody')
                });
                return;
            }

            options.url = newUrl;
            options.username = inputUsername.value;

            if (inputPassword.value !== '') {
                options.password = inputPassword.value;
            }

            options.autologin = inputAutoLogin.checked;

            await new Settings().set(options);

            flashSaved();
        };
    }

}

/**
 * Main registiert function.
 */
(async(): Promise<void> => {
    console.log('projektXD::Options: addEventListener');
    window.addEventListener('load', Options.onLoad, false);
})();