import { describe, expect, it, vi } from "vitest";
import { buildDefaultToolConfig } from "@/core/config";
import { callNotebookTool } from "@/tools/notebook";
import { createMockClient } from "../../helpers/mock-client";
import { createMockPermissionManager } from "../../helpers/mock-permissions";
import { parseResult } from "../../helpers/parse-result";

const NB_ID = "nb-test-001";
const permMgr = createMockPermissionManager();

function dc() {
    const c = buildDefaultToolConfig().notebook;
    for (const k of Object.keys(c.actions)) c.actions[k] = true;
    return c;
}

describe("notebook handlers", () => {
    it("list", async () => {
        const cl = createMockClient({ request: vi.fn(async (e: string) => e === "/api/notebook/lsNotebooks" ? { notebooks: [{ id: "nb-1", name: "A" }] } : null) });
        const r = await callNotebookTool(cl, { action: "list" }, dc(), permMgr);
        expect(parseResult(r)).toEqual([{ id: "nb-1", name: "A" }]);
    });
    it("create", async () => {
        const req = vi.fn(async (e: string) => e === "/api/notebook/createNotebook" ? { notebook: { id: "nb-n", name: "N" } } : e.startsWith("/api/ui/") ? null : null);
        const cl = createMockClient({ request: req });
        const r = await callNotebookTool(cl, { action: "create", name: "N" }, dc(), permMgr);
        expect(parseResult(r).id).toBe("nb-n");
    });
    it("set_open_state", async () => {
        const req = vi.fn(async () => null);
        const cl = createMockClient({ request: req });
        expect(parseResult(await callNotebookTool(cl, { action: "set_open_state", notebook: NB_ID, opened: true }, dc(), permMgr)).opened).toBe(true);
        expect(parseResult(await callNotebookTool(cl, { action: "set_open_state", notebook: NB_ID, opened: false }, dc(), permMgr)).opened).toBe(false);
    });
    it("remove", async () => {
        const cl = createMockClient({ request: vi.fn(async () => null) });
        expect(parseResult(await callNotebookTool(cl, { action: "remove", notebook: NB_ID }, dc(), permMgr)).success).toBe(true);
    });
    it("rename", async () => {
        const cl = createMockClient({ request: vi.fn(async () => null) });
        expect(parseResult(await callNotebookTool(cl, { action: "rename", notebook: NB_ID, name: "R" }, dc(), permMgr)).name).toBe("R");
    });
    it("get_conf", async () => {
        const cl = createMockClient({ request: vi.fn(async (e: string) => e === "/api/notebook/getNotebookConf" ? { conf: { name: "T" } } : null) });
        expect(parseResult(await callNotebookTool(cl, { action: "get_conf", notebook: NB_ID }, dc(), permMgr)).conf.name).toBe("T");
    });
    it("set_conf", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ name: "NB" })) });
        expect(parseResult(await callNotebookTool(cl, { action: "set_conf", notebook: NB_ID, conf: {} }, dc(), permMgr)).name).toBe("NB");
    });
    it("set_icon", async () => {
        const cl = createMockClient({ request: vi.fn(async () => null) });
        expect(parseResult(await callNotebookTool(cl, { action: "set_icon", notebook: NB_ID, icon: "1f600" }, dc(), permMgr)).icon).toBe("1f600");
    });
    it("get_permissions all", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ notebooks: [{ id: "nb-1" }, { id: "nb-2" }] })) });
        const mgr = createMockPermissionManager(); mgr.get = vi.fn((id: string) => id === "nb-1" ? "rwd" : "r");
        expect(parseResult(await callNotebookTool(cl, { action: "get_permissions" }, dc(), mgr)).notebooks).toHaveLength(2);
    });
    it("get_permissions by id", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ notebooks: [{ id: "nb-1" }] })) });
        const mgr = createMockPermissionManager(); mgr.get = vi.fn(() => "rw");
        expect(parseResult(await callNotebookTool(cl, { action: "get_permissions", notebook: "nb-1" }, dc(), mgr)).notebook.id).toBe("nb-1");
    });
    it("get_permissions unknown", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ notebooks: [{ id: "nb-1" }] })) });
        const mgr = createMockPermissionManager(); mgr.get = vi.fn(() => "r");
        const r = await callNotebookTool(cl, { action: "get_permissions", notebook: "nb-x" }, dc(), mgr);
        expect(r.isError).toBe(true);
    });
    it("set_permission", async () => {
        const mgr = createMockPermissionManager(); mgr.set = vi.fn(async () => undefined);
        const cl = createMockClient({ request: vi.fn(async () => null) });
        expect(parseResult(await callNotebookTool(cl, { action: "set_permission", notebook: NB_ID, permission: "rw" }, dc(), mgr)).permission).toBe("rw");
        expect(mgr.set).toHaveBeenCalledWith(NB_ID, "rw");
    });
    it("get_child_docs", async () => {
        const req = vi.fn(async (e: string) => e === "/api/notebook/lsNotebooks" ? { notebooks: [{ id: "nb-1", closed: false }] } : e === "/api/filetree/listDocsByPath" ? { box: "nb-1", path: "/", files: [{ id: "d1", path: "/d1.sy", box: "nb-1", name: "D1" }] } : null);
        const cl = createMockClient({ request: req });
        const r = await callNotebookTool(cl, { action: "get_child_docs", notebook: "nb-1" }, dc(), permMgr);
        expect(parseResult(r).data).toHaveLength(1);
    });
    it("get_child_docs closed nb", async () => {
        const req = vi.fn(async (e: string) => e === "/api/notebook/lsNotebooks" ? { notebooks: [{ id: "nb-1", closed: true }] } : e === "/api/filetree/listDocsByPath" ? Promise.reject(new Error("kernel still initializing")) : null);
        const cl = createMockClient({ request: req });
        const r = await callNotebookTool(cl, { action: "get_child_docs", notebook: "nb-1" }, dc(), permMgr);
        expect(r.isError).toBe(true);
        expect(parseResult(r).error.reason).toBe("notebook_closed_or_initializing");
    });
    it("get_child_docs retries", async () => {
        let a = 0;
        const req = vi.fn(async (e: string) => {
            if (e === "/api/notebook/lsNotebooks") return { notebooks: [{ id: "nb-1", closed: false }] };
            if (e === "/api/filetree/listDocsByPath") { a++; if (a <= 2) throw new Error("notebook is currently closed"); return { box: "nb-1", path: "/", files: [{ id: "d1", path: "/d1.sy", box: "nb-1", name: "D1" }] }; }
            return null;
        });
        const cl = createMockClient({ request: req });
        expect(parseResult(await callNotebookTool(cl, { action: "get_child_docs", notebook: "nb-1" }, dc(), permMgr)).data).toHaveLength(1);
        expect(a).toBe(3);
    });
    it("get_child_docs missing nb", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ notebooks: [] })) });
        expect(parseResult(await callNotebookTool(cl, { action: "get_child_docs", notebook: "nb-x" }, dc(), permMgr)).error).toBeDefined();
    });
});
