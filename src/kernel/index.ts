/*
 * SiYuan kernel petal entry (kernel.js).
 *
 * Runs inside the kernel's goja JS sandbox and exposes the write-coordinated
 * tool dispatcher over /plugin/private/<name>/*.
 *
 * Important: we deliberately do NOT import TOOL_REGISTRY / defineTool /
 * callXxxTool. Those modules construct zod action variants at module top
 * level via z.toJSONSchema(), which hangs the goja runtime. Instead we
 * dispatch straight onto the per-category ACTION_HANDLERS maps — the
 * handlers still run their own single-schema zod parse internally, which
 * works fine in goja.
 *
 * The write path goes through WriteSafetyCoordinator so strict mode
 * (preflight hash, idempotency lease, post-write readback) is identical to
 * the desktop mcp-server.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import './polyfill';
declare const siyuan: any;

// Runs inside the kernel goja sandbox; mark the transport so the shared
// lifecycle (analytics/puppy/token) tags these calls and awaits storage writes.
process.env.SIYUAN_MCP_TRANSPORT = 'kernel';

import { KernelSiYuanClient } from './client';
import { PermissionManager } from '../core/permissions';
import { WriteSafetyCoordinator } from '../core/write-safety-coordinator';
import { buildDefaultToolConfig } from '../core/config';
import { runToolCall } from '../core/tool-lifecycle';
import { translateError } from '../tools/internal/errorTranslation';
import type { ToolResult } from '../tools/internal/shared';
// Plain JSON baked at build time by scripts/gen-kernel-schemas.mjs — the goja
// sandbox never runs z.toJSONSchema; it only embeds this static data.
import kernelSchemas from './generated/kernel-schemas.json';

import { NOTEBOOK_ACTION_HANDLERS } from '../tools/notebook/handlers';
import { FS_ACTION_HANDLERS } from '../tools/fs/handlers';
import { DOCUMENT_ACTION_HANDLERS } from '../tools/document/handlers';
import { BLOCK_ACTION_HANDLERS } from '../tools/block/handlers';
import { AV_ACTION_HANDLERS } from '../tools/av/handlers';
import { SEARCH_ACTION_HANDLERS } from '../tools/search/handlers';
import { SYSTEM_ACTION_HANDLERS } from '../tools/system/handlers';
import { FLASHCARD_ACTION_HANDLERS } from '../tools/flashcard/handlers';
import { createFileActionHandlers, DEFAULT_LARGE_UPLOAD_THRESHOLD_MB } from '../tools/file/handlers';
import { TAG_ACTION_HANDLERS } from '../tools/tag/handlers';
import { TIMELINE_ACTION_HANDLERS } from '../tools/timeline/handlers';
import { MASCOT_ACTION_HANDLERS } from '../tools/mascot/handlers';
import { FEEDBACK_ACTION_HANDLERS } from '../tools/feedback/handlers';

const CONFIG_PATH = 'mcpHttpSettings';
const PLUGIN_NAME = 'siyuan-plugins-mcp-sisyphus';
const PROTOCOL_VERSION = '2025-03-26';

type HandlerMap = Record<string, (ctx: any) => Promise<ToolResult>>;

function buildHandlerMap(config: any): Record<string, HandlerMap> {
    const fileThresholdMB = config?.file?.uploadLargeFileThresholdMB ?? DEFAULT_LARGE_UPLOAD_THRESHOLD_MB;
    return {
        notebook: NOTEBOOK_ACTION_HANDLERS as HandlerMap,
        fs: FS_ACTION_HANDLERS as HandlerMap,
        document: DOCUMENT_ACTION_HANDLERS as HandlerMap,
        block: BLOCK_ACTION_HANDLERS as HandlerMap,
        av: AV_ACTION_HANDLERS as HandlerMap,
        search: SEARCH_ACTION_HANDLERS as HandlerMap,
        system: SYSTEM_ACTION_HANDLERS as HandlerMap,
        flashcard: FLASHCARD_ACTION_HANDLERS as HandlerMap,
        file: createFileActionHandlers(fileThresholdMB, fileThresholdMB * 1024 * 1024) as HandlerMap,
        tag: TAG_ACTION_HANDLERS as HandlerMap,
        timeline: TIMELINE_ACTION_HANDLERS as HandlerMap,
        mascot: MASCOT_ACTION_HANDLERS as HandlerMap,
        feedback: FEEDBACK_ACTION_HANDLERS as HandlerMap,
    };
}

/* ---------- runtime ---------- */

