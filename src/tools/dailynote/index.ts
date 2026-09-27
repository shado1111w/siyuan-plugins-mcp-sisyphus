import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as notebookApi from '../../api/notebook';
import * as searchApi from '../../api/search';
import type { DailynoteAction } from '../../core/config';
import { DAILYNOTE_ACTION_HINTS, DAILYNOTE_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    DailynoteActionSchema,
    DailynoteAppendSchema,
    DailynoteCreateSchema,
    DailynoteDeleteSchema,
    DailynoteGetSchema,
    DailynoteListSchema,
    DailynotePrependSchema,
    DailynoteReadSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { normalizeMarkdownInputRefs } from '../internal/markdown-input';
import { normalizeDomInlineRefsAndTags } from '../internal/kramdown-safe';
import { ensurePermissionForNotebook } from '../internal/context';
import {
    createJsonResult,
    createZodActionVariant,
    type ActionVariant,
    type ToolResult,
} from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

export const DAILYNOTE_TOOL_NAME = 'dailynote';

export const DAILYNOTE_VARIANTS: ActionVariant<DailynoteAction>[] = [
    createZodActionVariant('create', DailynoteCreateSchema, 'Create (or open) the daily note for a notebook + date.'),
    createZodActionVariant('get', DailynoteGetSchema, 'Resolve the daily note id/hPath for a date without creating it.'),
    createZodActionVariant('list', DailynoteListSchema, 'List daily notes under the notebook dailyNoteSavePath prefix.'),
    createZodActionVariant('read', DailynoteReadSchema, 'Read the daily note document content for a date.'),
    createZodActionVariant('append', DailynoteAppendSchema, 'Append content to the daily note for a date.'),
    createZodActionVariant('prepend', DailynotePrependSchema, 'Prepend content to the daily note for a date.'),
    createZodActionVariant('delete', DailynoteDeleteSchema, 'Delete the daily note document for a date.'),
];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GO_DATE_LAYOUT_RE = /\{\{\s*now\s*\|\s*date\s*"([^"]+)"\s*\}\}/g;

function todayLocalDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDate(date: string): Date {
    const [y, m, d] = date.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(y, m - 1, d);
}

function formatGoDate(layout: string, date: Date): string {
    // Go reference time: Mon Jan 2 15:04:05 MST 2006.
    // Tokenize once and longest-match first so replacements cannot re-match.
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const pad3 = (n: number) => String(n).padStart(3, '0');
    const pad4 = (n: number) => String(n).padStart(4, '0');
    const mo = date.getMonth() + 1;
    const d = date.getDate();
    const monthLong = new Intl.DateTimeFormat('en', { month: 'long' }).format(date);
    const monthShort = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
    const tokens: Array<[string, string]> = [
        ['January', monthLong],
        ['Jan', monthShort],
        ['Monday', new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date)],
        ['Mon', new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date)],
        ['2006', pad4(date.getFullYear())],
        ['06', String(date.getFullYear()).slice(-2)],
        ['01', pad2(mo)],
        ['02', pad2(d)],
        ['_2', ` ${d}`],
        ['15', pad2(date.getHours())],
        ['03', pad2(0)],   // 12-hour clock hour (rare in save paths; kept for parity)
        ['04', pad2(date.getMinutes())],
        ['05', pad2(date.getSeconds())],
        ['PM', date.getHours() >= 12 ? 'PM' : 'AM'],
        ['pm', date.getHours() >= 12 ? 'pm' : 'am'],
        ['MST', 'CST'],
    ];
    // Sort longest first to avoid '01' matching inside '2006'.
    const sorted = [...tokens].sort((a, b) => b[0].length - a[0].length);
    let out = '';
    let i = 0;
    while (i < layout.length) {
        let matched = false;
        for (const [token, replacement] of sorted) {
            if (layout.startsWith(token, i)) {
                out += replacement;
                i += token.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            out += layout[i];
            i += 1;
        }
    }
    return out;
}

function renderDailyNoteHPath(savePathTemplate: string, date: string): string | null {
    const target = parseDate(date);
    let rendered = savePathTemplate;
    let match: RegExpExecArray | null;
    const re = new RegExp(GO_DATE_LAYOUT_RE.source, 'g');
    while ((match = re.exec(savePathTemplate)) !== null) {
        const layout = match[1];
        rendered = rendered.replace(match[0], formatGoDate(layout, target));
    }
    // Still contains other Go template expressions we cannot render locally.
    if (rendered.includes('{{')) return null;
    if (!rendered.startsWith('/')) rendered = `/${rendered}`;
    return rendered.replace(/\/+$/, '') || '/';
}

function dailyNoteStaticPrefix(savePathTemplate: string): string {
    const idx = savePathTemplate.indexOf('{{');
    const prefix = idx === -1 ? savePathTemplate : savePathTemplate.slice(0, idx);
    const cut = prefix.lastIndexOf('/');
    const dir = cut <= 0 ? '/' : prefix.slice(0, cut);
    return dir === '' ? '/' : dir;
}

