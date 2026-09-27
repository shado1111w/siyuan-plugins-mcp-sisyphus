import { describe, it, expect, vi } from 'vitest';
import {
    insertBlock,
    prependBlock,
    appendBlock,
    updateBlock,
    deleteBlock,
    moveBlock,
    foldBlock,
    unfoldBlock,
    getBlockKramdown,
    getBlockKramdowns,
    getChildBlocks,
    getDocInfo,
    transferBlockRef,
    checkBlockExist,
    getBlockInfo,
    getBlockBreadcrumb,
    getBlockDOM,
    getRecentUpdatedBlocks,
    getBlocksWordCount,
    batchInsertBlock,
    batchUpdateBlock,
    appendDailyNoteBlock,
    prependDailyNoteBlock,
    getDocsInfo,
    setBlockAttrs,
    getBlockAttrs,
} from '@/api/block';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('block api wrappers', () => {
    describe('insertBlock', () => {
        it('sends positional insert with all IDs', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await insertBlock(client, 'markdown', 'content', 'next-1', 'prev-1', 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/block/insertBlock', {
                dataType: 'markdown',
                data: 'content',
                nextID: 'next-1',
                previousID: 'prev-1',
                parentID: 'parent-1',
            });
        });

        it('accepts full request object', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await insertBlock(client, {
                dataType: 'markdown',
                data: 'obj-content',
                parentID: 'p1',
            });

            expect(mock).toHaveBeenCalledWith('/api/block/insertBlock', {
                dataType: 'markdown',
                data: 'obj-content',
                parentID: 'p1',
            });
        });
    });

    describe('prependBlock', () => {
        it('sends prepend request', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await prependBlock(client, 'markdown', 'first', 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/block/prependBlock', {
                dataType: 'markdown',
                data: 'first',
                parentID: 'parent-1',
            });
        });
    });

    describe('appendBlock', () => {
        it('sends append request', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await appendBlock(client, 'markdown', 'last', 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/block/appendBlock', {
                dataType: 'markdown',
                data: 'last',
                parentID: 'parent-1',
            });
        });
    });

    describe('updateBlock', () => {
        it('sends update request with block id', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await updateBlock(client, 'markdown', 'updated', 'block-1');

            expect(mock).toHaveBeenCalledWith('/api/block/updateBlock', {
                dataType: 'markdown',
                data: 'updated',
                id: 'block-1',
            });
        });
    });

    describe('deleteBlock', () => {
        it('sends delete request with id', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await deleteBlock(client, 'block-1');

            expect(mock).toHaveBeenCalledWith('/api/block/deleteBlock', { id: 'block-1' });
        });
    });

    describe('moveBlock', () => {
        it('sends move with previous and parent', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await moveBlock(client, 'block-1', 'prev-1', 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/block/moveBlock', {
                id: 'block-1',
                previousID: 'prev-1',
                parentID: 'parent-1',
            });
        });

        it('sends move without parent when only previous is given', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await moveBlock(client, 'block-1', 'prev-1');

            expect(mock).toHaveBeenCalledWith('/api/block/moveBlock', {
                id: 'block-1',
                previousID: 'prev-1',
                parentID: undefined,
            });
        });
    });

    describe('foldBlock / unfoldBlock', () => {
        it('folds a block', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            const result = await foldBlock(client, 'block-1');

            expect(mock).toHaveBeenCalledWith('/api/block/foldBlock', { id: 'block-1' });
            expect(result).toBeNull();
        });

        it('unfolds a block', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            const result = await unfoldBlock(client, 'block-1');

            expect(mock).toHaveBeenCalledWith('/api/block/unfoldBlock', { id: 'block-1' });
            expect(result).toBeNull();
        });
    });

    describe('getBlockKramdown', () => {
        it('reads kramdown without size limit', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'b1', kramdown: '# hello' });

            const result = await getBlockKramdown(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockKramdown', { id: 'b1' });
            expect(result.kramdown).toBe('# hello');
        });

        it('reads kramdown with size limit', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'b1', kramdown: 'x' });

            await getBlockKramdown(client, 'b1', 1024);

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockKramdown', { id: 'b1' }, 1024);
        });
    });

    describe('getBlockKramdowns', () => {
        it('reads multiple kramdown blocks in md mode', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ b1: '# a', b2: '# b' });

            const result = await getBlockKramdowns(client, ['b1', 'b2']);

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockKramdowns', { ids: ['b1', 'b2'], mode: 'md' });
            expect(result).toEqual({ b1: '# a', b2: '# b' });
        });

        it('reads multiple kramdown blocks in textmark mode', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ b1: 'a' });

            await getBlockKramdowns(client, ['b1'], 'textmark');

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockKramdowns', { ids: ['b1'], mode: 'textmark' });
        });
    });

    describe('getChildBlocks', () => {
        it('reads child blocks', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]);

            const result = await getChildBlocks(client, 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/block/getChildBlocks', { id: 'parent-1' });
            expect(result).toHaveLength(2);
        });

        it('reads child blocks with size limit', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([]);

            await getChildBlocks(client, 'parent-1', 2048);

            expect(mock).toHaveBeenCalledWith('/api/block/getChildBlocks', { id: 'parent-1' }, 2048);
        });
    });

    describe('getDocInfo', () => {
        it('reads doc info for a block', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'd1', name: 'Doc' });

            const result = await getDocInfo(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/getDocInfo', { id: 'b1' });
            expect(result.name).toBe('Doc');
        });
    });

    describe('transferBlockRef', () => {
        it('transfers refs from one block to another', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            const result = await transferBlockRef(client, 'from-1', 'to-1', ['ref-1']);

            expect(mock).toHaveBeenCalledWith('/api/block/transferBlockRef', {
                fromID: 'from-1',
                toID: 'to-1',
                refIDs: ['ref-1'],
            });
            expect(result).toBeNull();
        });

        it('transfers all refs when refIDs omitted', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await transferBlockRef(client, 'from-1', 'to-1');

            expect(mock).toHaveBeenCalledWith('/api/block/transferBlockRef', {
                fromID: 'from-1',
                toID: 'to-1',
                refIDs: undefined,
            });
        });
    });

    describe('checkBlockExist', () => {
        it('returns true when block exists', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce(true);

            const result = await checkBlockExist(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/checkBlockExist', { id: 'b1' });
            expect(result).toBe(true);
        });

        it('returns false when block does not exist', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce(false);

            const result = await checkBlockExist(client, 'missing');

            expect(result).toBe(false);
        });
    });

    describe('getBlockInfo', () => {
        it('reads block info', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'b1', type: 'p' });

            const result = await getBlockInfo(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockInfo', { id: 'b1' });
            expect(result).toEqual({ id: 'b1', type: 'p' });
        });
    });

    describe('getBlockBreadcrumb', () => {
        it('reads breadcrumb without exclusions', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([{ id: 'root' }]);

            const result = await getBlockBreadcrumb(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockBreadcrumb', { id: 'b1', excludeTypes: undefined });
            expect(result).toEqual([{ id: 'root' }]);
        });

        it('reads breadcrumb with exclusions', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([]);

            await getBlockBreadcrumb(client, 'b1', ['h1', 'l']);

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockBreadcrumb', { id: 'b1', excludeTypes: ['h1', 'l'] });
        });
    });

    describe('getBlockDOM', () => {
        it('reads block DOM', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'b1', dom: '<p>hi</p>' });

            const result = await getBlockDOM(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/block/getBlockDOM', { id: 'b1' });
            expect(result.dom).toBe('<p>hi</p>');
        });
    });

    describe('getRecentUpdatedBlocks', () => {
        it('reads recent blocks', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([{ id: 'b1' }]);

            const result = await getRecentUpdatedBlocks(client);

            expect(mock).toHaveBeenCalledWith('/api/block/getRecentUpdatedBlocks', {});
            expect(result).toEqual([{ id: 'b1' }]);
        });
    });

    describe('getBlocksWordCount', () => {
        it('reads word count for multiple blocks', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ b1: 10, b2: 20 });

            const result = await getBlocksWordCount(client, ['b1', 'b2']);

            expect(mock).toHaveBeenCalledWith('/api/block/getBlocksWordCount', { ids: ['b1', 'b2'] });
            expect(result).toEqual({ b1: 10, b2: 20 });
        });
    });

    describe('batchInsertBlock', () => {
        it('sends batch insert with mixed anchors', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await batchInsertBlock(client, [
                { dataType: 'markdown', data: 'a', parentID: 'p1' },
                { dataType: 'markdown', data: 'b', previousID: 'prev1' },
            ]);

            expect(mock).toHaveBeenCalledWith('/api/block/batchInsertBlock', {
                blocks: [
                    { dataType: 'markdown', data: 'a', parentID: 'p1' },
                    { dataType: 'markdown', data: 'b', previousID: 'prev1' },
                ],
            });
        });
    });

    describe('batchUpdateBlock', () => {
        it('sends batch update', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await batchUpdateBlock(client, [
                { id: 'b1', dataType: 'markdown', data: 'new1' },
                { id: 'b2', dataType: 'markdown', data: 'new2' },
            ]);

            expect(mock).toHaveBeenCalledWith('/api/block/batchUpdateBlock', {
                blocks: [
                    { id: 'b1', dataType: 'markdown', data: 'new1' },
                    { id: 'b2', dataType: 'markdown', data: 'new2' },
                ],
            });
        });
    });

    describe('appendDailyNoteBlock', () => {
        it('appends to daily note', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await appendDailyNoteBlock(client, 'nb1', 'markdown', 'entry');

            expect(mock).toHaveBeenCalledWith('/api/block/appendDailyNoteBlock', {
                notebook: 'nb1',
                dataType: 'markdown',
                data: 'entry',
            });
        });
    });

    describe('prependDailyNoteBlock', () => {
        it('prepends to daily note', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce([{ doOperations: [] }]);

            await prependDailyNoteBlock(client, 'nb1', 'markdown', 'first');

            expect(mock).toHaveBeenCalledWith('/api/block/prependDailyNoteBlock', {
                notebook: 'nb1',
                dataType: 'markdown',
                data: 'first',
            });
        });
    });

    describe('getDocsInfo', () => {
        it('reads docs info without optional flags', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ b1: { name: 'Doc' } });

            const result = await getDocsInfo(client, ['b1']);

            expect(mock).toHaveBeenCalledWith('/api/block/getDocsInfo', { ids: ['b1'], refCount: false, av: false });
            expect(result).toEqual({ b1: { name: 'Doc' } });
        });

        it('reads docs info with refCount and av flags', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({});

            await getDocsInfo(client, ['b1', 'b2'], true, true);

            expect(mock).toHaveBeenCalledWith('/api/block/getDocsInfo', { ids: ['b1', 'b2'], refCount: true, av: true });
        });
    });

    describe('setBlockAttrs / getBlockAttrs', () => {
        it('sets block attributes', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            const result = await setBlockAttrs(client, 'b1', { 'custom-key': 'val' });

            expect(mock).toHaveBeenCalledWith('/api/attr/setBlockAttrs', {
                id: 'b1',
                attrs: { 'custom-key': 'val' },
            });
            expect(result).toBeNull();
        });

        it('reads block attributes', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ 'custom-key': 'val' });

            const result = await getBlockAttrs(client, 'b1');

            expect(mock).toHaveBeenCalledWith('/api/attr/getBlockAttrs', { id: 'b1' });
            expect(result).toEqual({ 'custom-key': 'val' });
        });
    });
});