let client: KernelSiYuanClient | null = null;
let permMgr: PermissionManager | null = null;
let coordinator: WriteSafetyCoordinator | null = null;
let config: any = null;
let handlerMap: Record<string, HandlerMap> | null = null;

async function ensureRuntime() {
    if (!client) {
        client = new KernelSiYuanClient();
        permMgr = new PermissionManager(client as any);
        try { await permMgr.load(); } catch { /* default rwd */ }
        coordinator = new WriteSafetyCoordinator(client as any);
        try {
            const raw = await client.readFile('/data/storage/petal/' + PLUGIN_NAME + '/mcpToolsConfig');
            config = normalizeConfig(raw ? JSON.parse(raw) : null);
        } catch {
            config = buildDefaultToolConfig();
        }
        handlerMap = buildHandlerMap(config);
    }
    return { client, permMgr: permMgr!, coordinator: coordinator!, config, handlerMap: handlerMap! };
}

function normalizeConfig(raw: any): any {
    const base = buildDefaultToolConfig();
    if (!raw || typeof raw !== 'object') return base;
    for (const key of Object.keys(base)) {
        if (raw[key] && typeof raw[key] === 'object') base[key] = { ...base[key], ...raw[key] };
    }
    if (raw.writeSafety && typeof raw.writeSafety.strictMode === 'boolean') {
        base.writeSafety.strictMode = raw.writeSafety.strictMode;
    }
    return base;
}

async function readKernelConfig(): Promise<{ kernelEndpointEnabled?: boolean }> {
    try {
        const obj = await siyuan.storage.get(CONFIG_PATH);
        if (!obj) return {};
        const text = await obj.text();
        const parsed = JSON.parse(text);
        return typeof parsed === 'object' && parsed ? parsed : {};
    } catch { return {}; }
}

/* ---------- JSON-RPC ---------- */

function jsonRpcResult(id: unknown, result: unknown): any {
    return { statusCode: 200, headers: { 'Content-Type': ['application/json'] }, body: { data: { type: 'JSON', data: { jsonrpc: '2.0', id: id ?? null, result } } } };
}
function jsonRpcError(id: unknown, code: number, message: string): any {
    return { statusCode: 200, headers: { 'Content-Type': ['application/json'] }, body: { data: { type: 'JSON', data: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } } } };
}
function plainResponse(statusCode: number, data: unknown): any {
    return { statusCode, headers: { 'Content-Type': ['application/json'] }, body: { data: { type: 'JSON', data } } };
}
function toolResultToMcp(result: ToolResult): Record<string, unknown> {
    const out: Record<string, unknown> = { content: result.content, ...(result.isError ? { isError: true } : {}) };
    if (result.structuredContent && typeof result.structuredContent === 'object') out.structuredContent = result.structuredContent;
    return out;
}

/* ---------- dispatch ---------- */

const TOOL_TO_CATEGORY: Record<string, string> = {
    fs: 'fs', notebook: 'notebook', document: 'document', block: 'block', av: 'av',
    file: 'file', search: 'search', tag: 'tag', timeline: 'timeline',
    system: 'system', flashcard: 'flashcard', extension: 'extension', mascot: 'mascot', feedback: 'feedback',
};

/*
 * Serialize storage writes inside the kernel realm. The desktop server appends
 * analytics.jsonl from a single Node process; the kernel serves every request
 * on the same goja handler, so concurrent tools/call could interleave their
 * read-modify-write and clobber the file. A module-level promise chain keeps
 * writes ordered without needing any host lock primitive.
 */
let kernelStorageQueue: Promise<unknown> = Promise.resolve();
function enqueueKernelWork<T>(fn: () => Promise<T>): Promise<T> {
    const next = kernelStorageQueue.then(fn, fn);
    kernelStorageQueue = next.catch(() => { /* keep the chain alive */ });
    return next;
}

const OFFICIAL_MCP_PROTOCOL = '2025-03-26';
let officialSessionId: string | null = null;
let officialSessionInit: Promise<string> | null = null;

function headerValue(headers: unknown, name: string): string | null {
    if (!headers || typeof headers !== 'object') return null;
    const want = name.toLowerCase();
    for (const [key, val] of Object.entries(headers as Record<string, unknown>)) {
        if (key.toLowerCase() !== want) continue;
        if (Array.isArray(val)) return typeof val[0] === 'string' ? val[0] : null;
        return typeof val === 'string' ? val : null;
    }
    return null;
}

