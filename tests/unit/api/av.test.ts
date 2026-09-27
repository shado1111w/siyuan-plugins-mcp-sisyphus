import { describe, it, expect, vi } from 'vitest';
import {
    getAttributeView,
    renderAttributeView,
    getAttributeViewKeys,
    getAttributeViewFilterSort,
    setAttributeViewFilters,
    setAttributeViewSorts,
    addAttributeViewKey,
    removeAttributeViewKey,
    setAttributeViewBlockAttr,
    batchSetAttributeViewBlockAttrs,
    duplicateAttributeViewBlock,
    spinBlockDOM,
    getMirrorDatabaseBlocks,
    getAttributeViewPrimaryKeyValues,
} from '@/api/av';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('av api wrappers', () => {
    it('gets attribute view', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ av: { id: 'av1' } });

        const result = await getAttributeView(client, 'av1');

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeView', { id: 'av1' });
        expect(result.av).toEqual({ id: 'av1' });
    });

    it('renders attribute view', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ view: {} });

        const result = await renderAttributeView(client, { id: 'av1', page: 1, pageSize: 50 });

        expect(mock).toHaveBeenCalledWith('/api/av/renderAttributeView', { id: 'av1', page: 1, pageSize: 50 });
        expect(result.view).toEqual({});
    });

    it('renders with optional fields', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await renderAttributeView(client, { id: 'av1', blockID: 'b1', viewID: 'v1', query: 'test', createIfNotExist: true });

        expect(mock).toHaveBeenCalledWith('/api/av/renderAttributeView', {
            id: 'av1', blockID: 'b1', viewID: 'v1', query: 'test', createIfNotExist: true,
        });
    });

    it('gets attribute view keys', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce([{ keyID: 'k1' }]);

        const result = await getAttributeViewKeys(client, 'av1');

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeViewKeys', { id: 'av1' });
        expect(result).toEqual([{ keyID: 'k1' }]);
    });

    it('gets filter and sort', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ filters: [], sorts: [] });

        const result = await getAttributeViewFilterSort(client, { id: 'av1' });

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeViewFilterSort', { id: 'av1', blockID: '' });
        expect(result.filters).toEqual([]);
    });

    it('gets filter and sort with blockID', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ filters: [], sorts: [] });

        await getAttributeViewFilterSort(client, { id: 'av1', blockID: 'b1' });

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeViewFilterSort', { id: 'av1', blockID: 'b1' });
    });

    it('sets filters', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await setAttributeViewFilters(client, { avID: 'av1', blockID: 'b1', data: [{ column: 'c1', operator: 'eq', value: 'x' }] });

        expect(mock).toHaveBeenCalledWith('/api/av/setAttrViewFilters', {
            avID: 'av1', blockID: 'b1', data: [{ column: 'c1', operator: 'eq', value: 'x' }],
        });
    });

    it('sets sorts', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await setAttributeViewSorts(client, { avID: 'av1', blockID: 'b1', data: [{ column: 'c1', order: 'ASC' }] });

        expect(mock).toHaveBeenCalledWith('/api/av/setAttrViewSorts', {
            avID: 'av1', blockID: 'b1', data: [{ column: 'c1', order: 'ASC' }],
        });
    });

    it('adds an attribute view key', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await addAttributeViewKey(client, { avID: 'av1', keyID: 'k1', keyName: 'Status', keyType: 'select' });

        expect(mock).toHaveBeenCalledWith('/api/av/addAttributeViewKey', {
            avID: 'av1', keyID: 'k1', keyName: 'Status', keyType: 'select',
            keyIcon: '', previousKeyID: '',
        });
    });

    it('adds a key with icon and previous key', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await addAttributeViewKey(client, { avID: 'av1', keyID: 'k1', keyName: 'Col', keyType: 'text', keyIcon: '📌', previousKeyID: 'pk1' });

        expect(mock).toHaveBeenCalledWith('/api/av/addAttributeViewKey', {
            avID: 'av1', keyID: 'k1', keyName: 'Col', keyType: 'text',
            keyIcon: '📌', previousKeyID: 'pk1',
        });
    });

    it('removes an attribute view key', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await removeAttributeViewKey(client, 'av1', 'k1');

        expect(mock).toHaveBeenCalledWith('/api/av/removeAttributeViewKey', { avID: 'av1', keyID: 'k1', removeRelationDest: undefined });
    });

    it('removes a key with relation dest flag', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await removeAttributeViewKey(client, 'av1', 'k1', true);

        expect(mock).toHaveBeenCalledWith('/api/av/removeAttributeViewKey', { avID: 'av1', keyID: 'k1', removeRelationDest: true });
    });

    it('sets a cell value', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ value: { text: 'Done' } });

        const result = await setAttributeViewBlockAttr(client, { avID: 'av1', keyID: 'k1', itemID: 'i1', value: { text: 'Done' } });

        expect(mock).toHaveBeenCalledWith('/api/av/setAttributeViewBlockAttr', {
            avID: 'av1', keyID: 'k1', itemID: 'i1', value: { text: 'Done' },
        });
        expect(result.value).toEqual({ text: 'Done' });
    });

    it('batch sets cell values', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce(null);

        await batchSetAttributeViewBlockAttrs(client, 'av1', [{ text: 'a' }, { text: 'b' }]);

        expect(mock).toHaveBeenCalledWith('/api/av/batchSetAttributeViewBlockAttrs', {
            avID: 'av1', values: [{ text: 'a' }, { text: 'b' }],
        });
    });

    it('duplicates an attribute view block', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({ avID: 'av2', blockID: 'b2' });

        const result = await duplicateAttributeViewBlock(client, 'av1');

        expect(mock).toHaveBeenCalledWith('/api/av/duplicateAttributeViewBlock', { avID: 'av1' });
        expect(result.avID).toBe('av2');
    });

    it('spins block DOM', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ dom: '<div>spun</div>' });

        const result = await spinBlockDOM(client, '<div>orig</div>');

        expect(mock).toHaveBeenCalledWith('/api/lute/spinBlockDOM', { dom: '<div>orig</div>' });
        expect(result.dom).toBe('<div>spun</div>');
    });

    it('gets mirror database blocks', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ refDefs: [{ refID: 'r1', defIDs: ['d1'] }] });

        const result = await getMirrorDatabaseBlocks(client, 'av1');

        expect(mock).toHaveBeenCalledWith('/api/av/getMirrorDatabaseBlocks', { avID: 'av1' });
        expect(result.refDefs).toHaveLength(1);
    });

    it('gets primary key values', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ name: 'PK', blockIDs: ['b1'], rows: [] });

        const result = await getAttributeViewPrimaryKeyValues(client, { id: 'av1' });

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeViewPrimaryKeyValues', { id: 'av1' });
        expect(result.name).toBe('PK');
    });

    it('gets primary key values with keyword and pagination', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ name: 'PK', blockIDs: [], rows: [] });

        await getAttributeViewPrimaryKeyValues(client, { id: 'av1', keyword: 'search', page: 2, pageSize: 20 });

        expect(mock).toHaveBeenCalledWith('/api/av/getAttributeViewPrimaryKeyValues', {
            id: 'av1', keyword: 'search', page: 2, pageSize: 20,
        });
    });
});

