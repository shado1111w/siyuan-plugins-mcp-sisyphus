import { describe, it, expect, beforeAll } from "vitest";
import { SiYuanClient } from "@/api/client";
import * as notebookApi from "@/api/notebook";
import * as documentApi from "@/api/document";
import * as blockApi from "@/api/block";
import * as searchApi from "@/api/search";
import * as systemApi from "@/api/system";

const SIYUAN_URL = process.env.SIYUAN_E2E_URL ?? "http://127.0.0.1:6807";
const SIYUAN_TOKEN = process.env.SIYUAN_E2E_TOKEN ?? "zrk1rs7459ml0ecm";
const SKIP_LIVE = process.env.SIYUAN_E2E_SKIP === "1";

describe.skipIf(SKIP_LIVE)("SiYuan Live E2E", () => {
    let client: SiYuanClient;
    let notebookId: string;

    beforeAll(async () => {
        client = new SiYuanClient({ baseUrl: SIYUAN_URL, timeout: 15000 });
        client.setToken(SIYUAN_TOKEN);
        const result = await notebookApi.listNotebooks(client);
        expect(result.notebooks.length).toBeGreaterThan(0);
        notebookId = result.notebooks[0].id;
    });

    it("returns version", async () => {
        const version = await systemApi.getVersion(client);
        expect(version).toMatch(/\d+\.\d+\.\d+/);
    });

    it("lists notebooks and gets conf", async () => {
        const result = await notebookApi.listNotebooks(client);
        expect(result.notebooks.length).toBeGreaterThan(0);
        const conf = await notebookApi.getNotebookConf(client, notebookId);
        expect(conf.conf).toBeDefined();
    });

    it("creates reads and removes a document", async () => {
        const docId = await documentApi.createDoc(client, notebookId, "/e2e-test-doc", "# Test");
        expect(docId).toBeTruthy();
        const info = await documentApi.getPathByID(client, docId);
        expect(info.notebook).toBe(notebookId);
        const doc = await documentApi.getDoc(client, docId);
        expect(doc).toBeDefined();
        await documentApi.removeDocByID(client, docId);
    });

    it("inserts updates and deletes a block", async () => {
        const docId = await documentApi.createDoc(client, notebookId, "/e2e-block-doc", "# Blocks");
        const insertResult = await blockApi.insertBlock(client, "markdown", "Test paragraph", undefined, undefined, docId);
        const ops = insertResult as Array<{ doOperations: Array<{ id: string }> }>;
        const blockId = ops[0].doOperations[0].id;
        expect(blockId).toBeTruthy();
        const kramdown = await blockApi.getBlockKramdown(client, blockId);
        expect(kramdown.kramdown).toContain("Test paragraph");
        await blockApi.updateBlock(client, "markdown", "Updated", blockId);
        const updated = await blockApi.getBlockKramdown(client, blockId);
        expect(updated.kramdown).toContain("Updated");
        await blockApi.deleteBlock(client, blockId);
        await documentApi.removeDocByID(client, docId);
    });

    it("fulltext search and SQL query", async () => {
        const result = await searchApi.fullTextSearchBlock(client, { query: "test", page: 1, pageSize: 5 });
        expect(result).toBeDefined();
        const sql = await searchApi.querySQL(client, "SELECT * FROM blocks LIMIT 5");
        expect(Array.isArray(sql)).toBe(true);
    });

    it("lists tags", async () => {
        const result = await searchApi.searchTag(client, "");
        expect(result).toBeDefined();
    });
});
