import { describe, it, expect, vi } from 'vitest';
import {
    searchHistory,
    getHistoryItems,
    getDocHistoryContent,
    rollbackDocHistory,
} from '@/api/history';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('history api wrappers', () => {
    it('searches history with default params', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ histories: [], pageCount: 0, totalCount: 0 });

        const result = await searchHistory(client);

        expect(mock).toHaveBeenCalledWith('/api/history/searchHistory', {});
        expect(result.histories).toEqual([]);
    });

    it('searches history with filters', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ histories: [{ path: '/doc' }] });

        await searchHistory(client, { notebook: 'nb1', query: 'test', op: 'create' });

        expect(mock).toHaveBeenCalledWith('/api/history/searchHistory', {
            notebook: 'nb1',
            query: 'test',
            op: 'create',
        });
    });

    it('gets history items', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ histories: [] });

        await getHistoryItems(client, { created: '2026-01-01' });

        expect(mock).toHaveBeenCalledWith('/api/history/getHistoryItems', { created: '2026-01-01' });
    });

    it('gets document history content', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ id: 'h1', content: 'old text', isLargeDoc: false });

        const result = await getDocHistoryContent(client, '/history/path');

        expect(mock).toHaveBeenCalledWith('/api/history/getDocHistoryContent', {
            historyPath: '/history/path',
            keyword: '',
            highlight: false,
        });
        expect(result.content).toBe('old text');
    });

    it('gets history content with keyword highlight', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ id: 'h1', content: 'text', isLargeDoc: false });

        await getDocHistoryContent(client, '/path', 'findme', true);

        expect(mock).toHaveBeenCalledWith('/api/history/getDocHistoryContent', {
            historyPath: '/path',
            keyword: 'findme',
            highlight: true,
        });
    });

    it('rolls back document history', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ box: 'nb1' });

        const result = await rollbackDocHistory(client, 'nb1', '/history/path');

        expect(mock).toHaveBeenCalledWith('/api/history/rollbackDocHistory', {
            notebook: 'nb1',
            historyPath: '/history/path',
        });
        expect(result.box).toBe('nb1');
    });
});

