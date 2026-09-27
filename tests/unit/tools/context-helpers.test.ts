import { describe, expect, it, vi } from "vitest";
import {
    normalizePath,
    isPathWithinScope,
    escapeSqlString,
    resolveDocumentContextById,
    createResultResolutionCache,
    resolveResultItemContext,
    resolveMoveTargetNotebook,
    resolveNotebookForPath,
    listChildDocumentsByPath,
} from "@/tools/internal/context";
import { createMockClient } from "../../helpers/mock-client";

describe("context helpers", () => {
    it("normalizePath adds leading slash", () => {
        expect(normalizePath("a/b")).toBe("/a/b");
        expect(normalizePath("/a/b")).toBe("/a/b");
    });

    it("isPathWithinScope", () => {
        expect(isPathWithinScope("/a/b", "/a")).toBe(true);
        expect(isPathWithinScope("/a/b", "/")).toBe(true);
        expect(isPathWithinScope("/a/b", "/b")).toBe(false);
        expect(isPathWithinScope("a/b", "/a")).toBe(true);
    });

    it("escapeSqlString escapes quotes", () => {
        expect(escapeSqlString("hello")).toBe("hello");
        expect(escapeSqlString("it")).toBe("it");
    });

    it("resolveDocumentContextById", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/a/doc.sy" };
                if (e === "/api/filetree/getHPathByID") return "/A/Doc";
                if (e === "/api/block/getDocInfo") return { id: "doc-1", rootID: "doc-1", name: "Doc" };
                return null;
            }),
        });
        const ctx = await resolveDocumentContextById(client, "doc-1");
        expect(ctx.documentId).toBe("doc-1");
        expect(ctx.notebook).toBe("nb-1");
        expect(ctx.path).toBe("/a/doc.sy");
    });

    it("resolveMoveTargetNotebook resolves from doc ID", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/notebook/lsNotebooks") return { notebooks: [] };
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/a/doc.sy" };
                if (e === "/api/filetree/getHPathByID") return "/A/Doc";
                if (e === "/api/block/getDocInfo") return { id: "d1", rootID: "d1" };
                return null;
            }),
        });
        const nb = await resolveMoveTargetNotebook(client, "d1");
        expect(nb).toBe("nb-1");
    });

    it("resolveNotebookForPath finds notebook", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/notebook/lsNotebooks") return { notebooks: [{ id: "nb-1", name: "A" }] };
                if (e === "/api/filetree/getHPathByPath") return "/A/Doc";
                return null;
            }),
        });
        const nb = await resolveNotebookForPath(client, "/nb-1/Doc");
        expect(nb).toBe("nb-1");
    });

    it("resolveNotebookForPath returns null for unknown", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/notebook/lsNotebooks") return { notebooks: [{ id: "nb-1", name: "A" }] };
                if (e === "/api/filetree/getHPathByPath") throw new Error("not found");
                return null;
            }),
        });
        const nb = await resolveNotebookForPath(client, "/nb-x/Doc");
        expect(nb).toBeNull();
    });

    it("listChildDocumentsByPath maps children", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/listDocsByPath") return {
                    box: "nb-1", path: "/parent.sy",
                    files: [{ id: "c1", box: "nb-1", path: "/parent/c1.sy", name: "C1.sy", hPath: "/P/C1" }],
                };
                return null;
            }),
        });
        const children = await listChildDocumentsByPath(client, "nb-1", "/parent.sy");
        expect(children).toHaveLength(1);
        expect(children[0].name).toBe("C1");
    });

    it("listChildDocumentsByPath handles empty", async () => {
        const client = createMockClient({
            request: vi.fn(async () => ({ box: "nb-1", path: "/", files: [] })),
        });
        const children = await listChildDocumentsByPath(client, "nb-1", "/");
        expect(children).toEqual([]);
    });

    it("createResultResolutionCache creates maps", () => {
        const cache = createResultResolutionCache();
        expect(cache.documentContextById).toBeInstanceOf(Map);
        expect(cache.notebookByPath).toBeInstanceOf(Map);
    });

    it("resolveResultItemContext enriches item", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/filetree/getPathByID") return { notebook: "nb-1", path: "/d.sy" };
                if (e === "/api/filetree/getHPathByID") return "/D";
                if (e === "/api/block/getDocInfo") return { id: "d1", rootID: "d1" };
                return null;
            }),
        });
        const result = await resolveResultItemContext(client, { id: "d1" });
        expect(result.notebook).toBe("nb-1");
        expect(result.path).toBe("/d.sy");
    });

    it("resolveResultItemContext returns null for non-object", async () => {
        const client = createMockClient();
        expect(await resolveResultItemContext(client, null)).toBeNull();
        expect(await resolveResultItemContext(client, "string")).toBeNull();
        expect(await resolveResultItemContext(client, 42)).toBeNull();
    });

    it("resolveResultItemContext uses notebook+path directly", async () => {
        const client = createMockClient();
        const result = await resolveResultItemContext(client, { notebook: "nb-1", path: "/d.sy" });
        expect(result.notebook).toBe("nb-1");
    });

    it("resolveResultItemContext falls back to path-only", async () => {
        const client = createMockClient({
            request: vi.fn(async (e: string) => {
                if (e === "/api/notebook/lsNotebooks") return { notebooks: [{ id: "nb-1", name: "A" }] };
                if (e === "/api/filetree/getHPathByPath") return "/A/D";
                return null;
            }),
        });
        const result = await resolveResultItemContext(client, { path: "/nb-1/D" });
        expect(result.notebook).toBe("nb-1");
    });
});
