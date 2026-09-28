/*
 * Side-effect module — must be imported first. Installs a minimal `process`
 * global so bundled modules that read process.env at module top-level do not
 * crash inside the goja sandbox.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { sha256 } from './sha256';

const g = globalThis as {
    process?: { env: Record<string, string>; cwd: () => string; argv: string[] };
    TextEncoder?: any;
    TextDecoder?: any;
    crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array; subtle?: unknown; randomUUID?: () => string };
    setTimeout?: (fn: () => void, ms?: number) => unknown;
    queueMicrotask?: (fn: () => void) => void;
};

if (typeof g.process === 'undefined' || g.process === null) {
    g.process = { env: {}, cwd: () => '/', argv: [] };
} else {
    if (typeof g.process.env !== 'object' || g.process.env === null) g.process.env = {};
    if (typeof g.process.cwd !== 'function') g.process.cwd = () => '/';
    if (!Array.isArray(g.process.argv)) g.process.argv = [];
}

/* ---------- TextEncoder / TextDecoder ----------
 * goja exposes neither. document-kramdown, canonical-state and
 * markdown-snapshot all call new TextEncoder().encode() to measure UTF-8
 * byte length, so without this every document read/write check throws
 * "TextEncoder is not defined". Pure-JS UTF-8 implementation.
 */

function utf8EncodeString(s: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let cp = s.charCodeAt(i);
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff) {
                cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                i++;
            }
        }
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) { out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); }
        else if (cp < 0x10000) { out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
        else { out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
    }
    return new Uint8Array(out);
}

function utf8DecodeBytes(bytes: Uint8Array): string {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if ((b & 0xe0) === 0xc0) {
            const cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
            out += String.fromCharCode(cp); i += 2;
        } else if ((b & 0xf0) === 0xe0) {
            const cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
            out += String.fromCharCode(cp); i += 3;
        } else {
            let cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); i += 4;
        }
    }
    return out;
}

if (typeof g.TextEncoder === 'undefined') {
    g.TextEncoder = class TextEncoder {
        encode(input?: string): Uint8Array {
            return utf8EncodeString(input ?? '');
        }
        encodeInto(input: string, dest: Uint8Array) {
            const bytes = utf8EncodeString(input);
            const n = Math.min(bytes.length, dest.length);
            dest.set(bytes.subarray(0, n));
            return { read: n, written: n };
        }
        get encoding() { return 'utf-8'; }
    };
}
if (typeof g.TextDecoder === 'undefined') {
    g.TextDecoder = class TextDecoder {
        decode(input?: Uint8Array): string {
            return utf8DecodeBytes(input ?? new Uint8Array(0));
        }
        get encoding() { return 'utf-8'; }
        get fatal() { return false; }
        get ignoreBOM() { return false; }
    };
}

/* ---------- timers ----------
 * notebook/handlers uses setTimeout for a settle delay; goja has no timer
 * queue. Run the callback synchronously — the delay is a debounce nicety,
 * not a correctness requirement for the write coordinator.
 */
if (typeof g.setTimeout === 'undefined') {
    g.setTimeout = ((fn: () => void) => { fn(); return 0; }) as any;
}
if (typeof g.queueMicrotask === 'undefined') {
    g.queueMicrotask = (fn: () => void) => { Promise.resolve().then(fn); };
}

/* ---------- crypto.subtle ----------
 * markdown-snapshot's hashSnapshotBytes uses crypto.subtle.digest('SHA-256').
 * goja has no WebCrypto; back it with the bundled pure-JS sha256 so document
 * reads/writes that canonicalize state still produce the same digest.
 */
if (typeof g.crypto === 'undefined' || g.crypto === null) {
    g.crypto = {} as any;
}
if (!g.crypto!.subtle) {
    g.crypto!.subtle = {
        async digest(_algo: string, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            const out = sha256(bytes);
            return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
        },
    };
}
if (typeof g.crypto!.getRandomValues !== 'function') {
    // Deterministic-enough PRNG for IDs/leases inside the sandbox. Not a
    // security boundary — the kernel already authenticates the endpoint.
    let seed = 0x9e3779b9 ^ Date.now();
    g.crypto!.getRandomValues = (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            arr[i] = seed & 0xff;
        }
        return arr;
    };
}

export {};
