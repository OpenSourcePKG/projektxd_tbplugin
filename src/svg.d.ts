/**
 * SVG imports resolve to their raw source string (webpack `asset/source`),
 * e.g. `import faviconSvg from '…/projektXD-favicon.svg'` yields the file's
 * markup, which can be turned into a `data:` URI at runtime.
 */
declare module '*.svg' {
    const content: string;
    export default content;
}
