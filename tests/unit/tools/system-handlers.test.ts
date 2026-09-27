import { describe, expect, it, vi } from "vitest";
import { buildDefaultToolConfig } from "@/core/config";
import { callSystemTool } from "@/tools/system";
import { createMockClient } from "../../helpers/mock-client";
import { createMockPermissionManager } from "../../helpers/mock-permissions";
import { parseResult } from "../../helpers/parse-result";

const permMgr = createMockPermissionManager();

function dc() {
    const c = buildDefaultToolConfig().system;
    for (const k of Object.keys(c.actions)) c.actions[k] = true;
    return c;
}

describe("system handlers", () => {
    it("workspace_info", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ workspaceDir: "/siyuan", dataDir: "/data" })) });
        const r = await callSystemTool(cl, { action: "workspace_info" }, dc(), permMgr);
        expect(parseResult(r).workspaceDir).toBe("/siyuan");
    });

    it("network", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ proxy: "none" })) });
        const r = await callSystemTool(cl, { action: "network" }, dc(), permMgr);
        expect(parseResult(r).proxy).toBe("none");
    });

    it("conf summary mode", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ appearance: { mode: 0 }, editor: { fontSize: 16 } })) });
        const r = await callSystemTool(cl, { action: "conf", mode: "summary" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.mode).toBe("summary");
        expect(p.topLevelKeys).toContain("appearance");
    });

    it("conf get mode with keyPath", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ appearance: { mode: 1 } })) });
        const r = await callSystemTool(cl, { action: "conf", mode: "get", keyPath: "appearance.mode" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.mode).toBe("get");
        expect(p.keyPath).toBe("appearance.mode");
    });

    it("conf get mode with bracket syntax", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ items: ["a", "b"] })) });
        const r = await callSystemTool(cl, { action: "conf", mode: "get", keyPath: "items[1]" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.value.value).toBe("b");
    });

    it("conf get mode errors on missing path", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({})) });
        const r = await callSystemTool(cl, { action: "conf", mode: "get", keyPath: "missing" }, dc(), permMgr);
        const p = parseResult(r);
        expect(r.isError).toBe(true);
        expect(p.error.message).toContain("Config path not found");
    });

    it("notify info", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ id: "msg-1" })) });
        const r = await callSystemTool(cl, { action: "notify", msg: "hello", level: "info" }, dc(), permMgr);
        expect(parseResult(r).level).toBe("info");
    });

    it("notify error", async () => {
        const req = vi.fn(async () => ({ id: "msg-2" }));
        const cl = createMockClient({ request: req });
        const r = await callSystemTool(cl, { action: "notify", msg: "oops", level: "error" }, dc(), permMgr);
        expect(parseResult(r).level).toBe("error");
        expect(req).toHaveBeenCalledWith("/api/notification/pushErrMsg", { msg: "oops", timeout: undefined });
    });

    it("perform_sync", async () => {
        const cl = createMockClient({ request: vi.fn(async () => null) });
        const r = await callSystemTool(cl, { action: "perform_sync" }, dc(), permMgr);
        expect(parseResult(r).ok).toBe(true);
    });

    it("get_version", async () => {
        const cl = createMockClient({ request: vi.fn(async () => "3.8.0") });
        const r = await callSystemTool(cl, { action: "get_version" }, dc(), permMgr);
        expect(parseResult(r).version).toBe("3.8.0");
    });

    it("get_current_time", async () => {
        const cl = createMockClient({ request: vi.fn(async () => 1727000000000) });
        const r = await callSystemTool(cl, { action: "get_current_time" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.currentTime).toBe(1727000000000);
        expect(p.iso).toBeDefined();
    });
});
