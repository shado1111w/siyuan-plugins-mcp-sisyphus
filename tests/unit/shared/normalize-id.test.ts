import { describe, expect, it } from 'vitest';

import { normalizeId, toId, SIYUAN_ID_PATTERN } from '@/shared/normalize-id';

const ID = '20240101120000-abcdefg';

describe('normalizeId', () => {
    it('passes a bare ID through unchanged', () => {
        const r = normalizeId(ID);
        expect(r).toMatchObject({ id: ID, kind: 'bare', normalized: false });
    });
    it('unwraps a block reference ((id))', () => {
        const r = normalizeId('((' + ID + '))');
        expect(r).toMatchObject({ id: ID, kind: 'block-ref', normalized: true });
    });
    it('extracts from a siyuan://blocks/ URL', () => {
        const r = normalizeId('siyuan://blocks/' + ID);
        expect(r).toMatchObject({ id: ID, kind: 'siyuan-url', normalized: true });
    });
    it('extracts from a web URL with ?id=', () => {
        const r = normalizeId('http://127.0.0.1:6806/stage/build/desktop/?id=' + ID);
        expect(r).toMatchObject({ id: ID, kind: 'web-url', normalized: true });
    });
    it('extracts from a web URL with &id= after other params', () => {
        const r = normalizeId('https://example.com/x?foo=1&id=' + ID + '&bar=2');
        expect(r).toMatchObject({ id: ID, kind: 'web-url', normalized: true });
    });
    it('extracts from a /blocks/<id> path segment', () => {
        const r = normalizeId('siyuan://blocks/' + ID + '?foo=bar');
        expect(r.id).toBe(ID);
    });
    it('trims surrounding whitespace', () => {
        const r = normalizeId('  ' + ID + '  ');
        expect(r.id).toBe(ID);
    });
    it('passes through a human-readable path', () => {
        const r = normalizeId('/Notebook/Folder/Doc');
        expect(r).toMatchObject({ id: '/Notebook/Folder/Doc', kind: 'passthrough', normalized: false });
    });
    it('passes through a non-ID block-ref inner value', () => {
        const r = normalizeId('((not-an-id))');
        expect(r).toMatchObject({ kind: 'passthrough', normalized: false });
    });
    it('passes through an empty string', () => {
        const r = normalizeId('');
        expect(r).toMatchObject({ id: '', kind: 'passthrough', normalized: false });
    });
    it('passes through a URL with no recognizable id', () => {
        const r = normalizeId('https://example.com/no/id/here');
        expect(r).toMatchObject({ kind: 'passthrough', normalized: false });
    });
});

describe('toId', () => {
    it('returns the bare id for a ref', () => {
        expect(toId('((' + ID + '))')).toBe(ID);
    });
    it('returns input for passthrough', () => {
        expect(toId('/Notebook/Doc')).toBe('/Notebook/Doc');
    });
});

describe('SIYUAN_ID_PATTERN', () => {
    it('matches a canonical id', () => {
        expect(SIYUAN_ID_PATTERN.test(ID)).toBe(true);
    });
    it('rejects malformed ids', () => {
        expect(SIYUAN_ID_PATTERN.test('20240101-abc')).toBe(false);
        expect(SIYUAN_ID_PATTERN.test('abc')).toBe(false);
    });
});