interface ResolvedDailyNote {
    id: string;
    hPath: string;
    existed: boolean;
    created: boolean;
}

async function getNotebookDailyNoteConf(client: SiYuanClient, notebook: string) {
    const conf = await notebookApi.getNotebookConf(client, notebook);
    return conf.conf;
}

async function resolveDailyNote(
    client: SiYuanClient,
    notebook: string,
    date: string,
    options: { create?: boolean; app?: string } = {},
): Promise<ResolvedDailyNote | { existed: false; id: null; hPath: string | null; created: false }> {
    const isToday = date === todayLocalDate();

    if (isToday && options.create) {
        const created = await documentApi.createDailyNote(client, notebook, options.app);
        let hPath: string | undefined;
        try {
            hPath = await documentApi.getHPathByID(client, created.id);
        } catch {
            hPath = undefined;
        }
        return { id: created.id, hPath: hPath ?? '', existed: true, created: false };
    }

    const conf = await getNotebookDailyNoteConf(client, notebook);
    const savePathTemplate = conf?.dailyNoteSavePath;
    if (!savePathTemplate || savePathTemplate === '/') {
        if (isToday) {
            // Kernel would also fail; surface a clear hint.
            throw new Error('This notebook does not have dailyNoteSavePath configured. Set it in notebook settings first.');
        }
        throw new Error('This notebook does not have dailyNoteSavePath configured; only the note for today can be resolved via the native API.');
    }

    const hPath = renderDailyNoteHPath(savePathTemplate, date);
    if (hPath === null) {
        if (isToday) {
            if (!options.create) {
                // Fall back to the native API which resolves the path for us.
                const created = await documentApi.createDailyNote(client, notebook, options.app);
                let resolvedHPath: string | undefined;
                try {
                    resolvedHPath = await documentApi.getHPathByID(client, created.id);
                } catch {
                    resolvedHPath = undefined;
                }
                return { id: created.id, hPath: resolvedHPath ?? '', existed: true, created: false };
            }
            const created = await documentApi.createDailyNote(client, notebook, options.app);
            let resolvedHPath: string | undefined;
            try {
                resolvedHPath = await documentApi.getHPathByID(client, created.id);
            } catch {
                resolvedHPath = undefined;
            }
            return { id: created.id, hPath: resolvedHPath ?? '', existed: true, created: false };
        }
        throw new Error(`dailyNoteSavePath template uses unsupported expressions and cannot be rendered for ${date}: ${savePathTemplate}`);
    }

    const ids = await documentApi.getIDsByHPath(client, hPath, notebook);
    if (ids.length > 0) {
        return { id: ids[0], hPath, existed: true, created: false };
    }

    if (!options.create) {
        return { existed: false, id: null, hPath, created: false };
    }

    const id = await documentApi.createDoc(client, notebook, `${hPath}`, '');
    // createDocWithMd expects a markdown content arg; empty content keeps a bare doc.
    return { id, hPath, existed: true, created: true };
}

async function normalizeWriteData(client: SiYuanClient, dataType: 'markdown' | 'dom', data: string, actionName: string): Promise<string> {
    if (dataType === 'dom') {
        return normalizeDomInlineRefsAndTags(data, actionName);
    }
    return normalizeMarkdownInputRefs(client, data, actionName);
}

function dateInRange(hPath: string, from?: string, to?: string): string | null {
    const base = hPath.split('/').filter(Boolean).pop() ?? '';
    const m = base.match(/(\d{4})[-_\/]?(\d{2})[-_\/]?(\d{2})/);
    if (!m) return null;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (from && date < from) return null;
    if (to && date > to) return null;
    return date;
}

async function listDailyNotesViaSql(
    client: SiYuanClient,
    notebook: string,
    hPathPrefix: string,
    from?: string,
    to?: string,
): Promise<Array<{ id: string; hPath: string; path: string; date: string }>> {
    // Document blocks carry hpath; filter to the static prefix of dailyNoteSavePath.
    const stmt = `SELECT id, hpath, path FROM blocks WHERE type='d' AND box='${notebook}' AND hpath LIKE '${hPathPrefix.replace(/'/g, "''")}%' ORDER BY hpath LIMIT 500`;
    const rows = await searchApi.querySQL(client, stmt);
    const out: Array<{ id: string; hPath: string; path: string; date: string }> = [];
    for (const row of rows) {
        const r = row as { id?: string; hpath?: string; path?: string };
        const hPath = r.hpath ?? '';
        const date = dateInRange(hPath, from, to);
        if (!date) continue;
        out.push({ id: r.id ?? '', hPath, path: r.path ?? '', date });
    }
    return out;
}

