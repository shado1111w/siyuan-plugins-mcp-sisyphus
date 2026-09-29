import { todayLocalDate, renderDailyNoteHPath } from '../internal/helpers/dailynote-path';
import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as notebookApi from '../../api/notebook';
import * as searchApi from '../../api/search';
import * as templateApi from '../../api/template';
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
import type { ToolActionHandler } from '../internal/define-tool';
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

export const DAILYNOTE_ACTION_HANDLERS: Record<DailynoteAction, ToolActionHandler> = {
        create: async ({ client, permMgr, rawArgs }) => {
            const parsed = DailynoteCreateSchema.parse(rawArgs);
            const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
            if (denied) return denied;
            const date = parsed.date ?? todayLocalDate();
            const resolved = await resolveDailyNote(client, parsed.notebook, date, { create: true, app: parsed.app });
            let usedTemplate: string | undefined;
            let templateSkipped = false;
            // --template renders a workspace template into the note body, but only when
            // this call actually created the note. Appending a template onto an existing
            // note would duplicate content on every repeat invocation.
            if (parsed.template && !resolved.created) {
                templateSkipped = true;
            } else if (parsed.template && resolved.id) {
                try {
                    const tpl = await templateApi.resolveTemplate(client, parsed.template);
                    const source = await templateApi.readTemplateSource(client, tpl.relativePath ?? tpl.path);
                    const rendered = await templateApi.renderSprig(client, source.markdown);
                    const markdown = await normalizeMarkdownInputRefs(client, rendered, 'dailynote.create');
                    await blockApi.appendBlock(client, 'markdown', markdown, resolved.id);
                    usedTemplate = tpl.relativePath || tpl.path || parsed.template;
                } catch (error) {
                    return createJsonResult({
                        error: {
                            type: 'template_error',
                            message: error instanceof Error ? error.message : String(error),
                            template: parsed.template,
                            hint: 'Resolve the template with file(action="list_templates") and pass its path or relative path to --template.',
                        },
                    });
                }
            }
            return applyUiRefresh(client, createJsonResult({
                success: true,
                notebook: parsed.notebook,
                date,
                ...resolved,
                ...(usedTemplate ? { template: usedTemplate } : {}),
                ...(templateSkipped ? { templateSkipped: true, templateNote: 'Note already existed; --template only renders on first creation.' } : {}),
                ...(resolved.created ? {
                    hint: 'Newly created daily note documents may take a short time to appear in search/list results due to blocktree indexing. Verify via dailynote get before relying on SQL or search-based listing.',
                } : {}),
            }), (resolved.created || usedTemplate) ? [{ type: 'reloadFiletree' }] : []);
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
};

const dailynoteTool = defineTool<DailynoteAction>({
    name: 'dailynote',
    description: '📔 Daily note create/read/write/delete across dates.',
    variants: DAILYNOTE_VARIANTS,
    actionSchema: DailynoteActionSchema,
    aggregateOptions: {
        guidance: DAILYNOTE_GUIDANCE,
        actionHints: DAILYNOTE_ACTION_HINTS,
    },
    handlers: DAILYNOTE_ACTION_HANDLERS,
});

export const listDailynoteTools = dailynoteTool.listTools;
export const callDailynoteTool = dailynoteTool.callTool;
