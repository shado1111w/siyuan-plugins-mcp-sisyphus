import { describe, it, expect, vi } from 'vitest';
import {
    createSnapshot,
    tagSnapshot,
    getRepoSnapshots,
    getRepoTagSnapshots,
    removeRepoTagSnapshot,
    diffRepoSnapshots,
    openRepoSnapshotFile,
    rollbackRepoSnapshotFile,
} from '@/api/repo';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('repo api wrappers', () => {
    it('creates a snapshot', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ id: 'snap1' });

        const result = await createSnapshot(client, 'my backup');

        expect(mock).toHaveBeenCalledWith('/api/repo/createSnapshot', { memo: 'my backup' });
        expect(result.id).toBe('snap1');
    });

    it('creates a snapshot without memo', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ id: 'snap2' });

        await createSnapshot(client);

        expect(mock).toHaveBeenCalledWith('/api/repo/createSnapshot', { memo: '' });
    });

    it('tags a snapshot', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await tagSnapshot(client, 'snap1', 'v1');

        expect(mock).toHaveBeenCalledWith('/api/repo/tagSnapshot', { id: 'snap1', name: 'v1' });
    });

    it('gets repo snapshots', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ snapshots: [], pageCount: 1, totalCount: 0 });

        const result = await getRepoSnapshots(client, 2);

        expect(mock).toHaveBeenCalledWith('/api/repo/getRepoSnapshots', { page: 2 });
        expect(result.snapshots).toEqual([]);
    });

    it('gets tag snapshots', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ snapshots: [{ id: 's1', tag: 'v1' }] });

        const result = await getRepoTagSnapshots(client);

        expect(mock).toHaveBeenCalledWith('/api/repo/getRepoTagSnapshots', {});
        expect(result.snapshots).toHaveLength(1);
    });

    it('removes a tag snapshot', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await removeRepoTagSnapshot(client, 'v1');

        expect(mock).toHaveBeenCalledWith('/api/repo/removeRepoTagSnapshot', { tag: 'v1' });
    });

    it('diffs two snapshots', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ addsLeft: [], updatesLeft: [] });

        const result = await diffRepoSnapshots(client, 'left-id', 'right-id');

        expect(mock).toHaveBeenCalledWith('/api/repo/diffRepoSnapshots', {
            left: 'left-id',
            right: 'right-id',
        });
        expect(result.addsLeft).toEqual([]);
    });

    it('opens a snapshot file', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ title: 'Doc', content: 'text', displayInText: true, updated: '2026-01-01' });

        const result = await openRepoSnapshotFile(client, 'file-1');

        expect(mock).toHaveBeenCalledWith('/api/repo/openRepoSnapshotFile', { id: 'file-1' });
        expect(result.title).toBe('Doc');
    });

    it('rolls back a snapshot file', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await rollbackRepoSnapshotFile(client, 'file-1');

        expect(mock).toHaveBeenCalledWith('/api/repo/rollbackRepoSnapshotFile', { id: 'file-1' });
    });
});

