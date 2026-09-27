import { describe, expect, it, vi } from 'vitest';
import { buildDefaultToolConfig } from '@/core/config';
import { callDocumentTool, DOCUMENT_VARIANTS } from '@/tools/document';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

const permMgr = createMockPermissionManager();

function dc() {
    const c = buildDefaultToolConfig().document;
    for (const k of Object.keys(c.actions)) (c.actions as Record<string, boolean>)[k] = true;
    return c;
}

// doc-1 tree:
//  h2 Alpha (h-a) -> para intro (p-1) -> h3 Alpha.Sub (h-as) -> para sub (p-2)
//  h2 Beta  (h-b) -> para beta (p-3) -> list (l-1)
//  h2 Gamma (h-g) -> para last (p-4)
const CHILDREN: Record<string, Array<{ id: string; type: string; subtype?: string }>> = {
    'doc-1': [
        { id: 'h-a', type: 'h', subtype: 'h2' },
        { id: 'h-b', type: 'h', subtype: 'h2' },
        { id: 'h-g', type: 'h', subtype: 'h2' },
    ],
    'h-a': [{ id: 'p-1', type: 'p' }, { id: 'h-as', type: 'h', subtype: 'h3' }],
    'h-as': [{ id: 'p-2', type: 'p' }],
    'h-b': [{ id: 'p-3', type: 'p' }, { id: 'l-1', type: 'l' }],
    'h-g': [{ id: 'p-4', type: 'p' }],
    'l-1': [{ id: 'li-1', type: 'i' }, { id: 'li-2', type: 'i' }],
};

const KRAMDOWN: Record<string, string> = {
    'h-a': '## Alpha\n{: id="h-a"}',
    'h-as': '### Alpha.Sub\n{: id="h-as"}',
    'h-b': '## Beta\n{: id="h-b"}',
    'h-g': '## Gamma\n{: id="h-g"}',
    'p-1': 'intro para alpha keyword apple\n{: id="p-1"}',
    'p-2': 'sub detail banana\n{: id="p-2"}',
    'p-3': 'beta para keyword cherry\n{: id="p-3"}',
    'p-4': 'last para\n{: id="p-4"}',
    'l-1': '- {: id="li-1"}item one\n- {: id="li-2"}item two\n{: id="l-1"}',
};

function makeClient() {
    return createMockClient({
        request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/block/getDocInfo') {
                return { id: body?.id, rootID: 'doc-1', box: 'nb-1', path: '/doc-1.sy' };
            }
            if (endpoint === '/api/notebook/lsNotebooks') {
                return { notebooks: [{ id: 'nb-1', name: 'Notebook', closed: false }] };
            }
            if (endpoint === '/api/query/sql') {
                const stmt = String(body?.stmt ?? '');
                if (stmt.includes("'doc-1'")) {
                    return [{ id: 'doc-1', root_id: 'doc-1', box: 'nb-1', path: '/doc-1.sy', hpath: '/Doc 1', content: 'Doc 1', type: 'd' }];
                }
                return [];
            }
            if (endpoint === '/api/block/getChildBlocks') {
                return CHILDREN[String(body?.id)] ?? [];
            }
            if (endpoint === '/api/block/getBlockKramdown') {
                const id = String(body?.id);
                return { id, kramdown: KRAMDOWN[id] ?? '' };
            }
            if (endpoint === '/api/filetree/getHPathByID') return '/Doc 1';
            return null;
        }),
    });
}

async function read(args: Record<string, unknown>) {
    const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', ...args }, dc(), permMgr);
    return { raw: r, p: parseResult(r) };
}

