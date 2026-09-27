import { describe, expect, it, vi } from "vitest";
import { loadNotebookNameMap, resolveNotebookName, enrichItemsWithNotebookNames } from "@/tools/notebook-names";
import { createMockClient } from "../../helpers/mock-client";

function nbClient(notebooks: Array<{id: string; name: string}>) {
    return createMockClient({
        request: vi.fn(async () => ({ notebooks })),
    });
}

describe("notebook-names", () => {
    it("loadNotebookNameMap returns map", async () => {
        const client = nbClient([{ id: "nb-1", name: "Alpha" }, { id: "nb-2", name: "Beta" }]);
        const map = await loadNotebookNameMap(client);
        expect(map.get("nb-1")).toBe("Alpha");
        expect(map.get("nb-2")).toBe("Beta");
        expect(map.size).toBe(2);
    });

    it("resolveNotebookName returns name", async () => {
        const client = nbClient([{ id: "nb-1", name: "Alpha" }]);
        expect(await resolveNotebookName(client, "nb-1")).toBe("Alpha");
    });

    it("resolveNotebookName returns undefined for unknown", async () => {
        const client = nbClient([{ id: "nb-1", name: "Alpha" }]);
        expect(await resolveNotebookName(client, "nb-x")).toBeUndefined();
    });

    it("resolveNotebookName returns undefined for empty id", async () => {
        const client = nbClient([]);
        expect(await resolveNotebookName(client, undefined)).toBeUndefined();
        expect(await resolveNotebookName(client, "")).toBeUndefined();
    });

    it("resolveNotebookName returns undefined on error", async () => {
        const client = createMockClient({ request: vi.fn(async () => { throw new Error("net"); }) });
        expect(await resolveNotebookName(client, "nb-1")).toBeUndefined();
    });

    it("enrichItemsWithNotebookNames adds names", async () => {
        const client = nbClient([{ id: "nb-1", name: "Alpha" }]);
        const items = [{ id: "d1", notebook: "nb-1" }, { id: "d2", notebook: "nb-2" }];
        const result = await enrichItemsWithNotebookNames(client, items);
        expect(result[0].notebookName).toBe("Alpha");
        expect(result[1].notebookName).toBeUndefined();
    });

    it("enrichItemsWithNotebookNames handles non-object items", async () => {
        const client = nbClient([{ id: "nb-1", name: "Alpha" }]);
        const items = [{ id: "d1", notebook: "nb-1" }, "string", 42];
        const result = await enrichItemsWithNotebookNames(client, items as any);
        expect(result[0].notebookName).toBe("Alpha");
        expect(result[1]).toBe("string");
        expect(result[2]).toBe(42);
    });

    it("enrichItemsWithNotebookNames returns originals on error", async () => {
        const client = createMockClient({ request: vi.fn(async () => { throw new Error("fail"); }) });
        const items = [{ id: "d1", notebook: "nb-1" }];
        const result = await enrichItemsWithNotebookNames(client, items);
        expect(result).toEqual(items);
    });

    it("enrichItemsWithNotebookNames returns early for empty", async () => {
        const client = createMockClient({ request: vi.fn(async () => { throw new Error("should not call"); }) });
        const result = await enrichItemsWithNotebookNames(client, []);
        expect(result).toEqual([]);
    });
});
