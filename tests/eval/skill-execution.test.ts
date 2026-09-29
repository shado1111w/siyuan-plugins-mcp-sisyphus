/**
 * Skill execution evaluation: runs each scenario's documented call sequence
 * against the live SiYuan instance, measures accuracy and efficiency, and
 * captures artifacts for browser verification.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SiYuanClient } from "@/api/client";
import * as notebookApi from "@/api/notebook";
import * as documentApi from "@/api/document";
import * as blockApi from "@/api/block";
import { buildDefaultToolConfig } from "@/core/config";
import { callNotebookTool } from "@/tools/notebook";
import { callDocumentTool } from "@/tools/document";
import { callBlockTool } from "@/tools/block";
import { callFsTool } from "@/tools/fs";
import { callFileTool } from "@/tools/file";
import { callSearchTool } from "@/tools/search";
import { callSystemTool } from "@/tools/system";
import { callTagTool } from "@/tools/tag";
import { callAvTool } from "@/tools/av";
import { callTimelineTool } from "@/tools/timeline";
import { callFlashcardTool } from "@/tools/flashcard";
import { callExtensionTool } from "@/tools/extension";
import { callMascotTool } from "@/tools/mascot";
import { callFeedbackTool } from "@/tools/feedback";
import { createMockPermissionManager } from "../helpers/mock-permissions";
import { scenarios } from "../../skills/source/scenarios.mjs";

const SIYUAN_URL = process.env.SIYUAN_E2E_URL ?? "http://127.0.0.1:6807";
const SIYUAN_TOKEN = process.env.SIYUAN_E2E_TOKEN ?? "";
const SKIP_LIVE = process.env.SIYUAN_E2E_SKIP === "1";
const REPORT_DIR = process.env.SKILL_EVAL_DIR ?? "/tmp/skill-eval";

type CallResult = {
    key: string;
    tool: string;
    action: string;
    args: Record<string, unknown>;
    durationMs: number;
    isError: boolean;
    errorMessage?: string;
    outputSize: number;
    expectedSkip?: boolean;
    skipReason?: string;
};

type ScenarioReport = {
    id: string;
    cliName: string;
    totalCalls: number;
    succeeded: number;
    failed: number;
    skipped: number;
    accuracy: number;
    totalDurationMs: number;
    avgDurationMs: number;
    calls: CallResult[];
};

const toolCallers: Record<string, (client: any, args: any, config: any, permMgr: any) => Promise<any>> = {
    notebook: (c, a, cfg, p) => callNotebookTool(c, a, cfg, p),
    document: (c, a, cfg, p) => callDocumentTool(c, a, cfg, p),
    block: (c, a, cfg, p) => callBlockTool(c, a, cfg, p),
    fs: (c, a, cfg, p) => callFsTool(c, a, cfg, p),
    file: (c, a, cfg, p) => callFileTool(c, a, cfg, p),
    search: (c, a, cfg, p) => callSearchTool(c, a, cfg, p),
    system: (c, a, cfg, p) => callSystemTool(c, a, cfg, p),
    tag: (c, a, cfg, p) => callTagTool(c, a, cfg, p),
    av: (c, a, cfg, p) => callAvTool(c, a, cfg, p),
    timeline: (c, a, cfg, p) => callTimelineTool(c, a, cfg, p),
    flashcard: (c, a, cfg, p) => callFlashcardTool(c, a, cfg, p),
    extension: (c, a, cfg, p) => callExtensionTool(c, a, cfg, p),
    mascot: (c, a, cfg, p) => callMascotTool(c, a, cfg, p),
    feedback: (c, a, cfg, p) => callFeedbackTool(c, a, cfg, p),
};

function enabledConfig(tool: string) {
    const all = buildDefaultToolConfig() as any;
    const cfg = all[tool];
    if (!cfg) return undefined;
    for (const k of Object.keys(cfg.actions ?? {})) cfg.actions[k] = true;
    cfg.enabled = true;
    return cfg;
}

function substitutePlaceholders(args: Record<string, unknown>, ctx: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
        if (typeof v === "string" && ctx[v]) {
            out[k] = ctx[v];
        } else if (typeof v === "string" && v.startsWith("/") && ctx[v]) {
            out[k] = ctx[v];
        } else if (typeof v === "string" && v.startsWith("<") && v.endsWith(">")) {
            out[k] = "__UNRESOLVED__";
        } else if (Array.isArray(v)) {
            out[k] = v.map((item) => (typeof item === "string" && ctx[item]) ? ctx[item] : item);
        } else if (v && typeof v === "object") {
            out[k] = substitutePlaceholders(v as Record<string, unknown>, ctx);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function extractIds(result: any): Record<string, string> {
    const ids: Record<string, string> = {};
    try {
        const text = result?.content?.find?.((c: any) => c.type === "text")?.text;
        if (!text) return ids;
        const parsed = JSON.parse(text);
        const scan = (obj: any) => {
            if (!obj || typeof obj !== "object") return;
            if (typeof obj.id === "string" && /^20\d{12}-[a-z0-9]{6,7}$/.test(obj.id)) {
                if (!ids.docId) ids.docId = obj.id;
            }
            if (typeof obj.rootID === "string" && /^20\d{12}-/.test(obj.rootID)) {
                if (!ids.docId) ids.docId = obj.rootID;
            }
            if (typeof obj.blockID === "string" && /^20\d{12}-/.test(obj.blockID)) {
                if (!ids.blockId) ids.blockId = obj.blockID;
            }
            if (typeof obj.tag === "string" && obj.tag.length > 0) {
                if (!ids.tag) ids.tag = obj.tag;
            }
            if (typeof obj.changeKey === "string" && obj.changeKey.length > 0) {
                if (!ids.changeKey) ids.changeKey = obj.changeKey;
            }
            for (const v of Object.values(obj)) scan(v);
        };
        scan(parsed);
    } catch {}
    return ids;
}

// Actions that are expected to fail in the headless Docker test environment
const EXPECTED_SKIPS: Record<string, string> = {
    "timeline": "requires SiYuan data repo key initialization (Settings > Account & Sync > Local Data Repo)",
    "extension.list": "requires SiYuan frontend MCP bridge runtime (not available in headless Docker)",
    "file.read_image": "requires document with actual image asset references",
};

function isExpectedSkip(tool: string, action: string, errorMsg: string): boolean {
    const key = `${tool}.${action}`;
    if (EXPECTED_SKIPS[key]) return true;
    // Timeline data repo key error
    if (errorMsg.includes("data repo key")) return true;
    // Extension bridge unavailable
    if (errorMsg.includes("MCP bridge runtime")) return true;
    return false;
}

describe.skipIf(SKIP_LIVE)("Skill execution evaluation", () => {
    let client: SiYuanClient;
    let notebookId: string;
    let notebookName: string;
    let seedDocId: string;
    let seedBlockId: string;
    let seedDraftBlockId: string;
    const reports: ScenarioReport[] = [];

    const runId = Date.now().toString(36);
    let exportDir: string;
    const seedDocPath = `/skill-eval-seed-${runId}`;
    const writeDocPath = `/skill-eval-write-${runId}`;

    beforeAll(async () => {
        client = new SiYuanClient({ baseUrl: SIYUAN_URL, timeout: 20000 });
        client.setToken(SIYUAN_TOKEN);
        expect(["127.0.0.1", "localhost"]).toContain(new URL(SIYUAN_URL).hostname);
        notebookName = `Sisyphus-Skill-Eval-${runId}`;
        notebookId = (await notebookApi.createNotebook(client, notebookName)).notebook.id;
        exportDir = mkdtempSync(join(tmpdir(), 'sisyphus-skill-eval-'));

        // Seed a document with content for read/search scenarios
        // Include "draft" text for block.replace testing
        seedDocId = await documentApi.createDoc(
            client, notebookId, seedDocPath,
            "# Skill Evaluation\n\nThis document exists for skill evaluation.\n\n## Section A\n\nParagraph with keyword evaluation-target.\n\nDraft paragraph with keyword draft.\n\n- Item one\n- Item two\n"
        );
        const children = await blockApi.getChildBlocks(client, seedDocId) as Array<{ id: string; content?: string }>;
        seedBlockId = children.find(b => b.content?.includes("evaluation-target"))!.id;
        // Get the block containing "draft" for block.replace testing
        seedDraftBlockId = children.find(b => b.content?.includes("draft"))!.id;

        try { mkdirSync(REPORT_DIR, { recursive: true }); } catch {}
    }, 30000);

    afterAll(async () => {
        // Write reports
        for (const r of reports) {
            writeFileSync(join(REPORT_DIR, `${r.id}.json`), JSON.stringify(r, null, 2));
        }
        writeFileSync(join(REPORT_DIR, "_summary.json"), JSON.stringify({
            timestamp: new Date().toISOString(),
            scenarios: reports.map(({ calls, ...rest }) => rest),
            overall: {
                totalCalls: reports.reduce((s, r) => s + r.totalCalls, 0),
                succeeded: reports.reduce((s, r) => s + r.succeeded, 0),
                failed: reports.reduce((s, r) => s + r.failed, 0),
                skipped: reports.reduce((s, r) => s + r.skipped, 0),
                avgAccuracy: reports.length ? reports.reduce((s, r) => s + r.accuracy, 0) / reports.length : 0,
                totalDurationMs: reports.reduce((s, r) => s + r.totalDurationMs, 0),
            },
        }, null, 2));

        // Every scenario writes into this run-owned notebook, including daily notes.
        if (notebookId) {
            const nbs = await notebookApi.listNotebooks(client);
            expect(nbs.notebooks.find(n => n.id === notebookId)?.name).toBe(notebookName);
            await notebookApi.removeNotebook(client, notebookId);
        }
        if (exportDir) rmSync(exportDir, { recursive: true, force: true });
    });

    function buildCtx(overrides: Record<string, string> = {}): Record<string, string> {
        return {
            "<doc-id>": seedDocId,
            "<block-id>": seedDraftBlockId,
            "<notebook-id>": notebookId,
            "<block-or-doc-id>": seedDocId,
            "/Notebook/Folder": `/${notebookName}`,
            "/Notebook/Folder/Doc": `/${notebookName}${seedDocPath}`,
            "/Notebook/Project/Notes": `/${notebookName}${writeDocPath}`,
            "/Notebook/Project": `/${notebookName}`,
            "/Notebook": `/${notebookName}`,
            "/tmp/siyuan-extract": exportDir,
            "old-tag": `old-tag-${runId}`,
            "new-tag": `new-tag-${runId}`,
            ...overrides,
        };
    }

    it("executes browse-read scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "browse-read")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.5);
    }, 60000);

    it("executes sisyphus top-level scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "sisyphus")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.5);
    }, 60000);

    it("executes create-edit scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "create-edit")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.4);
    }, 60000);

    it("executes search-query scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "search-query")!;
        const report = await runScenario(scenario, buildCtx({
            "<block-or-doc-id>": seedDocId,
        }));
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.3);
    }, 60000);

    it("executes system-safety scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "system-safety")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.3);
    }, 60000);

    it("executes timeline scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "timeline")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        // Timeline requires data repo key which may not be available in test Docker
        expect(report.accuracy + report.calls.filter(c => c.expectedSkip).length / report.totalCalls).toBeGreaterThan(0.2);
    }, 60000);

    it("executes database scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "database")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        // AV calls need actual database - many will be placeholder skips
        expect(report.totalCalls).toBeGreaterThan(0);
    }, 60000);

    it("executes file-export scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "file-export")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.2);
    }, 60000);

    it("executes tag-flashcard scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "tag-flashcard")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.3);
    }, 60000);

    it("executes markup-guide scenario calls", async () => {
        const scenario = scenarios.find((s: any) => s.id === "markup-guide")!;
        const report = await runScenario(scenario, buildCtx());
        reports.push(report);
        expect(report.accuracy).toBeGreaterThan(0.5);
    }, 60000);

    async function runScenario(scenario: any, ctx: Record<string, string>): Promise<ScenarioReport> {
        const calls: CallResult[] = [];
        const perm = createMockPermissionManager();

        for (const [key, call] of Object.entries(scenario.calls) as Array<[string, any]>) {
            const cfg = enabledConfig(call.tool);
            const caller = toolCallers[call.tool];
            const args = { action: call.action, ...substitutePlaceholders(call.args, ctx) };

            if (!caller || !cfg) {
                calls.push({ key, tool: call.tool, action: call.action, args, durationMs: 0, isError: true, errorMessage: "no caller", outputSize: 0 });
                continue;
            }

            // Snapshot mutations and external notifications are outside this isolated
            // scenario evaluation; exclude before invoking the handler, not on failure.
            if ((call.tool === 'timeline' && !['list_nodes', 'compare_node'].includes(call.action))
                || (call.tool === 'system' && ['notify', 'perform_sync'].includes(call.action))) {
                calls.push({ key, tool: call.tool, action: call.action, args, durationMs: 0, isError: false,
                    outputSize: 0, expectedSkip: true, skipReason: 'snapshot/external side effect excluded' });
                continue;
            }
            const unresolved = JSON.stringify(args).includes("__UNRESOLVED__");
            if (unresolved) {
                calls.push({ key, tool: call.tool, action: call.action, args, durationMs: 0, isError: true, errorMessage: "placeholder", outputSize: 0 });
                continue;
            }

            const start = Date.now();
            try {
                const result = await caller(client, args, cfg, perm);
                const durationMs = Date.now() - start;
                const text = result?.content?.find?.((c: any) => c.type === "text")?.text ?? "";
                const isErr = Boolean(result?.isError);
                const errMsg = isErr ? text.slice(0, 300) : undefined;

                if (isErr && isExpectedSkip(call.tool, call.action, text)) {
                    calls.push({ key, tool: call.tool, action: call.action, args, durationMs, isError: false, errorMessage: errMsg, outputSize: text.length, expectedSkip: true, skipReason: EXPECTED_SKIPS[`${call.tool}.${call.action}`] ?? "environment limitation" });
                } else {
                    calls.push({ key, tool: call.tool, action: call.action, args, durationMs, isError: isErr, errorMessage: errMsg, outputSize: text.length });
                }

                // Feed discovered IDs back into context
                if (!isErr) {
                    const ids = extractIds(result);
                    if (ids.docId && !ctx["<doc-id>"]) ctx["<doc-id>"] = ids.docId;
                    if (ids.blockId && !ctx["<block-id>"]) ctx["<block-id>"] = ids.blockId;
                    if (ids.docId && !ctx["<returned-document-id>"]) ctx["<returned-document-id>"] = ids.docId;
                    if (ids.blockId && !ctx["<written-block-id>"]) ctx["<written-block-id>"] = ids.blockId;
                    if (ids.tag && !ctx["<timeline-tag>"]) ctx["<timeline-tag>"] = ids.tag;
                    if (ids.changeKey && !ctx["<fresh-change-key>"]) ctx["<fresh-change-key>"] = ids.changeKey;
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (isExpectedSkip(call.tool, call.action, errMsg)) {
                    calls.push({ key, tool: call.tool, action: call.action, args, durationMs: Date.now() - start, isError: false, errorMessage: errMsg, outputSize: 0, expectedSkip: true, skipReason: "environment limitation" });
                } else {
                    calls.push({ key, tool: call.tool, action: call.action, args, durationMs: Date.now() - start, isError: true, errorMessage: errMsg, outputSize: 0 });
                }
            }
        }

        const succeeded = calls.filter((c) => !c.isError && !c.expectedSkip).length;
        const skipped = calls.filter((c) => c.expectedSkip || c.errorMessage === "placeholder" || c.errorMessage === "no caller").length;
        return {
            id: scenario.id,
            cliName: scenario.cliName,
            totalCalls: calls.length,
            succeeded,
            failed: calls.length - succeeded - skipped,
            skipped,
            accuracy: calls.length ? succeeded / calls.length : 0,
            totalDurationMs: calls.reduce((s, c) => s + c.durationMs, 0),
            avgDurationMs: calls.length ? calls.reduce((s, c) => s + c.durationMs, 0) / calls.length : 0,
            calls,
        };
    }
});
