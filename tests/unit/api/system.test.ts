import { describe, it, expect, vi } from 'vitest';
import {
    getWorkspaceInfo,
    getNetwork,
    getChangelog,
    getConf,
    getSysFonts,
    getBootProgress,
    performSync,
    getVersion,
    getCurrentTime,
    reloadUI,
    reloadIcon,
    reloadFiletree,
    reloadProtyle,
    reloadAttributeView,
    reloadTag,
} from '@/api/system';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('system api wrappers', () => {
    it('gets workspace info', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ workspaceDir: '/ws' });

        const result = await getWorkspaceInfo(client);

        expect(mock).toHaveBeenCalledWith('/api/system/getWorkspaceInfo', {});
        expect(result).toEqual({ workspaceDir: '/ws' });
    });

    it('gets network info', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ proxy: '' });

        await getNetwork(client);

        expect(mock).toHaveBeenCalledWith('/api/system/getNetwork', {});
    });

    it('gets changelog', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce('# Changelog');

        const result = await getChangelog(client);

        expect(mock).toHaveBeenCalledWith('/api/system/getChangelog', {});
        expect(result).toBe('# Changelog');
    });

    it('gets conf', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ lang: 'zh_CN' });

        const result = await getConf(client);

        expect(mock).toHaveBeenCalledWith('/api/system/getConf', {});
        expect(result).toEqual({ lang: 'zh_CN' });
    });

    it('gets system fonts', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce(['Arial', 'Helvetica']);

        const result = await getSysFonts(client);

        expect(mock).toHaveBeenCalledWith('/api/system/getSysFonts', {});
        expect(result).toEqual(['Arial', 'Helvetica']);
    });

    it('gets boot progress', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ progress: 100, details: 'ready' });

        const result = await getBootProgress(client);

        expect(mock).toHaveBeenCalledWith('/api/system/bootProgress', {});
        expect(result.progress).toBe(100);
    });

    it('performs sync', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await performSync(client);

        expect(mock).toHaveBeenCalledWith('/api/sync/performSync', {});
    });

    it('gets version', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce('3.8.5');

        const result = await getVersion(client);

        expect(mock).toHaveBeenCalledWith('/api/system/version');
        expect(result).toBe('3.8.5');
    });

    it('gets current time', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce(1700000000000);

        const result = await getCurrentTime(client);

        expect(mock).toHaveBeenCalledWith('/api/system/currentTime');
        expect(result).toBe(1700000000000);
    });

    it('reloads UI', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadUI(client);

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadUI', {});
    });

    it('reloads icons', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadIcon(client);

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadIcon', {});
    });

    it('reloads filetree', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadFiletree(client);

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('reloads a protyle', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadProtyle(client, 'doc1');

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc1' });
    });

    it('reloads an attribute view', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadAttributeView(client, 'av1');

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadAttributeView', { id: 'av1' });
    });

    it('reloads tags', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await reloadTag(client);

        expect(mock).toHaveBeenCalledWith('/api/ui/reloadTag', {});
    });
});

