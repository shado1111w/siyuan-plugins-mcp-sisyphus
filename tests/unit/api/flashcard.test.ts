import { describe, it, expect, vi } from 'vitest';
import {
    getRiffDecks,
    getRiffDueCards,
    getNotebookRiffDueCards,
    getTreeRiffDueCards,
    reviewRiffCard,
    skipReviewRiffCard,
    addRiffCards,
    removeRiffCards,
    getRiffCards,
    getRiffCardsByBlockIDs,
} from '@/api/flashcard';
import type { SiYuanClient } from '@/api/client';

function makeClient() {
    return {
        requestRead: vi.fn(),
        requestWrite: vi.fn(),
    } as unknown as SiYuanClient;
}

describe('flashcard api wrappers', () => {
    it('gets riff decks', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce([{ id: 'd1', name: 'Default' }]);

        const result = await getRiffDecks(client);

        expect(mock).toHaveBeenCalledWith('/api/riff/getRiffDecks', {});
        expect(result).toHaveLength(1);
    });

    it('gets due cards for a deck', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ cards: [], unreviewedCount: 0 });

        const result = await getRiffDueCards(client, 'deck1');

        expect(mock).toHaveBeenCalledWith('/api/riff/getRiffDueCards', { deckID: 'deck1' });
        expect(result.cards).toEqual([]);
    });

    it('gets due cards with reviewed cards', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ cards: [] });

        await getRiffDueCards(client, 'deck1', [{ cardID: 'c1' }]);

        expect(mock).toHaveBeenCalledWith('/api/riff/getRiffDueCards', {
            deckID: 'deck1',
            reviewedCards: [{ cardID: 'c1' }],
        });
    });

    it('gets notebook due cards', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ cards: [] });

        await getNotebookRiffDueCards(client, 'nb1');

        expect(mock).toHaveBeenCalledWith('/api/riff/getNotebookRiffDueCards', { notebook: 'nb1' });
    });

    it('gets tree due cards', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ cards: [] });

        await getTreeRiffDueCards(client, 'root1');

        expect(mock).toHaveBeenCalledWith('/api/riff/getTreeRiffDueCards', { rootID: 'root1' });
    });

    it('reviews a card', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await reviewRiffCard(client, 'deck1', 'card1', 3);

        expect(mock).toHaveBeenCalledWith('/api/riff/reviewRiffCard', {
            deckID: 'deck1',
            cardID: 'card1',
            rating: 3,
        });
    });

    it('skips a card review', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await skipReviewRiffCard(client, 'deck1', 'card1');

        expect(mock).toHaveBeenCalledWith('/api/riff/skipReviewRiffCard', { deckID: 'deck1', cardID: 'card1' });
    });

    it('adds cards to a deck', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await addRiffCards(client, 'deck1', ['b1', 'b2']);

        expect(mock).toHaveBeenCalledWith('/api/riff/addRiffCards', { deckID: 'deck1', blockIDs: ['b1', 'b2'] });
    });

    it('removes cards from a deck', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestWrite);
        mock.mockResolvedValueOnce({});

        await removeRiffCards(client, 'deck1', ['b1']);

        expect(mock).toHaveBeenCalledWith('/api/riff/removeRiffCards', { deckID: 'deck1', blockIDs: ['b1'] });
    });

    it('gets cards by page', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ cards: [], total: 0 });

        const result = await getRiffCards(client, 'deck1', 1);

        expect(mock).toHaveBeenCalledWith('/api/riff/getRiffCards', { id: 'deck1', page: 1 });
        expect(result.total).toBe(0);
    });

    it('gets cards by block IDs', async () => {
        const client = makeClient();
        const mock = vi.mocked(client.requestRead);
        mock.mockResolvedValueOnce({ blocks: [{ blockID: 'b1' }] });

        const result = await getRiffCardsByBlockIDs(client, ['b1']);

        expect(mock).toHaveBeenCalledWith('/api/riff/getRiffCardsByBlockIDs', { blockIDs: ['b1'] });
        expect(result.blocks).toHaveLength(1);
    });
});

