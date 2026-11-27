// src/ext/native-dom-parser.js
// Stands in for linkedom in the Firefox build (see extension/build.mjs):
// Firefox's background page has the browser's own DOMParser.
export const DOMParser = globalThis.DOMParser;
