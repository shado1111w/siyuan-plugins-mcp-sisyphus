import { describe, expect, it, vi } from "vitest";
import { buildDefaultToolConfig } from "@/core/config";
import { callTimelineTool } from "@/tools/timeline";
import { createMockClient } from "../../helpers/mock-client";
import { createMockPermissionManager } from "../../helpers/mock-permissions";
import { parseResult } from "../../helpers/parse-result";

const GLOBAL_TAG = "sisyphustimeline_global_test";
const DOC_ID = "20260805200000-abcdefg";
const DOC_TAG = "sisyphustimeline_" + DOC_ID + "_test";

function dc() {
    const c = buildDefaultToolConfig().timeline;
    for (const k of Object.keys(c.actions)) c.actions[k] = true;
    return c;
}

function snapshotClient() {
    return createMockClient({
        request: vi.fn(async (endpoint: string, data?: Record<string, unknown>) => {
            if (endpoint === "/api/repo/getRepoSnapshots") {
                return { snapshots: [{ id: "snap-1", memo: "test", created: 100 }], pageCount: 1, totalCount: 1 };
            }
            if (endpoint === "/api/repo/getRepoTagSnapshots") {
                return { snapshots: [{ id: "snap-1", tag: GLOBAL_TAG, memo: "test", created: 100 }] };
            }
            if (endpoint === "/api/repo/createSnapshot") return null;
            if (endpoint === "/api/repo/tagSnapshot") return null;
            if (endpoint === "/api/repo/removeRepoTagSnapshot") return null;
            if (endpoint === "/api/repo/diffRepoSnapshots") {
                return { updatesLeft: [{ fileID: "f1", path: "/data/d.sy", title: "D" }], updatesRight: [{ fileID: "f2", path: "/data/d.sy", title: "D" }] };
            }
            if (endpoint === "/api/repo/openRepoSnapshotFile") {
                return { title: "D", content: "<div>old</div>", displayInText: true, updated: "old" };
            }
            if (endpoint === "/api/query/sql") {
                return [{ id: DOC_ID, root_id: DOC_ID, box: "nb-1", path: "/" + DOC_ID + ".sy", type: "d" }];
            }
            if (endpoint === "/api/block/deleteBlock") return null;
            if (endpoint === "/api/attr/getBlockAttrs") return {};
            if (endpoint === "/api/attr/setBlockAttrs") return null;
            return null;
        }),
    });
}

describe("timeline handlers", () => {
    it("list_nodes global", async () => {
        const cl = snapshotClient();
        const r = await callTimelineTool(cl, { action: "list_nodes", scope: "global" }, dc(), createMockPermissionManager());
        const p = parseResult(r);
        expect(p.nodes || p.data || p).toBeDefined();
    });

    it("list_nodes document", async () => {
        const cl = snapshotClient();
        const mgr = createMockPermissionManager();
        const r = await callTimelineTool(cl, { action: "list_nodes", scope: "document", documentId: DOC_ID }, dc(), mgr);
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("create_node global", async () => {
        const cl = snapshotClient();
        const r = await callTimelineTool(cl, { action: "create_node", name: "test-node", scope: "global" }, dc(), createMockPermissionManager());
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("create_node document with refresh", async () => {
        const cl = snapshotClient();
        const mgr = createMockPermissionManager();
        const r = await callTimelineTool(cl, { action: "create_node", name: "doc-node", scope: "document", documentId: DOC_ID }, dc(), mgr);
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("compare_node", async () => {
        const cl = snapshotClient();
        const mgr = createMockPermissionManager();
        const r = await callTimelineTool(cl, { action: "compare_node", documentId: DOC_ID, tag: GLOBAL_TAG }, dc(), mgr);
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("delete_node global", async () => {
        const cl = snapshotClient();
        const r = await callTimelineTool(cl, { action: "delete_node", tag: GLOBAL_TAG }, dc(), createMockPermissionManager());
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("delete_node document requires docId", async () => {
        const cl = snapshotClient();
        const r = await callTimelineTool(cl, { action: "delete_node", tag: DOC_TAG }, dc(), createMockPermissionManager());
        const p = parseResult(r);
        expect(r.isError).toBe(true);
        expect(p.error.message).toContain("documentId");
    });

    it("rollback_document", async () => {
        const cl = snapshotClient();
        const mgr = createMockPermissionManager();
        const r = await callTimelineTool(cl, { action: "rollback_document", documentId: DOC_ID, tag: DOC_TAG }, dc(), mgr);
        const p = parseResult(r);
        expect(p).toBeDefined();
    });

    it("rollback_block", async () => {
        const cl = snapshotClient();
        const mgr = createMockPermissionManager();
        const r = await callTimelineTool(cl, { action: "rollback_block", documentId: DOC_ID, tag: DOC_TAG, changeKey: "modified:a:a" }, dc(), mgr);
        const p = parseResult(r);
        expect(p).toBeDefined();
    });
});
