import { describe, it, expect, vi } from 'vitest';
import {
    createDoc,
    renameDoc,
    renameDocByID,
    removeDoc,
    removeDocByID,
    moveDocs,
    moveDocsByID,
    getHPathByPath,
    getHPathByID,
    getPathByID,
    getIDsByHPath,
    listDocsByPath,
    changeFileTreeSort,
    listDocTree,
    searchDocs,
    getDoc,
    getDocOutline,
    createDailyNote,
    duplicateDoc,
    removeDocs,
    createEmptyDoc,
    headingToDoc,
    docToHeading,
} from '@/api/document';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('document api wrappers', () => {
    describe('createDoc', () => {
        it('creates document with markdown', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce('doc-id-1');

            const result = await createDoc(client, 'nb1', '/folder/doc', '# Hello');

            expect(mock).toHaveBeenCalledWith('/api/filetree/createDocWithMd', {
                notebook: 'nb1',
                path: '/folder/doc',
                markdown: '# Hello',
            });
            expect(result).toBe('doc-id-1');
        });
    });

    describe('renameDoc', () => {
        it('renames document by path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await renameDoc(client, 'nb1', '/folder/doc', 'New Title');

            expect(mock).toHaveBeenCalledWith('/api/filetree/renameDoc', {
                notebook: 'nb1',
                path: '/folder/doc',
                title: 'New Title',
            });
        });
    });

    describe('renameDocByID', () => {
        it('renames document by ID', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await renameDocByID(client, 'doc-1', 'New Title');

            expect(mock).toHaveBeenCalledWith('/api/filetree/renameDocByID', {
                id: 'doc-1',
                title: 'New Title',
            });
        });
    });

    describe('removeDoc', () => {
        it('removes document by path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await removeDoc(client, 'nb1', '/folder/doc');

            expect(mock).toHaveBeenCalledWith('/api/filetree/removeDoc', {
                notebook: 'nb1',
                path: '/folder/doc',
            });
        });
    });

    describe('removeDocByID', () => {
        it('removes document by ID', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await removeDocByID(client, 'doc-1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/removeDocByID', { id: 'doc-1' });
        });
    });

    describe('moveDocs', () => {
        it('moves documents by path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await moveDocs(client, ['/a/doc1', '/a/doc2'], 'nb2', '/target');

            expect(mock).toHaveBeenCalledWith('/api/filetree/moveDocs', {
                fromPaths: ['/a/doc1', '/a/doc2'],
                toNotebook: 'nb2',
                toPath: '/target',
            });
        });
    });

    describe('moveDocsByID', () => {
        it('moves documents by ID', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await moveDocsByID(client, ['id1', 'id2'], 'parent-1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/moveDocsByID', {
                fromIDs: ['id1', 'id2'],
                toID: 'parent-1',
            });
        });
    });

    describe('getHPathByPath', () => {
        it('resolves path to hpath', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce('/folder/doc');

            const result = await getHPathByPath(client, 'nb1', '/folder/doc.sy');

            expect(mock).toHaveBeenCalledWith('/api/filetree/getHPathByPath', {
                notebook: 'nb1',
                path: '/folder/doc.sy',
            });
            expect(result).toBe('/folder/doc');
        });
    });

    describe('getHPathByID', () => {
        it('resolves ID to hpath', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce('/folder/doc');

            const result = await getHPathByID(client, 'doc-1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/getHPathByID', { id: 'doc-1' });
            expect(result).toBe('/folder/doc');
        });
    });

    describe('getPathByID', () => {
        it('resolves ID to storage path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ path: '/20260101-abc.sy' });

            const result = await getPathByID(client, 'doc-1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/getPathByID', { id: 'doc-1' });
            expect(result.path).toBe('/20260101-abc.sy');
        });
    });

    describe('getIDsByHPath', () => {
        it('resolves hpath to IDs', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce(['id1', 'id2']);

            const result = await getIDsByHPath(client, '/folder/doc', 'nb1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/getIDsByHPath', {
                path: '/folder/doc',
                notebook: 'nb1',
            });
            expect(result).toEqual(['id1', 'id2']);
        });
    });

    describe('listDocsByPath', () => {
        it('lists child documents', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ files: [], box: 'nb1', path: '/' });

            const result = await listDocsByPath(client, 'nb1', '/');

            expect(mock).toHaveBeenCalledWith('/api/filetree/listDocsByPath', {
                notebook: 'nb1',
                path: '/',
            });
            expect(result.files).toEqual([]);
        });

        it('lists child documents with options', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ files: [] });

            await listDocsByPath(client, 'nb1', '/folder', { isMax: true });

            expect(mock).toHaveBeenCalledWith('/api/filetree/listDocsByPath', {
                notebook: 'nb1',
                path: '/folder',
                isMax: true,
            });
        });
    });

    describe('changeFileTreeSort', () => {
        it('changes document sort order', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await changeFileTreeSort(client, 'nb1', ['/a', '/b']);

            expect(mock).toHaveBeenCalledWith('/api/filetree/changeSort', {
                notebook: 'nb1',
                paths: ['/a', '/b'],
            });
        });
    });

    describe('listDocTree', () => {
        it('lists document tree', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ tree: [] });

            const result = await listDocTree(client, 'nb1', '/');

            expect(mock).toHaveBeenCalledWith('/api/filetree/listDocTree', {
                notebook: 'nb1',
                path: '/',
            });
            expect(result).toEqual({ tree: [] });
        });
    });

    describe('searchDocs', () => {
        it('searches documents by keyword', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([{ id: 'doc1', name: 'Result' }]);

            const result = await searchDocs(client, 'keyword');

            expect(mock).toHaveBeenCalledWith('/api/filetree/searchDocs', {
                k: 'keyword',
                flashcard: undefined,
                excludeIDs: undefined,
            });
            expect(result).toHaveLength(1);
        });

        it('searches with flashcard flag and exclusions', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([]);

            await searchDocs(client, 'kw', true, ['ex1']);

            expect(mock).toHaveBeenCalledWith('/api/filetree/searchDocs', {
                k: 'kw',
                flashcard: true,
                excludeIDs: ['ex1'],
            });
        });
    });

    describe('getDoc', () => {
        it('reads document content', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'doc1', content: 'text' });

            const result = await getDoc(client, 'doc1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/getDoc', { id: 'doc1' });
            expect(result).toEqual({ id: 'doc1', content: 'text' });
        });

        it('reads document with mode and size', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce({ id: 'doc1' });

            await getDoc(client, 'doc1', 1, 100);

            expect(mock).toHaveBeenCalledWith('/api/filetree/getDoc', {
                id: 'doc1',
                mode: 1,
                size: 100,
            });
        });
    });

    describe('getDocOutline', () => {
        it('reads document outline', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([{ id: 'h1', name: 'Heading' }]);

            const result = await getDocOutline(client, 'doc1');

            expect(mock).toHaveBeenCalledWith('/api/outline/getDocOutline', {
                id: 'doc1',
                preview: false,
            });
            expect(result).toHaveLength(1);
        });

        it('reads outline with preview and notebook', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestRead);
            mock.mockResolvedValueOnce([]);

            await getDocOutline(client, 'doc1', true, 'nb1');

            expect(mock).toHaveBeenCalledWith('/api/outline/getDocOutline', {
                id: 'doc1',
                preview: true,
                notebook: 'nb1',
            });
        });
    });

    describe('createDailyNote', () => {
        it('creates daily note', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ id: 'daily-1' });

            const result = await createDailyNote(client, 'nb1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/createDailyNote', {
                notebook: 'nb1',
                app: undefined,
            });
            expect(result.id).toBe('daily-1');
        });

        it('creates daily note with app', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ id: 'daily-2' });

            await createDailyNote(client, 'nb1', 'myapp');

            expect(mock).toHaveBeenCalledWith('/api/filetree/createDailyNote', {
                notebook: 'nb1',
                app: 'myapp',
            });
        });
    });

    describe('duplicateDoc', () => {
        it('duplicates a document', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ id: 'dup-1', notebook: 'nb1', path: '/copy' });

            const result = await duplicateDoc(client, 'doc1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/duplicateDoc', { id: 'doc1' });
            expect(result.id).toBe('dup-1');
        });
    });

    describe('removeDocs', () => {
        it('removes multiple documents by path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await removeDocs(client, ['/a/doc1', '/a/doc2']);

            expect(mock).toHaveBeenCalledWith('/api/filetree/removeDocs', {
                paths: ['/a/doc1', '/a/doc2'],
            });
        });
    });

    describe('createEmptyDoc', () => {
        it('creates an empty document', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ id: 'empty-1' });

            const result = await createEmptyDoc(client, 'nb1', '/folder/doc', 'Title');

            expect(mock).toHaveBeenCalledWith('/api/filetree/createDoc', {
                notebook: 'nb1',
                path: '/folder/doc',
                title: 'Title',
                md: '',
                sorts: undefined,
            });
            expect(result.id).toBe('empty-1');
        });

        it('creates document with initial markdown and sorts', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ id: 'empty-2' });

            await createEmptyDoc(client, 'nb1', '/folder/doc', 'Title', '# Init', ['s1']);

            expect(mock).toHaveBeenCalledWith('/api/filetree/createDoc', {
                notebook: 'nb1',
                path: '/folder/doc',
                title: 'Title',
                md: '# Init',
                sorts: ['s1'],
            });
        });
    });

    describe('headingToDoc', () => {
        it('converts heading to document', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await headingToDoc(client, 'heading-1', 'nb1', '/target', '/prev');

            expect(mock).toHaveBeenCalledWith('/api/filetree/heading2Doc', {
                srcHeadingID: 'heading-1',
                targetNoteBook: 'nb1',
                targetPath: '/target',
                previousPath: '/prev',
            });
        });

        it('converts heading without target path', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce(null);

            await headingToDoc(client, 'heading-1', 'nb1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/heading2Doc', {
                srcHeadingID: 'heading-1',
                targetNoteBook: 'nb1',
                targetPath: undefined,
                previousPath: undefined,
            });
        });
    });

    describe('docToHeading', () => {
        it('converts document to heading', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ srcTreeBox: 'box1', srcTreePath: '/path' });

            const result = await docToHeading(client, 'src-1', 'target-1');

            expect(mock).toHaveBeenCalledWith('/api/filetree/doc2Heading', {
                srcID: 'src-1',
                targetID: 'target-1',
                after: false,
            });
            expect(result.srcTreeBox).toBe('box1');
        });

        it('converts document to heading after target', async () => {
            const client = makeClient();
            const mock = vi.mocked(client.requestWrite);
            mock.mockResolvedValueOnce({ srcTreeBox: 'box1', srcTreePath: '/path' });

            await docToHeading(client, 'src-1', 'target-1', true);

            expect(mock).toHaveBeenCalledWith('/api/filetree/doc2Heading', {
                srcID: 'src-1',
                targetID: 'target-1',
                after: true,
            });
        });
    });
});

