import { describe, it, expect, vi } from 'vitest';
import {
    fullTextSearchBlock,
    semanticSearchBlock,
    querySQL,
    searchTag,
    getBacklinkDoc,
    getBackmentionDoc,
    searchRefBlock,
    findReplace,
    searchAsset,
    getAssetContent,
    fullTextSearchAssetContent,
    listInvalidBlockRefs,
} from '@/api/search';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('search api wrappers', () => {
    it('performs fulltext search', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ blocks: [], matchedBlockCount: 0 });

        const result = await fullTextSearchBlock(client, { query: 'test', page: 1, pageSize: 20 });

        expect(mock).toHaveBeenCalledWith('/api/search/fullTextSearchBlock', {
            query: 'test', page: 1, pageSize: 20,
        });
        expect(result.blocks).toEqual([]);
    });

    it('performs semantic search', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ blocks: [] });

        await semanticSearchBlock(client, { query: 'concept', page: 1 });

        expect(mock).toHaveBeenCalledWith('/api/search/semanticSearchBlock', { query: 'concept', page: 1 });
    });

    it('executes SQL query', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce([{ id: 'b1' }]);

        const result = await querySQL(client, 'SELECT * FROM blocks LIMIT 1');

        expect(mock).toHaveBeenCalledWith('/api/query/sql', { stmt: 'SELECT * FROM blocks LIMIT 1' });
        expect(result).toEqual([{ id: 'b1' }]);
    });

    it('returns empty array for non-array SQL result', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce(null);

        const result = await querySQL(client, 'SELECT 1');

        expect(result).toEqual([]);
    });

    it('searches tags', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ tags: [{ label: 'todo' }] });

        const result = await searchTag(client, 'todo');

        expect(mock).toHaveBeenCalledWith('/api/search/searchTag', { k: 'todo' });
        expect(result.tags).toHaveLength(1);
    });

    it('gets backlink doc', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ backlinks: [] });

        const result = await getBacklinkDoc(client, 'def1');

        expect(mock).toHaveBeenCalledWith('/api/ref/getBacklinkDoc', { defID: 'def1', keyword: undefined, refTreeID: undefined });
        expect(result).toEqual({ backlinks: [] });
    });

    it('gets backlink doc with filters', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce(null);

        const result = await getBacklinkDoc(client, 'def1', 'keyword', 'tree1');

        expect(mock).toHaveBeenCalledWith('/api/ref/getBacklinkDoc', { defID: 'def1', keyword: 'keyword', refTreeID: 'tree1' });
        expect(result).toBeNull();
    });

    it('gets backmention doc', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ backmentions: [] });

        const result = await getBackmentionDoc(client, 'def1');

        expect(mock).toHaveBeenCalledWith('/api/ref/getBackmentionDoc', { defID: 'def1', keyword: undefined, refTreeID: undefined });
        expect(result).toEqual({ backmentions: [] });
    });

    it('searches ref blocks', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ blocks: [] });

        await searchRefBlock(client, { id: 'b1' });

        expect(mock).toHaveBeenCalledWith('/api/search/searchRefBlock', {
            reqId: undefined, id: 'b1', rootID: '', k: '', beforeLen: 512,
            isSquareBrackets: false, isDatabase: false,
        });
    });

    it('searches ref blocks with all options', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({});

        await searchRefBlock(client, { id: 'b1', rootID: 'r1', k: 'kw', beforeLen: 256, isSquareBrackets: true, isDatabase: true, reqId: 'req1' });

        expect(mock).toHaveBeenCalledWith('/api/search/searchRefBlock', {
            reqId: 'req1', id: 'b1', rootID: 'r1', k: 'kw', beforeLen: 256,
            isSquareBrackets: true, isDatabase: true,
        });
    });

    it('performs find and replace', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        const result = await findReplace(client, { k: 'old', r: 'new', ids: ['doc1'] });

        expect(mock).toHaveBeenCalledWith('/api/search/findReplace', { k: 'old', r: 'new', ids: ['doc1'] });
        expect(result).toBeNull();
    });

    it('searches assets', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ assets: [] });

        const result = await searchAsset(client, 'image', ['png', 'jpg']);

        expect(mock).toHaveBeenCalledWith('/api/search/searchAsset', { k: 'image', exts: ['png', 'jpg'] });
        expect(result).toEqual({ assets: [] });
    });

    it('gets asset content', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ content: 'text' });

        const result = await getAssetContent(client, 'a1', 'query');

        expect(mock).toHaveBeenCalledWith('/api/search/getAssetContent', { id: 'a1', query: 'query', queryMethod: 0 });
        expect(result.content).toBe('text');
    });

    it('gets asset content with custom method', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({});

        await getAssetContent(client, 'a1', 'q', 2);

        expect(mock).toHaveBeenCalledWith('/api/search/getAssetContent', { id: 'a1', query: 'q', queryMethod: 2 });
    });

    it('searches asset content', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ results: [] });

        const result = await fullTextSearchAssetContent(client, { query: 'word', page: 1 });

        expect(mock).toHaveBeenCalledWith('/api/search/fullTextSearchAssetContent', { query: 'word', page: 1 });
        expect(result).toEqual({ results: [] });
    });

    it('lists invalid block refs', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ refs: [] });

        const result = await listInvalidBlockRefs(client, 1, 20);

        expect(mock).toHaveBeenCalledWith('/api/search/listInvalidBlockRefs', { page: 1, pageSize: 20 });
        expect(result).toEqual({ refs: [] });
    });
});