describe('document.read', () => {
    it('schema exposes scope and per-scope params', () => {
        const v = DOCUMENT_VARIANTS.find((x) => x.action === 'read');
        expect(v).toBeTruthy();
        const props = v?.schema.properties as Record<string, unknown>;
        for (const k of ['scope', 'anchor', 'startId', 'endId', 'pattern', 'contextBefore', 'contextAfter', 'maxDepth', 'includeBlockIds']) {
            expect(props, k).toHaveProperty(k);
        }
    });

    it('scope=full returns the whole document content', async () => {
        const { p } = await read({ scope: 'full' });
        expect(p.scope).toBe('full');
        expect(p.content).toContain('intro para alpha keyword apple');
        expect(p.content).toContain('beta para keyword cherry');
        expect(p.content).toContain('last para');
        expect(p.matchedBlocks).toBeGreaterThan(5);
        expect(p.truncated).toBe(false);
    });

    it('scope=outline returns only headings with headingCount', async () => {
        const { p } = await read({ scope: 'outline' });
        expect(p.scope).toBe('outline');
        expect(p.headingCount).toBe(4);
        expect(p.content).toContain('## Alpha');
        expect(p.content).toContain('### Alpha.Sub');
        expect(p.content).not.toContain('intro para');
        expect(p.outline.map((h: { title: string }) => h.title)).toEqual(['Alpha', 'Alpha.Sub', 'Beta', 'Gamma']);
    });

    it('scope=outline respects maxDepth', async () => {
        const { p } = await read({ scope: 'outline', maxDepth: 2 });
        expect(p.headingCount).toBe(3);
        expect(p.outline.map((h: { title: string }) => h.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('scope=section by title returns the heading subtree only', async () => {
        const { p } = await read({ scope: 'section', anchor: 'Beta' });
        expect(p.content).toContain('## Beta');
        expect(p.content).toContain('beta para keyword cherry');
        expect(p.content).not.toContain('## Alpha');
        expect(p.content).not.toContain('## Gamma');
    });

    it('scope=section includes nested subheadings', async () => {
        const { p } = await read({ scope: 'section', anchor: 'Alpha' });
        expect(p.content).toContain('### Alpha.Sub');
        expect(p.content).toContain('sub detail banana');
        expect(p.content).not.toContain('## Beta');
    });

    it('scope=section by block id works', async () => {
        const { p } = await read({ scope: 'section', anchor: 'h-g' });
        expect(p.content).toContain('## Gamma');
        expect(p.content).toContain('last para');
        expect(p.content).not.toContain('## Beta');
    });

    it('scope=range returns an inclusive block-id range', async () => {
        const { p } = await read({ scope: 'range', startId: 'h-b', endId: 'p-3' });
        expect(p.content).toContain('## Beta');
        expect(p.content).toContain('beta para keyword cherry');
        expect(p.content).not.toContain('item one');
        expect(p.content).not.toContain('## Alpha');
    });

    it('scope=range with open end reads to document end', async () => {
        const { p } = await read({ scope: 'range', startId: 'h-g' });
        expect(p.content).toContain('## Gamma');
        expect(p.content).toContain('last para');
    });

    it('scope=keyword matches blocks and merges OR branches', async () => {
        const { p } = await read({ scope: 'keyword', pattern: 'banana|cherry' });
        expect(p.content).toContain('sub detail banana');
        expect(p.content).toContain('beta para keyword cherry');
        expect(p.content).not.toContain('intro para');
    });

    it('scope=keyword applies contextBefore/contextAfter', async () => {
        const { p } = await read({ scope: 'keyword', pattern: 'keyword', contextBefore: 1, contextAfter: 0 });
        // 'keyword' hits p-1 and p-3; contextBefore pulls the block before each hit
        expect(p.content).toContain('## Alpha');
        expect(p.content).toContain('intro para alpha keyword apple');
        expect(p.content).toContain('beta para keyword cherry');
    });

    it('returns blockRefs when includeBlockIds=true', async () => {
        const { p } = await read({ scope: 'keyword', pattern: 'cherry', includeBlockIds: true });
        expect(Array.isArray(p.blockRefs)).toBe(true);
        expect(p.blockRefs.some((r: { id: string }) => r.id === 'p-3')).toBe(true);
    });

    it('rejects section without anchor at validation', async () => {
        const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', scope: 'section' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('anchor');
    });

    it('rejects range without startId at validation', async () => {
        const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', scope: 'range' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('start-id');
    });

    it('rejects keyword without pattern at validation', async () => {
        const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', scope: 'keyword' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('pattern');
    });

    it('reports a clear error for an unknown section anchor', async () => {
        const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', scope: 'section', anchor: 'NOPE' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('No heading matches');
    });

    it('reports a clear error when end-id precedes start-id', async () => {
        const r = await callDocumentTool(makeClient(), { action: 'read', id: 'doc-1', scope: 'range', startId: 'h-g', endId: 'h-a' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('before start-id');
    });
});

describe('document.append / document.prepend', () => {
    function writeClient(calls: Array<[string, unknown]>) {
        return createMockClient({
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                calls.push([endpoint, body]);
                if (endpoint === '/api/block/getDocInfo') {
                    return { id: body?.id, rootID: 'doc-1', box: 'nb-1', path: '/doc-1.sy' };
                }
                if (endpoint === '/api/filetree/getPathByID') {
                    return { notebook: 'nb-1', path: '/doc-1.sy' };
                }
                if (endpoint === '/api/notebook/lsNotebooks') {
                    return { notebooks: [{ id: 'nb-1', name: 'Notebook', closed: false }] };
                }
                if (endpoint === '/api/filetree/getIDsByHPath') return ['doc-1'];
                if (endpoint === '/api/query/sql') return [];
                if (endpoint === '/api/block/appendBlock') return [{ id: 'new-tail' }];
                if (endpoint === '/api/block/prependBlock') return [{ id: 'new-head' }];
                if (endpoint === '/api/filetree/getHPathByID') return '/Doc 1';
                return null;
            }),
        });
    }

    it('append by id calls appendBlock on the document', async () => {
        const calls: Array<[string, unknown]> = [];
        const r = await callDocumentTool(writeClient(calls), { action: 'append', id: 'doc-1', dataType: 'markdown', data: 'tail' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(p.id).toBe('doc-1');
        const call = calls.find(([e]) => e === '/api/block/appendBlock');
        expect(call?.[1]).toMatchObject({ parentID: 'doc-1', dataType: 'markdown' });
    });

    it('append by notebook + hpath resolves the doc id then appends', async () => {
        const calls: Array<[string, unknown]> = [];
        const r = await callDocumentTool(writeClient(calls), { action: 'append', notebook: 'nb-1', hpath: '/Doc 1', dataType: 'markdown', data: 'tail' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(calls.some(([e]) => e === '/api/filetree/getIDsByHPath')).toBe(true);
        expect(calls.some(([e]) => e === '/api/block/appendBlock')).toBe(true);
    });

    it('append accepts hPath alias', async () => {
        const calls: Array<[string, unknown]> = [];
        const r = await callDocumentTool(writeClient(calls), { action: 'append', notebook: 'nb-1', hPath: '/Doc 1', dataType: 'markdown', data: 'tail' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
    });

    it('prepend by notebook + hpath calls prependBlock', async () => {
        const calls: Array<[string, unknown]> = [];
        const r = await callDocumentTool(writeClient(calls), { action: 'prepend', notebook: 'nb-1', hpath: '/Doc 1', dataType: 'markdown', data: 'head' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        const call = calls.find(([e]) => e === '/api/block/prependBlock');
        expect(call?.[1]).toMatchObject({ parentID: 'doc-1', dataType: 'markdown' });
    });

    it('rejects when both id and hpath are provided', async () => {
        const r = await callDocumentTool(writeClient([]), { action: 'append', id: 'doc-1', notebook: 'nb-1', hpath: '/Doc 1', dataType: 'markdown', data: 'x' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('not both');
    });

    it('rejects when neither id nor hpath is provided', async () => {
        const r = await callDocumentTool(writeClient([]), { action: 'append', dataType: 'markdown', data: 'x' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('locate the target document');
    });

    it('returns not_found when hpath resolves to no document', async () => {
        const cl = createMockClient({
            request: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [{ id: 'nb-1', name: 'N', closed: false }] };
                if (endpoint === '/api/filetree/getIDsByHPath') return [];
                if (endpoint === '/api/query/sql') return [];
                return null;
            }),
        });
        const r = await callDocumentTool(cl, { action: 'append', notebook: 'nb-1', hpath: '/Missing', dataType: 'markdown', data: 'x' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.error?.type).toBe('not_found');
    });
});

describe('document.create --template', () => {
    function tplClient(calls: Array<[string, unknown]>) {
        return createMockClient({
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                calls.push([endpoint, body]);
                if (endpoint === '/api/template/search') return { templates: [{ path: '/data/templates/eval.md', content: 'x' }], k: 'eval' };
                if (endpoint === '/api/filetree/createDocWithMd') return 'doc-new';
                if (endpoint === '/api/filetree/getHPathByID') return '/Doc';
                return null;
            }),
            // readTemplateSource uses fetch against client baseUrl + staticPath
            requestRead: undefined,
        });
    }

    it('rejects markdown + template together', async () => {
        const r = await callDocumentTool(tplClient([]), { action: 'create', notebook: 'nb-1', path: '/D', markdown: 'inline', template: 'eval.md' }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('not both');
    });

    it('returns template_error for an unknown template path', async () => {
        const cl = createMockClient({
            request: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/template/search') return { templates: [], k: '' };
                if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [{ id: 'nb-1', name: 'N', closed: false }] };
                return null;
            }),
        });
        const r = await callDocumentTool(cl, { action: 'create', notebook: 'nb-1', path: '/D', template: 'missing.md' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.error?.type).toBe('template_error');
    });
});
