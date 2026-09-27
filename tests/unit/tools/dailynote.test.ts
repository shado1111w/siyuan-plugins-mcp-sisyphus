import { describe, expect, it, vi } from "vitest";
import { buildDefaultToolConfig } from "@/core/config";
import { callDailynoteTool } from "@/tools/dailynote";
import { createMockClient } from "../../helpers/mock-client";
import { createMockPermissionManager } from "../../helpers/mock-permissions";
import { parseResult } from "../../helpers/parse-result";

const permMgr = createMockPermissionManager();

function dc() {
    const c = buildDefaultToolConfig().dailynote;
    for (const k of Object.keys(c.actions)) c.actions[k] = true;
    return c;
}

function todayDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const NB = 'nb-1';
const CONF = { conf: { dailyNoteSavePath: '/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}', dailyNoteTemplatePath: '' }, box: NB, name: 'nb' };

describe("dailynote handlers", () => {
    it("create for today uses native createDailyNote", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/filetree/createDailyNote') return { id: 'dn-today' };
                if (ep === '/api/filetree/getHPathByID') return '/daily note/2026/09/2026-09-27';
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'create', notebook: NB }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(p.id).toBe('dn-today');
        expect(calls.some(([e]) => e === '/api/filetree/createDailyNote')).toBe(true);
    });

    it("create for past date renders template and creates doc", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                if (ep === '/api/filetree/createDocWithMd') return 'dn-past';
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'create', notebook: NB, date: '2026-09-25' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(p.id).toBe('dn-past');
        expect(p.created).toBe(true);
        // Should have looked up the rendered hPath first
        const lookup = calls.find(([e]) => e === '/api/filetree/getIDsByHPath');
        expect(lookup?.[1]).toMatchObject({ path: '/daily note/2026/09/2026-09-25', notebook: NB });
    });

    it("create returns existed when note already exists", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return ['existing-id'];
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'create', notebook: NB, date: '2026-09-25' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.id).toBe('existing-id');
        expect(p.created).toBe(false);
        expect(p.existed).toBe(true);
    });

    it("get returns existed=false when no note", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'get', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.existed).toBe(false);
        expect(p.id).toBeNull();
        expect(p.hPath).toBe('/daily note/2026/09/2026-09-10');
    });

    it("list queries blocks via SQL and filters by date", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/query/sql') return [
                    { id: 'd1', hpath: '/daily note/2026/09/2026-09-20', path: '/x/2026-09-20.sy' },
                    { id: 'd2', hpath: '/daily note/2026/09/2026-09-25', path: '/x/2026-09-25.sy' },
                    { id: 'd3', hpath: '/daily note/2026/09', path: '/x/dir.sy' },
                ];
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'list', notebook: NB, from: '2026-09-21', to: '2026-09-30' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.total).toBe(1);
        expect(p.items[0].date).toBe('2026-09-25');
        // dir row (no date basename) is excluded
        expect(p.items.some((i: { hPath: string }) => i.hPath.endsWith('/09'))).toBe(false);
    });

    it("append today delegates to appendDailyNoteBlock", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/block/appendDailyNoteBlock') return { transactions: [] };
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'append', notebook: NB, dataType: 'markdown', data: '- test' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(calls.some(([e]) => e === '/api/block/appendDailyNoteBlock')).toBe(true);
    });

    it("append past date creates doc then appends via appendBlock", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return ['dn-id'];
                if (ep === '/api/block/appendBlock') return { transactions: [] };
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'append', notebook: NB, date: '2026-09-20', dataType: 'markdown', data: '- note' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        const append = calls.find(([e]) => e === '/api/block/appendBlock');
        expect(append?.[1]).toMatchObject({ parentID: 'dn-id' });
    });

    it("prepend today delegates to prependDailyNoteBlock", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                return null;
            }),
        });
        await callDailynoteTool(cl, { action: 'prepend', notebook: NB, dataType: 'markdown', data: '# top' }, dc(), permMgr);
        expect(calls.some(([e]) => e === '/api/block/prependDailyNoteBlock')).toBe(true);
    });

    it("read resolves note then calls getDoc", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return ['dn-id'];
                if (ep === '/api/filetree/getDoc') return { content: 'doc content', id: 'dn-id' };
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'read', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.existed).toBe(true);
        expect(p.id).toBe('dn-id');
        expect(p.content.content).toBe('doc content');
        const getDoc = calls.find(([e]) => e === '/api/filetree/getDoc');
        expect(getDoc?.[1]).toMatchObject({ id: 'dn-id' });
    });

    it("read returns null content for missing note", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'read', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.existed).toBe(false);
        expect(p.content).toBeNull();
    });

    it("delete removes the note doc", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return ['dn-id'];
                if (ep === '/api/filetree/removeDocByID') return null;
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'delete', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(true);
        expect(calls.some(([e]) => e === '/api/filetree/removeDocByID')).toBe(true);
    });

    it("delete reports warning when no note exists", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'delete', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.success).toBe(false);
        expect(p.warning).toBeTruthy();
    });

    it("rejects invalid date format", async () => {
        const cl = createMockClient();
        const r = await callDailynoteTool(cl, { action: 'get', notebook: NB, date: '2026/09/25' }, dc(), permMgr);
        // zod validation error surfaces as error result
        const text = JSON.stringify(r);
        expect(text).toMatch(/YYYY-MM-DD|error/i);
    });

    it("rejects notebook without dailyNoteSavePath", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string) => {
                if (ep === '/api/notebook/getNotebookConf') return { conf: { dailyNoteSavePath: '' }, box: NB, name: 'nb' };
                return null;
            }),
        });
        const r = await callDailynoteTool(cl, { action: 'get', notebook: NB, date: '2026-09-10' }, dc(), permMgr);
        const text = JSON.stringify(r);
        expect(text).toMatch(/dailyNoteSavePath|error/i);
    });

    it("create --template renders a workspace template into the note body", async () => {
        const calls: Array<[string, unknown]> = [];
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                calls.push([ep, body]);
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                if (ep === '/api/filetree/createDocWithMd') return 'dn-tpl';
                if (ep === '/api/filetree/getHPathByID') return '/daily note/2026/09/2026-09-20';
                if (ep === '/api/search/searchTemplate') {
                    return { templates: [{ path: '/data/templates/journal.md', content: 'x' }], k: '' };
                }
                if (ep === '/api/template/renderSprig') return '## Rendered daily template';
                return null;
            }),
        });
        // readTemplateSource uses raw fetch, not client.request — stub it.
        (cl as any).getBaseUrl = () => 'http://127.0.0.1:6806';
        (cl as any).getAuthHeaders = () => ({});
        const fetchStub = vi.fn(async () => ({ ok: true, text: async () => '## {{now}} template' }) as unknown as Response);
        vi.stubGlobal('fetch', fetchStub);
        try {
            const r = await callDailynoteTool(cl, {
                action: 'create', notebook: NB, date: '2026-09-20', template: 'journal.md',
            }, dc(), permMgr);
            const p = parseResult(r);
            expect(p.success).toBe(true);
            expect(p.template).toBe('journal.md');
            expect(calls.some(([e]) => e === '/api/template/renderSprig')).toBe(true);
            expect(calls.some(([e, b]) => e === '/api/block/appendBlock' && (b as any).parentID === 'dn-tpl')).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("create --template surfaces a template_error when the template is missing", async () => {
        const cl = createMockClient({
            request: vi.fn(async (ep: string, body: unknown) => {
                if (ep === '/api/notebook/getNotebookConf') return CONF;
                if (ep === '/api/filetree/getIDsByHPath') return [];
                if (ep === '/api/filetree/createDocWithMd') return 'dn-new';
                if (ep === '/api/filetree/getHPathByID') return '/daily note/2026/09/2026-09-21';
                if (ep === '/api/search/searchTemplate') return { templates: [], k: '' };
                return null;
            }),
        });
        (cl as any).getBaseUrl = () => 'http://127.0.0.1:6806';
        (cl as any).getAuthHeaders = () => ({});
        const r = await callDailynoteTool(cl, {
            action: 'create', notebook: NB, date: '2026-09-21', template: 'nope.md',
        }, dc(), permMgr);
        const p = parseResult(r) as { error?: { type?: string } };
        expect(p.error?.type).toBe('template_error');
    });
});
