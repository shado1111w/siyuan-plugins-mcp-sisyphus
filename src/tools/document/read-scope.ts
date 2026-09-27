import * as blockApi from '../../api/block';
import type { SiYuanClient } from '../../api/client';
import { APPROX_TOKEN_MODE, approximateTokensFromChars } from '../../shared/token-estimate';
import { toEditableMarkdownBlock } from '../internal/kramdown-safe';
import { MAX_DOCUMENT_CONTENT_BYTES, MAX_DOCUMENT_RESPONSE_BYTES } from '../internal/document-kramdown';

export type DocumentReadScope = 'full' | 'outline' | 'section' | 'range' | 'keyword';

interface FlatBlock {
    id: string;
    type?: string;
    subtype?: string;
    depth: number;
    markdown: string;
}

export interface DocumentReadOptions {
    scope: DocumentReadScope;
    anchor?: string;
    startId?: string;
    endId?: string;
    pattern?: string;
    contextBefore?: number;
    contextAfter?: number;
    maxDepth?: number;
    includeBlockIds?: boolean;
    tokenBudget?: number;
}

const MAX_SCANNED = 20000;
const HARD_MAX_DEPTH = 128;

// ---- flat enumeration with depth (mirrors document-kramdown but keeps depth) ----

const SELF_CONTAINED = new Set([
    'l', 'b', 'callout', 's', 't', 'table', 'tb', 'av', 'code', 'c',
    'math', 'm', 'html', 'iframe', 'widget', 'query_embed',
]);

interface RawChild { id?: string; type?: string; subtype?: string }

function normalizeType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    const t = type.trim();
    if (!t) return undefined;
    const l = t.toLowerCase();
    if (!l.startsWith('node')) return t;
    if (l.includes('paragraph')) return 'p';
    if (l.includes('heading')) return 'h';
    if (l.includes('listitem')) return 'i';
    if (l.includes('blockquote')) return 'b';
    if (l.includes('callout')) return 'callout';
    if (l.includes('superblock')) return 's';
    if (l.includes('table')) return 't';
    if (l.includes('codeblock')) return 'c';
    if (l.includes('mathblock')) return 'm';
    if (l.includes('attributeview')) return 'av';
    if (l.includes('thematicbreak')) return 'tb';
    return t;
}

async function collectBlocks(
    client: SiYuanClient,
    parentId: string,
    depth: number,
    out: FlatBlock[],
    visited: Set<string>,
): Promise<void> {
    if (depth > HARD_MAX_DEPTH) return;
    const children = await blockApi.getChildBlocks(client, parentId, MAX_DOCUMENT_RESPONSE_BYTES) as unknown as RawChild[];
    for (const child of children || []) {
        const id = child?.id;
        if (!id || visited.has(id)) continue;
        if (out.length >= MAX_SCANNED) throw new Error('Document exceeds the 20000-block scan limit; read a narrower range.');
        visited.add(id);
        const type = normalizeType(child.type);
        const subtype = typeof child.subtype === 'string' ? child.subtype : undefined;
        let markdown = '';
        try {
            const kd = await blockApi.getBlockKramdown(client, id, MAX_DOCUMENT_RESPONSE_BYTES);
            markdown = toEditableMarkdownBlock({ kramdown: typeof kd?.kramdown === 'string' ? kd.kramdown : '', type });
        } catch { markdown = ''; }
        out.push({ id, type, subtype, depth, markdown });
        if (!type || !SELF_CONTAINED.has(type)) {
            await collectBlocks(client, id, depth + 1, out, visited);
        }
    }
}

// ---- heading helpers ----

