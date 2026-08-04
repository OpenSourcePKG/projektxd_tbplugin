/**
 * Ambient declarations for Gecko (Firefox/Thunderbird) content-script helpers.
 *
 * These are provided by the Gecko content-script sandbox but are not typed by
 * `mozilla-webext-types`. They let an isolated content script share objects and
 * functions with the untrusted page (main world) — see `api.ts`.
 *
 * Docs: https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts
 */

/**
 * Exports a function into another JavaScript compartment (e.g. the page's).
 *
 * @param func        The function to export.
 * @param targetScope The scope to export into (usually `window.wrappedJSObject`).
 * @param options     `defineAs` attaches the function as a named property on the target.
 * @returns The exported function reference.
 */
declare function exportFunction(
    func: (...args: any[]) => any,
    targetScope: any,
    options?: { defineAs?: string; allowCrossOriginArguments?: boolean }
): any;

/**
 * Structured-clones a value into another compartment so page scripts may use it.
 *
 * @param value       The value to clone.
 * @param targetScope The scope to clone into (usually `window.wrappedJSObject`).
 * @param options     `cloneFunctions`/`wrapReflectors` control cloning behaviour.
 * @returns The cloned value living in the target scope.
 */
declare function cloneInto<T>(
    value: T,
    targetScope: any,
    options?: { cloneFunctions?: boolean; wrapReflectors?: boolean }
): T;

interface Window {
    /** The unprivileged page window, without Xray wrappers. Gecko-only. */
    wrappedJSObject: any;
}
