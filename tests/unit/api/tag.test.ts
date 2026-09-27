import { describe, it, expect, vi } from 'vitest';
import { listTags, renameTag, removeTag } from '@/api/tag';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('tag api wrappers', () => {
    it('lists tags with default app', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ tags: [{ label: 'test' }] });

        const result = await listTags(client);

        expect(mock).toHaveBeenCalledWith('/api/tag/getTag', { app: 'siyuan-mcp-sisyphus' });
        expect(result).toEqual({ tags: [{ label: 'test' }] });
    });

    it('lists tags with sort and custom app', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ tags: [] });

        await listTags(client, { sort: 1, app: 'custom' });

        expect(mock).toHaveBeenCalledWith('/api/tag/getTag', { sort: 1, app: 'custom' });
    });

    it('lists tags with ignoreMaxListHint', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ tags: [] });

        await listTags(client, { ignoreMaxListHint: true });

        expect(mock).toHaveBeenCalledWith('/api/tag/getTag', { ignoreMaxListHint: true, app: 'siyuan-mcp-sisyphus' });
    });

    it('renames a tag', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await renameTag(client, 'old-tag', 'new-tag');

        expect(mock).toHaveBeenCalledWith('/api/tag/renameTag', { oldLabel: 'old-tag', newLabel: 'new-tag' });
    });

    it('removes a tag', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await removeTag(client, 'unwanted');

        expect(mock).toHaveBeenCalledWith('/api/tag/removeTag', { label: 'unwanted' });
    });
});