function headingLevel(block: FlatBlock): number | undefined {
    const m = block.subtype?.match(/^h([1-6])$/i);
    if (m) return Number(m[1]);
    const md = block.markdown.match(/^\s{0,3}(#{1,6})\s+/);
    return md?.[1].length;
}
function headingTitle(markdown: string): string | undefined {
    const line = markdown.split(/\r?\n/, 1)[0] ?? '';
    const m = line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    return m?.[1]?.trim() || undefined;
}

// ---- scope resolution: returns the inclusive [start,end] block index set ----

function resolveScopeIndices(blocks: FlatBlock[], opts: DocumentReadOptions): { indices: number[]; outline: { blockIndex: number; level: number; title: string; id: string }[] } {
    const headings: { blockIndex: number; level: number; title: string; id: string }[] = [];
    blocks.forEach((b, i) => {
        if (b.type !== 'h') return;
        const level = headingLevel(b);
        const title = headingTitle(b.markdown);
        if (level && title) headings.push({ blockIndex: i, level, title, id: b.id });
    });

    const all = blocks.map((_, i) => i);
    switch (opts.scope) {
        case 'full':
            return { indices: all, outline: headings };
        case 'outline': {
            const maxDepth = opts.maxDepth ?? -1;
            const keep = maxDepth < 0 ? headings : headings.filter(h => h.level <= maxDepth);
            return { indices: keep.map(h => h.blockIndex), outline: keep };
        }
        case 'section': {
            if (!opts.anchor) throw new Error('scope="section" requires --anchor (a heading block id or exact heading title).');
            const h = headings.find(x => x.id === opts.anchor)
                ?? headings.find(x => x.title === opts.anchor)
                ?? headings.find(x => x.title.toLowerCase() === String(opts.anchor).toLowerCase());
            if (!h) throw new Error(`No heading matches anchor "${opts.anchor}". Use scope="outline" to list headings.`);
            const start = h.blockIndex;
            // section subtree = until next heading of same-or-higher level
            let end = blocks.length - 1;
            for (let i = start + 1; i < blocks.length; i++) {
                const lvl = blocks[i].type === 'h' ? headingLevel(blocks[i]) : undefined;
                if (lvl !== undefined && lvl <= h.level) { end = i - 1; break; }
            }
            const before = Math.max(0, opts.contextBefore ?? 0);
            const after = Math.max(0, opts.contextAfter ?? 0);
            const lo = Math.max(0, start - before);
            const hi = Math.min(blocks.length - 1, end + after);
            const idx: number[] = [];
            for (let i = lo; i <= hi; i++) idx.push(i);
            return { indices: idx, outline: headings };
        }
        case 'range': {
            if (!opts.startId) throw new Error('scope="range" requires --start-id.');
            const si = blocks.findIndex(b => b.id === opts.startId);
            if (si < 0) throw new Error(`start-id "${opts.startId}" is not a block in this document.`);
            let ei = blocks.length - 1;
            if (opts.endId && opts.endId !== '-1') {
                ei = blocks.findIndex(b => b.id === opts.endId);
                if (ei < 0) throw new Error(`end-id "${opts.endId}" is not a block in this document.`);
                if (ei < si) throw new Error('end-id appears before start-id in document order.');
            }
            const idx: number[] = [];
            for (let i = si; i <= ei; i++) idx.push(i);
            return { indices: idx, outline: headings };
        }
        case 'keyword': {
            if (!opts.pattern) throw new Error('scope="keyword" requires --pattern (substring, or "a|b" for OR branches).');
            const terms = String(opts.pattern).split('|').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (!terms.length) throw new Error('Empty keyword pattern.');
            const hits = new Set<number>();
            blocks.forEach((b, i) => {
                const text = b.markdown.toLowerCase();
                if (terms.some(t => text.includes(t))) hits.add(i);
            });
            const before = Math.max(0, opts.contextBefore ?? 0);
            const after = Math.max(0, opts.contextAfter ?? 0);
            const idx = new Set<number>();
            for (const i of hits) {
                for (let k = Math.max(0, i - before); k <= Math.min(blocks.length - 1, i + after); k++) idx.add(k);
            }
            const sorted = [...idx].sort((a, b) => a - b);
            return { indices: sorted, outline: headings };
        }
        default:
            return { indices: all, outline: headings };
    }
}

export async function readDocumentScoped(
    client: SiYuanClient,
    documentId: string,
    opts: DocumentReadOptions,
): Promise<Record<string, unknown>> {
    const blocks: FlatBlock[] = [];
    await collectBlocks(client, documentId, 0, blocks, new Set([documentId]));
    const { indices, outline } = resolveScopeIndices(blocks, opts);

    const budget = opts.tokenBudget ?? Infinity;
    const contentParts: string[] = [];
    const blockRefs: { blockIndex: number; id: string; type?: string; subtype?: string; depth: number }[] = [];
    let contentBytes = 0;
    let contentChars = 0;
    let truncated = false;
    for (const i of indices) {
        const b = blocks[i];
        const md = b.markdown;
        const sep = md.length && contentParts.length ? 2 : 0;
        const nextBytes = contentBytes + sep + new TextEncoder().encode(md).byteLength;
        const nextChars = contentChars + sep + md.length;
        if (nextBytes > MAX_DOCUMENT_CONTENT_BYTES) { truncated = true; break; }
        if (md.length && approximateTokensFromChars(nextChars) > budget && contentParts.length) { truncated = true; break; }
        contentBytes = nextBytes;
        contentChars = nextChars;
        contentParts.push(md);
        blockRefs.push({ blockIndex: i, id: b.id, type: b.type, subtype: b.subtype, depth: b.depth });
    }

    return {
        scope: opts.scope,
        content: contentParts.filter(Boolean).join('\n\n'),
        matchedBlocks: indices.length,
        returnedBlocks: blockRefs.length,
        totalBlocks: blocks.length,
        contentBytes,
        maxContentBytes: MAX_DOCUMENT_CONTENT_BYTES,
        estimatedTokens: approximateTokensFromChars(contentChars),
        tokenMode: APPROX_TOKEN_MODE,
        truncated,
        ...(opts.tokenBudget ? { tokenBudget: opts.tokenBudget } : {}),
        ...(opts.scope === 'outline' ? { outline, headingCount: outline.length } : { outline: outline.filter(h => indices.includes(h.blockIndex)) }),
        ...(opts.includeBlockIds ? { blockRefs } : {}),
    };
}
