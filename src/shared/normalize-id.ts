/**
 * normalize-id — accept the ID forms an agent is likely to paste and reduce
 * them to a bare SiYuan block/document ID.
 *
 * Accepts:
 *   - bare ID            20240101120000-abcdefg
 *   - block ref          ((20240101120000-abcdefg))
 *   - siyuan:// URL      siyuan://blocks/20240101120000-abcdefg
 *   - web/desktop link   http(s)://host/...?id=20240101120000-abcdefg  or
 *                        siyuan://...; any URL with an id= query param
 *
 * Anything else is passed through unchanged (passthrough) so callers can keep
 * accepting human-readable paths and other identifiers without a breaking
 * change. Only a confident match is rewritten.
 */

export const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;

export type NormalizeIdKind = 'bare' | 'block-ref' | 'siyuan-url' | 'web-url' | 'passthrough';

export interface NormalizeIdResult {
    /** The normalized identifier. Bare SiYuan ID when a confident match, else the trimmed input. */
    id: string;
    /** How the input was interpreted. */
    kind: NormalizeIdKind;
    /** True when the input was rewritten into a bare ID. */
    normalized: boolean;
}

const BLOCK_REF_PATTERN = /^\(\(([^()]*)\)\)$/;

function isSiYuanId(value: string): boolean {
    return SIYUAN_ID_PATTERN.test(value);
}

function extractIdFromUrl(input: string): string | undefined {
    // siyuan://blocks/<id>  (also tolerate siyuan://block/<id>)
    const siyuanMatch = input.match(/^siyuan:\/\/blocks?\/([A-Za-z0-9-]{15,32})/);
    if (siyuanMatch && isSiYuanId(siyuanMatch[1])) return siyuanMatch[1];

    // Any URL carrying an ?id=<siyuan-id> or &id=<siyuan-id> query param.
    const queryMatch = input.match(/[?&]id=(\d{14}-[a-z0-9]{7})/);
    if (queryMatch && isSiYuanId(queryMatch[1])) return queryMatch[1];

    // A path segment that is itself a bare ID (e.g. /blocks/2024...-abc).
    const pathMatch = input.match(/\/(\d{14}-[a-z0-9]{7})(?:[/?#]|$)/);
    if (pathMatch && isSiYuanId(pathMatch[1])) return pathMatch[1];

    return undefined;
}

/**
 * Normalize one identifier. Returns the bare ID plus how it was interpreted.
 * Non-matching inputs are returned trimmed with kind='passthrough' and
 * normalized=false — callers decide whether passthrough is acceptable.
 */
export function normalizeId(input: unknown): NormalizeIdResult {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return { id: '', kind: 'passthrough', normalized: false };

    if (isSiYuanId(raw)) return { id: raw, kind: 'bare', normalized: false };

    const refMatch = raw.match(BLOCK_REF_PATTERN);
    if (refMatch) {
        const inner = refMatch[1].trim();
        if (isSiYuanId(inner)) return { id: inner, kind: 'block-ref', normalized: true };
    }

    if (/^siyuan:\/\//.test(raw)) {
        const id = extractIdFromUrl(raw);
        if (id) return { id, kind: 'siyuan-url', normalized: true };
    }

    if (/^https?:\/\//.test(raw) || raw.includes('://')) {
        const id = extractIdFromUrl(raw);
        if (id) return { id, kind: 'web-url', normalized: true };
    }

    return { id: raw, kind: 'passthrough', normalized: false };
}

/** Convenience: normalized bare ID, or the trimmed input when not an ID form. */
export function toId(input: unknown): string {
    return normalizeId(input).id;
}
