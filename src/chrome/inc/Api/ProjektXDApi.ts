import {JoinUrl} from '../Utils/JoinUrl';

export type ProjektXDApiInit = {
    data: {
        isLoggedIn: boolean;
    };
    success: boolean;
};

export type ProjektXDApiLoginRequest = {
    user: {
        loginName: string;
        loginPassword: string;
    };
};

export type ProjektXDApiLoginResponse = {
    success: boolean;
};

export class ProjektXDApi {

    private static readonly JSON_HEADERS: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    public static async loadInit(url: string): Promise<boolean | null> {
        const endpoint = JoinUrl.joinUrl(url, 'backend/main/Init');

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: ProjektXDApi.JSON_HEADERS,
                body: '{}'
            });

            if (!response.ok) {
                const snippet = await response.text().catch(() => '');
                console.error(
                    `ProjektXDApi.loadInit: HTTP ${response.status} ${response.statusText} for ${endpoint} — body: ${snippet.slice(0, 200)}`
                );
                return null;
            }

            const text = await response.text();
            let data: ProjektXDApiInit;

            try {
                data = JSON.parse(text) as ProjektXDApiInit;
            } catch (_e) {
                console.error(
                    `ProjektXDApi.loadInit: response was not JSON for ${endpoint} — body: ${text.slice(0, 200)}`
                );
                return null;
            }

            if (data && data.data) {
                console.log(`ProjektXDApi.loadInit: isLoggedIn=${data.data.isLoggedIn}`);
                return data.data.isLoggedIn;
            }

            console.error('ProjektXDApi.loadInit: unexpected payload', data);
        } catch (error) {
            console.error('ProjektXDApi.loadInit: fetch threw', error);
        }

        return null;
    }

    public static async login(url: string, username: string, password: string): Promise<boolean> {
        const endpoint = JoinUrl.joinUrl(url, 'backend/main/Login');

        try {
            const body: ProjektXDApiLoginRequest = {
                user: {
                    loginName: username,
                    loginPassword: password
                }
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: ProjektXDApi.JSON_HEADERS,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const snippet = await response.text().catch(() => '');
                console.error(
                    `ProjektXDApi.login: HTTP ${response.status} ${response.statusText} for ${endpoint} — body: ${snippet.slice(0, 200)}`
                );
                return false;
            }

            const text = await response.text();
            let data: ProjektXDApiLoginResponse;

            try {
                data = JSON.parse(text) as ProjektXDApiLoginResponse;
            } catch (_e) {
                console.error(
                    `ProjektXDApi.login: response was not JSON for ${endpoint} — body: ${text.slice(0, 200)}`
                );
                return false;
            }

            console.log(`ProjektXDApi.login: success=${data?.success}`);
            return data?.success === true;
        } catch (error) {
            console.error('ProjektXDApi.login: fetch threw', error);
            return false;
        }
    }

}