const dailynoteTool = defineTool<DailynoteAction>({
    name: 'dailynote',
    description: '📔 Daily note create/read/write/delete across dates.',
    variants: DAILYNOTE_VARIANTS,
    actionSchema: DailynoteActionSchema,
    aggregateOptions: {
        guidance: DAILYNOTE_GUIDANCE,
        actionHints: DAILYNOTE_ACTION_HINTS,
    },
    handlers: {
        create: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteCreateSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: true, app: parsed.app });
            return applyUiRefresh(client, createJsonResult({
                success: true,
                notebook: parsed.notebook,
                date,
                ...resolved,
                ...(resolved.created ? {
                    hint: 'Newly created daily note documents may take a short time to appear in search/list results due to blocktree indexing. Verify via dailynote get before relying on SQL or search-based listing.',
                } : {}),
            }), resolved.created ? [{ type: 'reloadFiletree' }] : []);
        },
        get: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteGetSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: false, app: parsed.app });
            return createJsonResult({
                notebook: parsed.notebook,
                date,
                ...resolved,
            });
        },
        list: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteListSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
            if (denied) return denied;
            const conf = await getNotebookDailyNoteConf(client, parsed.notebook);
            const savePathTemplate = conf?.dailyNoteSavePath;
            if (!savePathTemplate || savePathTemplate === '/') {
                return createJsonResult({
                    notebook: parsed.notebook,
                    items: [],
                    warning: 'This notebook does not have dailyNoteSavePath configured.',
                });
            }
            const prefix = dailyNoteStaticPrefix(savePathTemplate);
            const items = await listDailyNotesViaSql(client, parsed.notebook, prefix, parsed.from, parsed.to);
            const page = parsed.page ?? 1;
            const pageSize = parsed.pageSize ?? 50;
            const start = (page - 1) * pageSize;
            const paged = items.slice(start, start + pageSize);
            return createJsonResult({
                notebook: parsed.notebook,
                staticPrefix: prefix,
                total: items.length,
                page,
                pageSize,
                items: paged,
            });
        },
        read: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteReadSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: false, app: parsed.app });
            if (!resolved.existed || !resolved.id) {
                return createJsonResult({ notebook: parsed.notebook, date, ...resolved, content: null });
            }
            const content = await documentApi.getDoc(client, resolved.id, parsed.mode, parsed.size);
            return createJsonResult({
                notebook: parsed.notebook,
                date,
                ...resolved,
                content,
            });
        },
        append: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteAppendSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const data = await normalizeWriteData(client, parsed.dataType, parsed.data, 'dailynote.append');
            const isToday = date === todayLocalDate();
            if (isToday) {
                const result = await blockApi.appendDailyNoteBlock(client, parsed.notebook, parsed.dataType, data);
                return applyUiRefresh(client, createJsonResult({
                    success: true,
                    action: 'append',
                    notebook: parsed.notebook,
                    date,
                    transactions: result,
                }), [{ type: 'reloadFiletree' }]);
            }
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: true, app: parsed.app });
            if (!resolved.id) {
                throw new Error(`Daily note for ${date} could not be resolved.`);
            }
            const result = await blockApi.appendBlock(client, parsed.dataType, data, resolved.id);
            return applyUiRefresh(client, createJsonResult({
                success: true,
                action: 'append',
                notebook: parsed.notebook,
                date,
                id: resolved.id,
                transactions: result,
            }), [{ type: 'reloadProtyle', id: resolved.id }, { type: 'reloadFiletree' }]);
        },
        prepend: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynotePrependSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const data = await normalizeWriteData(client, parsed.dataType, parsed.data, 'dailynote.prepend');
            const isToday = date === todayLocalDate();
            if (isToday) {
                const result = await blockApi.prependDailyNoteBlock(client, parsed.notebook, parsed.dataType, data);
                return applyUiRefresh(client, createJsonResult({
                    success: true,
                    action: 'prepend',
                    notebook: parsed.notebook,
                    date,
                    transactions: result,
                }), [{ type: 'reloadFiletree' }]);
            }
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: true, app: parsed.app });
            if (!resolved.id) {
                throw new Error(`Daily note for ${date} could not be resolved.`);
            }
            const result = await blockApi.prependBlock(client, parsed.dataType, data, resolved.id);
            return applyUiRefresh(client, createJsonResult({
                success: true,
                action: 'prepend',
                notebook: parsed.notebook,
                date,
                id: resolved.id,
                transactions: result,
            }), [{ type: 'reloadProtyle', id: resolved.id }, { type: 'reloadFiletree' }]);
        },
        delete: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteDeleteSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'delete');
            if (denied) return denied;
            const resolved = await resolveDailyNote(client, parsed.notebook, parsed.date, { create: false, app: parsed.app });
            if (!resolved.existed || !resolved.id) {
                return createJsonResult({
                    success: false,
                    notebook: parsed.notebook,
                    date: parsed.date,
                    ...resolved,
                    warning: 'No daily note exists for this date; nothing was deleted.',
                });
            }
            await documentApi.removeDocByID(client, resolved.id);
            return applyUiRefresh(client, createJsonResult({
                success: true,
                notebook: parsed.notebook,
                date: parsed.date,
                id: resolved.id,
                hPath: resolved.hPath,
            }), [{ type: 'reloadFiletree' }]);
        },
    },
});

export const listDailynoteTools = dailynoteTool.listTools;
export const callDailynoteTool = dailynoteTool.callTool;
