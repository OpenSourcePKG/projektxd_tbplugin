import {ThunderbirdBrowser} from 'mozilla-webext-types';
import {EmailAddress, EmailMetaMin} from '../Types/bridge';

declare const browser: ThunderbirdBrowser;

/**
 * The raw EML plus minimal metadata of the message currently displayed in a tab.
 */
export type DisplayedEmailData = {
    /** The complete, unmodified EML source. */
    eml: ArrayBuffer;
    /** MIME type of the EML (always message/rfc822). */
    contentType: string;
    /** Cheap convenience metadata (no MIME parsing). */
    meta: EmailMetaMin;
};

/**
 * Reads the message shown in a Thunderbird message-display tab and returns its
 * raw EML together with minimal metadata (subject/from/date/message-id).
 */
export class DisplayedEmail {

    /**
     * @param tabId The tab whose displayed message should be read.
     * @returns The EML + minimal metadata, or null if no message is displayed.
     */
    public static async fromTab(tabId: number): Promise<DisplayedEmailData | null> {
        // TB 140 exposes getDisplayedMessages (plural) returning a MessageList;
        // the singular getDisplayedMessage no longer exists. Take the first message.
        // @ts-ignore — getDisplayedMessages not (correctly) typed in mozilla-webext-types
        const displayed = await browser.messageDisplay.getDisplayedMessages(tabId);
        const list: any[] = Array.isArray(displayed) ? displayed : (displayed && displayed.messages) || [];
        const header = list[0];

        if (!header || typeof header.id !== 'number') {
            return null;
        }

        // @ts-ignore — data_format is typed as plain string; 'File' yields a File
        const file: File = await browser.messages.getRaw(header.id, {data_format: 'File'});
        const eml = await file.arrayBuffer();

        return {
            eml,
            contentType: 'message/rfc822',
            meta: DisplayedEmail.buildMeta(header)
        };
    }

    /**
     * Build the minimal metadata object from a MessageHeader.
     */
    private static buildMeta(header: any): EmailMetaMin {
        return {
            subject: header.subject ?? '',
            from: DisplayedEmail.parseAddress(header.author ?? ''),
            date: DisplayedEmail.toIso(header.date),
            messageId: header.headerMessageId ?? ''
        };
    }

    /**
     * Parse an address string like `Jane Doe <jane@example.com>` into name/email.
     */
    private static parseAddress(raw: string): EmailAddress {
        const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);

        if (match) {
            return {
                name: match[1].replace(/^"|"$/g, '').trim(),
                email: match[2].trim()
            };
        }

        return {
            name: '',
            email: raw.trim()
        };
    }

    /**
     * Convert a MessageHeader `date` (Date object or epoch millis) to ISO-8601.
     */
    private static toIso(date: unknown): string {
        try {
            if (date instanceof Date) {
                return date.toISOString();
            }

            if (typeof date === 'number') {
                return new Date(date).toISOString();
            }

            if (typeof date === 'string') {
                return new Date(date).toISOString();
            }
        } catch (_e) {
            // fall through to empty string on invalid dates
        }

        return '';
    }

}
