import {ThunderbirdBrowser} from 'mozilla-webext-types';

declare const browser: ThunderbirdBrowser;

/**
 * Opens a raw EML read-only in Thunderbird, exactly as if the user had opened
 * the file from the filesystem.
 *
 * Strategy (per browser-api design): hand the EML to `messageDisplay.open` as a
 * File object (`messageDisplay.open({file})`, TB 114+). Thunderbird shows it in
 * a normal message-display tab, so the user can decide for themselves whether to
 * just read it, reply, reply-all or forward — using Thunderbird's native header
 * buttons, which fill all fields correctly.
 *
 * This intentionally replaces the earlier compose-draft approach: opening a
 * compose window pre-seeded with the original message's headers produced a
 * nonsensical "reply" addressed to the original sender/recipient.
 */
export class DisplayEml {

    /**
     * Open the given EML read-only in a new message-display tab.
     *
     * @param eml         The raw EML bytes.
     * @param contentType MIME type to tag the file with (defaults to message/rfc822).
     * @throws If Thunderbird rejects the file (e.g. invalid EML).
     */
    public static async openFromEml(eml: ArrayBuffer, contentType: string): Promise<void> {
        const file = new File([eml], 'projektxd.eml', {type: contentType || 'message/rfc822'});

        // @ts-ignore — messageDisplay.open is not typed in mozilla-webext-types.
        // The `file` form (a DOM File) opens an external message read-only, added
        // in Thunderbird 114. Requires only the `messagesRead` permission.
        await browser.messageDisplay.open({file, location: 'tab', active: true});
    }

}