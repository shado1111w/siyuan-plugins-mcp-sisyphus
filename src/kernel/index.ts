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

import { KernelSiYuanClient } from './client';
import { PermissionManager } from '../core/permissions';
import { WriteSafetyCoordinator } from '../core/write-safety-coordinator';
import { buildDefaultToolConfig } from '../core/config';
import type { ToolResult } from '../tools/internal/shared';

import { NOTEBOOK_ACTION_HANDLERS } from '../tools/notebook/handlers';
import { FS_ACTION_HANDLERS } from '../tools/fs/handlers';
import { DOCUMENT_ACTION_HANDLERS } from '../tools/document/handlers';
import { BLOCK_ACTION_HANDLERS } from '../tools/block/handlers';
import { AV_ACTION_HANDLERS } from '../tools/av/handlers';
import { SEARCH_ACTION_HANDLERS } from '../tools/search/handlers';
import { SYSTEM_ACTION_HANDLERS } from '../tools/system/handlers';
import { FLASHCARD_ACTION_HANDLERS } from '../tools/flashcard/handlers';
import { createFileActionHandlers, DEFAULT_LARGE_UPLOAD_THRESHOLD_MB } from '../tools/file/handlers';
import { TAG_ACTION_HANDLERS } from '../tools/tag/index';
import { TIMELINE_ACTION_HANDLERS } from '../tools/timeline/index';
import { MASCOT_ACTION_HANDLERS } from '../tools/mascot/index';
import { FEEDBACK_ACTION_HANDLERS } from '../tools/feedback/index';

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

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { client: c, permMgr: pm, coordinator: coord, config: cfg, handlerMap: hm } = await ensureRuntime();
    const category = TOOL_TO_CATEGORY[name];
    const handlers = category ? hm[category] : undefined;
    const action = typeof args?.action === 'string' ? args.action : '';
    const handler = handlers?.[action];
    const errResult = (code: string, message: string): Record<string, unknown> => ({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }],
    });
    if (!category || !handlers) return errResult('unknown_tool', `Unknown tool '${name}'`);
    if (!action || !handler) return errResult('unknown_action', `Unknown action '${action}' on tool '${name}'`);

    const strictMode = !!cfg?.writeSafety?.strictMode;
    const result = await coord.run({
        client: c as any,
        permMgr: pm,
        category: category as any,
        action,
        args: args ?? {},
        strictMode,
        execute: (safeArgs) => handler({ client: c, rawArgs: safeArgs, permMgr: pm }),
    });
    return toolResultToMcp(result);
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
            const { handlerMap: hm, config: cfg } = await ensureRuntime();
            const tools = Object.keys(TOOL_TO_CATEGORY)
                .filter((n) => hm[TOOL_TO_CATEGORY[n]] && (cfg?.[TOOL_TO_CATEGORY[n]]?.enabled !== false))
                .map((n) => ({ name: n, description: `Sisyphus ${n} operations (kernel endpoint)` }));
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
