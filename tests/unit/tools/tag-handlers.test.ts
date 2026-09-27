import { describe, expect, it, vi } from "vitest";
import { buildDefaultToolConfig } from "@/core/config";
import { callTagTool } from "@/tools/tag";
import { createMockClient } from "../../helpers/mock-client";
import { createMockPermissionManager } from "../../helpers/mock-permissions";
import { parseResult } from "../../helpers/parse-result";

const permMgr = createMockPermissionManager();

function dc() {
    const c = buildDefaultToolConfig().tag;
    for (const k of Object.keys(c.actions)) c.actions[k] = true;
    return c;
}

describe("tag handlers", () => {
    it("list without keyword", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ tags: [{ label: "todo", count: 5 }] })) });
        const r = await callTagTool(cl, { action: "list" }, dc(), permMgr);
        expect(parseResult(r).tags).toHaveLength(1);
    });

    it("list with keyword uses searchTag", async () => {
        const req = vi.fn(async (e: string) => e === "/api/search/searchTag" ? { tags: [{ label: "work" }] } : null);
        const cl = createMockClient({ request: req });
        const r = await callTagTool(cl, { action: "list", keyword: "work" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.resolvedArgs.keyword).toBe("work");
        expect(req).toHaveBeenCalledWith("/api/search/searchTag", { k: "work" });
    });

    it("list with keyword warns on empty results", async () => {
        const cl = createMockClient({ request: vi.fn(async () => ({ tags: [] })) });
        const r = await callTagTool(cl, { action: "list", keyword: "nonexist" }, dc(), permMgr);
        const p = parseResult(r);
        expect(p.warning).toContain("indexing");
    });

    it("rename calls renameTag", async () => {
        const req = vi.fn(async () => null);
        const cl = createMockClient({ request: req });
        const r = await callTagTool(cl, { action: "rename", oldLabel: "old", newLabel: "new" }, dc(), permMgr);
        expect(parseResult(r).success).toBe(true);
        expect(req).toHaveBeenCalledWith("/api/tag/renameTag", { oldLabel: "old", newLabel: "new" });
    });

    it("remove calls removeTag", async () => {
        const req = vi.fn(async () => null);
        const cl = createMockClient({ request: req });
        const r = await callTagTool(cl, { action: "remove", label: "old-tag" }, dc(), permMgr);
        expect(parseResult(r).success).toBe(true);
        expect(req).toHaveBeenCalledWith("/api/tag/removeTag", { label: "old-tag" });
    });
});
