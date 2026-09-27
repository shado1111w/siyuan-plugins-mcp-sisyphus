import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { resolveFileFlag } from '@/cli/file-flag';

const dir = mkdtempSync(join(tmpdir(), 'file-flag-'));
const md = join(dir, 'note.md');
writeFileSync(md, '## From file\n\nbody\n');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('cli/file-flag resolveFileFlag', () => {
    it('reads a file into data for block actions', async () => {
        const out = await resolveFileFlag({ parentID: 'p1', file: md }, 'append');
        expect(out.data).toBe('## From file\n\nbody\n');
        expect(out.file).toBeUndefined();
        expect(out.parentID).toBe('p1');
    });

    it('reads a file into markdown for document create', async () => {
        const out = await resolveFileFlag({ notebook: 'nb', path: '/D', file: md }, 'create');
        expect(out.markdown).toBe('## From file\n\nbody\n');
        expect(out.data).toBeUndefined();
        expect(out.file).toBeUndefined();
    });

    it('passes args through untouched when no file flag', async () => {
        const input = { data: 'inline', id: 'x' };
        const out = await resolveFileFlag(input, 'append');
        expect(out).toEqual(input);
    });

    it('rejects --file combined with --data', async () => {
        await expect(resolveFileFlag({ file: md, data: 'x' }, 'append'))
            .rejects.toThrow('mutually exclusive');
    });

    it('rejects --file combined with --markdown', async () => {
        await expect(resolveFileFlag({ file: md, markdown: 'x' }, 'create'))
            .rejects.toThrow('mutually exclusive');
    });

    it('reports a clear error for a missing file', async () => {
        await expect(resolveFileFlag({ file: join(dir, 'nope.md') }, 'append'))
            .rejects.toThrow('could not read');
    });
});
