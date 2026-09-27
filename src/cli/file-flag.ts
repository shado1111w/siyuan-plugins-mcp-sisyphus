import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// --file: read block/markdown content from a local file (or `-` for stdin) in
// the CLI surface, so agents never inline large content into --data.
// ---------------------------------------------------------------------------

async function readFileFlagSource(source: string): Promise<string> {
    if (source === '-') {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks).toString('utf-8');
    }
    try {
        return readFileSync(source, 'utf-8');
    } catch (error) {
        throw new Error(
            `--file could not read ${source}: ${error instanceof Error ? error.message : String(error)}. `+
            'Pass an existing UTF-8 file path or `-` for stdin.',
        );
    }
}

// --file is mutually exclusive with --data/--markdown. The resolved content is
// written to `markdown` for document create, `data` for every other action.
export async function resolveFileFlag(args: Record<string, unknown>, action: string): Promise<Record<string, unknown>> {
    const file = args.file;
    if (typeof file !== 'string' || file.length === 0) return args;
    if (args.data !== undefined || args.markdown !== undefined) {
        throw new Error('--file is mutually exclusive with --data/--markdown; provide only one content source.');
    }
    const content = await readFileFlagSource(file);
    const { file: _omit, ...rest } = args;
    const key = action === 'create' ? 'markdown' : 'data';
    return { ...rest, [key]: content };
}
