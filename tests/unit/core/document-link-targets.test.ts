import { describe, expect, it, vi } from "vitest";
import {
    linkTargetError,
    readLinkTargetDocumentIdentity,
    readLinkTargetScope,
    findScopedLinkTarget,
    scopedLinkTargetTitleExists,
} from "@/core/document-link-targets";
import { createMockClient } from "../../helpers/mock-client";

describe("document-link-targets", () => {
    it("linkTargetError creates typed error", () => {
        const err = linkTargetError("test_code", "test msg");
        expect(err.code).toBe("test_code");
        expect(err.message).toBe("test msg");
        expect(err.name).toBe("DocumentLinkTargetError");
    });

    it("readLinkTargetDocumentIdentity resolves identity", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/parent/doc.sy" };
                if (e === "/api/filetree/getHPathByID") return "/Parent/Doc";
                if (e === "/api/block/getDocInfo") return { id: "doc-1", rootID: "doc-1", name: "Doc" };
                return null;
            }),
        });
        const result = await readLinkTargetDocumentIdentity(client, "doc-1", "nb-1");
        expect(result.id).toBe("doc-1");
        expect(result.notebook).toBe("nb-1");
    });

    it("readLinkTargetDocumentIdentity rejects non-root doc", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/doc.sy" };
                if (e === "/api/filetree/getHPathByID") return "/Doc";
                if (e === "/api/block/getDocInfo") return { id: "blk-1", rootID: "doc-1" };
                return null;
            }),
        });
        await expect(readLinkTargetDocumentIdentity(client, "blk-1", "nb-1")).rejects.toThrow("document root");
    });

    it("readLinkTargetScope detects scope mismatch", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/parent.sy" };
                if (e === "/api/filetree/getHPathByID") return "/Parent";
                if (e === "/api/block/getDocInfo") return { id: "p1", rootID: "p1", name: "Parent" };
                if (e === "/api/filetree/listDocsByPath") return { box: "nb-2", path: "/", files: [] };
                return null;
            }),
        });
        await expect(readLinkTargetScope(client, { notebook: "nb-1", parentId: "p1" })).rejects.toThrow("scope");
    });

    it("readLinkTargetScope rejects foreign child", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/parent.sy" };
                if (e === "/api/filetree/getHPathByID") return "/Parent";
                if (e === "/api/block/getDocInfo") return { id: "p1", rootID: "p1", name: "Parent" };
                if (e === "/api/filetree/listDocsByPath") return { box: "nb-1", path: "/", files: [{ id: "c1", box: "nb-other", path: "/c1.sy", name: "C1" }] };
                return null;
            }),
        });
        await expect(readLinkTargetScope(client, { notebook: "nb-1", parentId: "p1" })).rejects.toThrow("scope");
    });

    it("readLinkTargetScope returns children", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/parent.sy" };
                if (e === "/api/filetree/getHPathByID") return "/Parent";
                if (e === "/api/block/getDocInfo") return { id: "p1", rootID: "p1", name: "Parent" };
                if (e === "/api/filetree/listDocsByPath") return {
                    box: "nb-1", path: "/parent.sy",
                    files: [{ id: "c1", box: "nb-1", path: "/parent/c1.sy", name: "C1.sy", hPath: "/Parent/C1" }],
                };
                return null;
            }),
        });
        const scope = await readLinkTargetScope(client, { notebook: "nb-1", parentId: "p1" });
        expect(scope.parent.id).toBe("p1");
        expect(scope.children).toHaveLength(1);
        expect(scope.children[0].name).toBe("C1");
    });

    it("findScopedLinkTarget finds by id", () => {
        const scope = { parent: { id: "p", notebook: "nb", path: "/p.sy", hPath: "/P" }, children: [{ id: "c1", notebook: "nb", path: "/p/c1.sy" }] };
        expect(findScopedLinkTarget(scope, "c1")?.id).toBe("c1");
        expect(findScopedLinkTarget(scope, "c2")).toBeUndefined();
    });

    it("scopedLinkTargetTitleExists detects title", () => {
        const scope = { parent: { id: "p", notebook: "nb", path: "/p.sy", hPath: "/P" }, children: [{ id: "c1", notebook: "nb", path: "/p/c1.sy", name: "Child" }] };
        expect(scopedLinkTargetTitleExists(scope, "Child")).toBe(true);
        expect(scopedLinkTargetTitleExists(scope, "Other")).toBe(false);
    });
});
