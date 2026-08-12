import faviconSvg from '../../../../assets/chrome/content/images/projektXD-favicon.svg';

/**
 * Favicon content script — runs on the configured projektXD origin (registered
 * dynamically by the background, like the bridge) and can also be injected via
 * scripting.executeScript into already-open tabs, so the projektXD instance tab
 * shows the add-on icon immediately, without a reload.
 *
 * The icon is `projektXD-favicon.svg` (single source of truth), inlined at build
 * time and used as a `data:` URI — Thunderbird does not render moz-extension:
 * URLs as tab favicons, whereas an inline data URI always works and is not
 * subject to the page's CSP for extension resources. A MutationObserver
 * re-asserts it if the (single-page) app swaps its own favicon in later — both
 * when a foreign icon <link> is added and when an existing one's href changes.
 */

/** Marker attribute so we can tell our own favicon link apart. */
const MARK = 'data-projektxd-favicon';

const HREF: string = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg);

function isIconLink(node: Node | null): node is HTMLLinkElement {
    return node instanceof HTMLLinkElement && /(^|\s)icon(\s|$)/i.test(node.rel);
}

/**
 * Remove any existing favicon links and install ours.
 */
function setFavicon(): void {
    const head = document.head;

    if (!head) {
        return;
    }

    head.querySelectorAll('link[rel~="icon"]').forEach((el: Element): void => el.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = HREF;
    link.setAttribute(MARK, '1');
    head.appendChild(link);
}

/**
 * Watch <head> for the page (re-)setting its own favicon — either by adding a
 * foreign icon link or by changing an existing link's href/rel — and re-assert
 * ours.
 */
function guardFavicon(): void {
    if (!document.head) {
        return;
    }

    const observer = new MutationObserver((mutations: MutationRecord[]): void => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (isIconLink(node) && !node.hasAttribute(MARK)) {
                    setFavicon();
                    return;
                }
            }

            if (mutation.type === 'attributes' && isIconLink(mutation.target)) {
                const link = mutation.target as HTMLLinkElement;

                if (!link.hasAttribute(MARK) || link.getAttribute('href') !== HREF) {
                    setFavicon();
                    return;
                }
            }
        }
    });

    observer.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'rel']
    });
}

/**
 * Install the favicon now (or as soon as <head> exists) and keep it asserted.
 * Guarded so a re-injection into an already-instrumented tab only re-asserts
 * the icon instead of adding a second observer.
 */
function install(): void {
    const marker = window as unknown as {__pxdFaviconInstalled?: boolean};

    if (marker.__pxdFaviconInstalled) {
        setFavicon();
        return;
    }

    marker.__pxdFaviconInstalled = true;

    if (document.head) {
        setFavicon();
        guardFavicon();
        return;
    }

    const waitForHead = new MutationObserver((): void => {
        if (document.head) {
            waitForHead.disconnect();
            setFavicon();
            guardFavicon();
        }
    });

    waitForHead.observe(document.documentElement, {childList: true, subtree: true});
}

install();