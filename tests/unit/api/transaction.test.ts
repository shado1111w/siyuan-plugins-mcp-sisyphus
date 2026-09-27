import { describe, it, expect, vi } from 'vitest';
import { performTransactions } from '@/api/transaction';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('transaction api wrappers', () => {
    it('performs transactions with default options', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await performTransactions(client, [
            { doOperations: [{ action: 'insert' }], undoOperations: [] },
        ]);

        expect(mock).toHaveBeenCalledWith('/api/transactions', {
            transactions: [{ doOperations: [{ action: 'insert' }], undoOperations: [] }],
            reqId: expect.any(Number),
            app: '',
            session: '',
        });
    });

    it('performs transactions with custom options', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await performTransactions(client, [], { reqId: 999, app: 'test', session: 's1' });

        expect(mock).toHaveBeenCalledWith('/api/transactions', {
            transactions: [],
            reqId: 999,
            app: 'test',
            session: 's1',
        });
    });
});

