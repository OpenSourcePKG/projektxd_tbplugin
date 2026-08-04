import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

/**
 * Opens a Thunderbird compose window pre-filled from a raw EML.
 *
 * Strategy (per browser-api design): import the EML into the Drafts folder of
 * the first account via `messages.import`, then open a compose window based on
 * the imported message via `compose.beginNew(messageId)`. The imported draft is
 * intentionally NOT cleaned up — it stays until the user sends or discards it.
 */
export class ComposeDraft {

    /**
     * Import the given EML and open a compose window for it.
     *
     * @param eml         The raw EML bytes.
     * @param contentType MIME type to tag the file with (defaults to message/rfc822).
     * @throws If no Drafts folder can be found or the import/compose call fails.
     */
    public static async openFromEml(eml: ArrayBuffer, contentType: string): Promise<void> {
        const file = new File([eml], 'projektxd.eml', {type: contentType || 'message/rfc822'});

        const draftsFolder = await ComposeDraft.findDraftsFolder();

        if (!draftsFolder) {
            throw new Error('ComposeDraft: no Drafts folder found on the first account');
        }

        // @ts-ignore — messages.import is not typed in mozilla-webext-types
        const imported = await browser.messages.import(file, draftsFolder);

        if (!imported || typeof imported.id !== 'number') {
            throw new Error('ComposeDraft: messages.import returned no message');
        }

        // @ts-ignore — the messageId form of compose.beginNew is not typed
        await browser.compose.beginNew(imported.id);
    }

    /**
     * Find the Drafts folder of the first account (recursively through subfolders).
     */
    private static async findDraftsFolder(): Promise<any | null> {
        const accounts = await browser.accounts.list(true);

        if (!accounts || accounts.length === 0) {
            return null;
        }

        return ComposeDraft.searchDrafts(accounts[0].folders ?? []);
    }

    /**
     * Depth-first search for a folder whose `type` is 'drafts'.
     */
    private static searchDrafts(folders: any[]): any | null {
        for (const folder of folders) {
            if (folder.type === 'drafts') {
                return folder;
            }

            const sub = folder.subFolders ?? folder.folders;

            if (Array.isArray(sub)) {
                const found = ComposeDraft.searchDrafts(sub);

                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

}