async function rawMcpPost(body: Record<string, unknown>, sessionId?: string): Promise<{ resp: any; raw: string }> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const resp = await siyuan.client.fetch('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    let raw = '';
    try { raw = typeof resp?.text === 'function' ? await resp.text() : ''; } catch { raw = ''; }
    if (raw === '' && typeof resp?.json === 'function') {
        try { raw = JSON.stringify(await resp.json()); } catch { raw = ''; }
    }
    return { resp, raw };
}

async function openOfficialSession(): Promise<string> {
    const { resp, raw } = await rawMcpPost({
        jsonrpc: '2.0', id: 'init', method: 'initialize',
        params: { protocolVersion: OFFICIAL_MCP_PROTOCOL, capabilities: {}, clientInfo: { name: 'siyuan-sisyphus-kernel', version: '1.0.0' } },
    });
    const sid = headerValue(resp?.headers, 'mcp-session-id');
    if (!sid) throw new Error('kernel /mcp initialize did not return Mcp-Session-Id. body=' + String(raw).slice(0, 200));
    try {
        await rawMcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
    } catch { /* best-effort */ }
    return sid;
}

async function ensureOfficialSession(): Promise<string> {
    if (officialSessionId) return officialSessionId;
    if (!officialSessionInit) {
        officialSessionInit = openOfficialSession()
            .then((sid) => { officialSessionId = sid; return sid; })
            .finally(() => { officialSessionInit = null; });
    }
    return officialSessionInit;
}

/*
 * Stateful MCP-over-HTTP pass-through to the kernel's own /mcp endpoint.
 * SiYuan's /mcp runs the official StreamableHTTP handler in STATEFUL mode —
 * a bare tools/call POST is rejected. Run initialize -> Mcp-Session-Id ->
 * notifications/initialized -> method. Session id is cached module-wide and
 * rebuilt transparently when the kernel drops it.
 */
async function forwardOfficialMcp(method: string, params: Record<string, unknown>): Promise<unknown> {
    const attempt = async (): Promise<unknown> => {
        const sid = await ensureOfficialSession();
        const { raw } = await rawMcpPost({ jsonrpc: '2.0', id: 1, method, params }, sid);
        const payload = extractJsonRpcPayload(raw);
        if (payload === null || payload === undefined) {
            throw new Error('empty/unparseable /mcp response: ' + String(raw).slice(0, 200));
        }
        return payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
            ? (payload as { data: unknown }).data
            : payload;
    };
    try {
        return await attempt();
    } catch (first) {
        officialSessionId = null;
        try {
            return await attempt();
        } catch (second) {
            return { isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'forward_error', message: second instanceof Error ? second.message : String(second) } }) }] };
        }
    }
}

function extractJsonRpcPayload(raw: string): unknown {
    const text = (raw ?? '').trim();
    if (text === '') return null;
    try {
        return JSON.parse(text);
    } catch {
        // SSE stream: take the last data: line.
        let last: string | null = null;
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (t.startsWith('data:')) last = t.slice(5).trim();
        }
        if (last) {
            try { return JSON.parse(last); } catch { return null; }
        }
        return null;
    }
}

function isActionEnabled(cfg: any, category: string, action: string): boolean {
    const actions = cfg?.[category]?.actions;
    if (!actions || typeof actions !== 'object') return true;
    const flag = actions[action];
    return flag !== false;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { client: c, permMgr: pm, coordinator: coord, config: cfg, handlerMap: hm } = await ensureRuntime();
    const category = TOOL_TO_CATEGORY[name];
    const action = typeof args?.action === 'string' ? args.action : '';
    const errResult = (code: string, message: string): Record<string, unknown> => ({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }],
    });

    // extension tools are registered dynamically on the kernel /mcp endpoint;
    // there is no static handler map for them, forward instead.
    if (category === 'extension') {
        const forwarded = await forwardOfficialMcp('tools/call', { name: action || name, arguments: args?.arguments ?? {} });
        return (forwarded ?? { isError: true, content: [{ type: 'text', text: '{}' }] }) as Record<string, unknown>;
    }

    const handlers = category ? hm[category] : undefined;
    const handler = handlers?.[action];
    if (!category || !handlers) return errResult('unknown_tool', `Unknown tool '${name}'`);
    if (!action || !handler) return errResult('unknown_action', `Unknown action '${action}' on tool '${name}'`);
    if (!isActionEnabled(cfg, category, action)) {
        return errResult('action_disabled', `Action '${action}' on tool '${name}' is disabled in Sisyphus settings.`);
    }

    const strictMode = !!cfg?.writeSafety?.strictMode;
    // Route through the shared tool lifecycle so analytics / token metering /
    // puppy events / slim responses behave identically to the desktop server.
    const result = await enqueueKernelWork(() =>
        runToolCall(
            {
                client: c as any,
                category: category as any,
                name,
                action,
                args,
                slimResponses: cfg?.debug?.slimResponses,
            },
            () => coord.run({
                client: c as any,
                permMgr: pm,
                category: category as any,
                action,
                args: args ?? {},
                strictMode,
                execute: (safeArgs) => handler({ client: c, rawArgs: safeArgs, permMgr: pm }),
            }),
        ).catch((error) => {
            const translated = translateError(error instanceof Error ? error : new Error(String(error)));
            const message = translated ? `${translated.code}: ${translated.hint}` : (error instanceof Error ? error.message : String(error));
            return {
                isError: true,
                content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: translated?.code ?? 'handler_error', message } }) }],
            } as ToolResult;
        }),
    );
    return toolResultToMcp(result as ToolResult);
}

