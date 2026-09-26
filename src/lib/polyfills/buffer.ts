/**
 * Privy embedded wallet + beberapa lib crypto membutuhkan `Buffer` di browser.
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
