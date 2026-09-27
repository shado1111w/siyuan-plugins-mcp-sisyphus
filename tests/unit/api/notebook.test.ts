import { describe, it, expect, vi } from 'vitest';
import {
    listNotebooks,
    openNotebook,
    closeNotebook,
    createNotebook,
    removeNotebook,
    renameNotebook,
    getNotebookConf,
    setNotebookConf,
    setNotebookIcon,
} from '@/api/notebook';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('notebook api wrappers', () => {
    it('lists all notebooks', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce([{ id: 'nb1', name: 'Test', icon: '', sort: 0, closed: false }]);

        const result = await listNotebooks(client);

        expect(mock).toHaveBeenCalledWith('/api/notebook/lsNotebooks');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Test');
    });

    it('opens a notebook', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await openNotebook(client, 'nb1');

        expect(mock).toHaveBeenCalledWith('/api/notebook/openNotebook', { notebook: 'nb1' });
    });

    it('closes a notebook', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await closeNotebook(client, 'nb1');

        expect(mock).toHaveBeenCalledWith('/api/notebook/closeNotebook', { notebook: 'nb1' });
    });

    it('creates a notebook', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ notebook: 'new-id', name: 'New' });

        const result = await createNotebook(client, 'New');

        expect(mock).toHaveBeenCalledWith('/api/notebook/createNotebook', { name: 'New' });
        expect(result.notebook).toBe('new-id');
    });

    it('removes a notebook', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await removeNotebook(client, 'nb1');

        expect(mock).toHaveBeenCalledWith('/api/notebook/removeNotebook', { notebook: 'nb1' });
    });

    it('renames a notebook', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await renameNotebook(client, 'nb1', 'Renamed');

        expect(mock).toHaveBeenCalledWith('/api/notebook/renameNotebook', { notebook: 'nb1', name: 'Renamed' });
    });

    it('gets notebook configuration', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ name: 'Test', closed: false });

        const result = await getNotebookConf(client, 'nb1');

        expect(mock).toHaveBeenCalledWith('/api/notebook/getNotebookConf', { notebook: 'nb1' });
        expect(result.name).toBe('Test');
    });

    it('sets notebook configuration', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await setNotebookConf(client, 'nb1', { closed: true });

        expect(mock).toHaveBeenCalledWith('/api/notebook/setNotebookConf', {
            notebook: 'nb1',
            conf: { closed: true },
        });
    });

    it('sets notebook icon', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await setNotebookIcon(client, 'nb1', '1f4d4');

        expect(mock).toHaveBeenCalledWith('/api/notebook/setNotebookIcon', { notebook: 'nb1', icon: '1f4d4' });
    });
});