/* ---------- MCP method router ---------- */

async function handleMcp(request: any): Promise<any> {
    let rpc: any;
    try {
        const data = request?.request?.body?.data;
        const text = data && typeof data.text === 'function' ? await data.text() : null;
        rpc = text ? JSON.parse(text) : null;
    } catch { return jsonRpcError(null, -32700, 'Parse error'); }
    if (!rpc || typeof rpc !== 'object') return jsonRpcError(null, -32600, 'Invalid Request');
    const { id, method, params } = rpc;

    switch (method) {
        case 'initialize':
            return jsonRpcResult(id, {
                protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'siyuan-sisyphus-kernel', version: siyuan.plugin?.version ?? '0.0.0' },
            });
        case 'notifications/initialized':
        case 'initialized':
            return { statusCode: 202, headers: {}, body: null };
        case 'ping':
            return jsonRpcResult(id, {});
        case 'tools/list': {
            const { config: cfg } = await ensureRuntime();
            // Static categories come from the build-time schema manifest
            // (plain JSON — no zod reflection in the sandbox). Filter by the
            // per-category enabled flag just like the desktop listTools does.
            const tools = (kernelSchemas?.tools ?? [])
                .filter((t: any) => cfg?.[TOOL_TO_CATEGORY[t.name]]?.enabled !== false)
                .map((t: any) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
            // extension tools are runtime-discovered; surface them live from
            // the kernel /mcp endpoint so clients see the full set. A discovery
            // failure must not break the static list.
            try {
                const ext = await forwardOfficialMcp('tools/list', {}) as any;
                const extTools = ext?.result?.tools ?? ext?.tools;
                if (cfg?.extension?.enabled !== false && Array.isArray(extTools)) {
                    for (const t of extTools) {
                        if (t && typeof t.name === 'string') {
                            tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema });
                        }
                    }
                }
            } catch { /* extension bridge unavailable — static list stands */ }
            return jsonRpcResult(id, { tools });
        }
        case 'tools/call': {
            const name = params?.name;
            const args = params?.arguments ?? {};
            if (typeof name !== 'string') return jsonRpcError(id, -32602, 'tools/call requires params.name');
            try {
                return jsonRpcResult(id, await callTool(name, args));
            } catch (err) {
                return jsonRpcResult(id, {
                    isError: true,
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'internal', message: err instanceof Error ? err.message : String(err) } }) }],
                });
            }
        }
        default:
            return jsonRpcError(id, -32601, `Method not found: ${String(method)}`);
    }
}

/* ---------- entry ---------- */

async function handleRequest(request: any): Promise<any> {
    const path: string = request?.url?.path ?? '';
    const cfg = await readKernelConfig();
    if (cfg.kernelEndpointEnabled !== true) {
        return plainResponse(503, {
            error: 'kernel_coordinator_disabled',
            message: 'The kernel coordinator endpoint is disabled. Enable "Kernel endpoint" in the plugin HTTP server settings.',
        });
    }
    if (path.endsWith('/health') || path.endsWith('/ping')) {
        return plainResponse(200, { ok: true, plugin: siyuan.plugin?.name ?? 'unknown', version: siyuan.plugin?.version ?? '' });
    }
    return handleMcp(request);
}

siyuan.server.private.http.handler = function (request: any) {
    return handleRequest(request);
};
