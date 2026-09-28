/*
 * Side-effect module — must be imported first. Installs a minimal `process`
 * global so bundled modules that read process.env at module top-level do not
 * crash inside the goja sandbox.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as {
    process?: { env: Record<string, string>; cwd: () => string; argv: string[] };
};

if (typeof g.process === 'undefined' || g.process === null) {
    g.process = { env: {}, cwd: () => '/', argv: [] };
} else {
    if (typeof g.process.env !== 'object' || g.process.env === null) g.process.env = {};
    if (typeof g.process.cwd !== 'function') g.process.cwd = () => '/';
    if (!Array.isArray(g.process.argv)) g.process.argv = [];
}

export {};
