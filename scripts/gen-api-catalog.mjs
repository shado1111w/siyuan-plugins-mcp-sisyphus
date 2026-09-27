#!/usr/bin/env node
// Generate api-catalog.json from the SiYuan kernel Go source.
// Usage: node scripts/gen-api-catalog.mjs [kernelApiDir] [outFile]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KERNEL_API = process.argv[2] || '/Users/aciwei/go/src/github.com/siyuan-note/siyuan/kernel/api';
const OUT = process.argv[3] || 'api-catalog.json';

const goTypeToJson = (t) => ({
    string: 'string', float64: 'number', int: 'number', int64: 'number',
    bool: 'boolean', '[]any': 'array', '[]string': 'array',
    'map[string]any': 'object', 'map[string]interface{}': 'object', any: 'any',
}[t] ?? 'any');

// --- 1) router.go -> route triples ---
const router = readFileSync(join(KERNEL_API, 'router.go'), 'utf-8');
const routeRe = /ginServer\.Handle\("(GET|POST|PUT|DELETE|PATCH)",\s*"([^"+)"]*)",\s*(?:[\w.]+,\s*)*([\w.]+)\)/g;
const routes = [];
let m;
while ((m = routeRe.exec(router)) !== null) {
    routes.push({ method: m[1], path: m[2], handler: m[3] });
}

// --- 2) parse every kernel/api/*.go file -> function bodies + decl types ---
const files = readdirSync(KERNEL_API).filter(f => f.endsWith('.go') && !f.endsWith('_test.go'));
const funcBodies = new Map();   // name -> { body, file }
for (const file of files) {
    const src = readFileSync(join(KERNEL_API, file), 'utf-8');
    const lines = src.split('\n');
    const funcRe = /^func\s+(\w+)\s*\(/;
    for (let i = 0; i < lines.length; i++) {
        const fm = funcRe.exec(lines[i]);
        if (!fm) continue;
        // capture body until matching closing brace at column 0
        let depth = 0, started = false, end = i;
        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') { depth--; }
            }
            if (started && depth === 0) { end = j; break; }
        }
        const body = lines.slice(i, end + 1).join('\n');
        funcBodies.set(fm[1], { body, file, line: i + 1 });
        i = end;
    }
}

// --- 3) param extraction ---
// varDecl types per function body: name -> goType
function collectVarTypes(body) {
    const map = new Map();
    // `var a, b string` / `var c float64` / `var x []string` / `var m map[string]any`
    for (const vm of body.matchAll(/\bvar\s+([\w,\s]+?)\s+(\[\][\w.]+|map\[[^\]]+\][\w.]+|[\w.*]+)/g)) {
        const names = vm[1].split(',').map(x => x.trim()).filter(Boolean);
        for (const n of names) map.set(n, vm[2]);
    }
    // `x := arg["k"].(T)` direct asserts
    for (const am of body.matchAll(/(\w+)\s*(?::=|,)?\s*\w*\s*:=?\s*arg\["([\w]+)"\]\.\(([^)]+)\)/g)) {
        // handled separately below
    }
    return map;
}

function extractParams(body) {
    const params = new Map(); // name -> {jsonType, required, src}
    const varTypes = collectVarTypes(body);
    // util.BindJsonArg("key", &dest, required, rejectEmpty)
    for (const bm of body.matchAll(/util\.BindJsonArg\("([\w]+)",\s*&?([\w]+),\s*(true|false),\s*(true|false)\)/g)) {
        const [, key, dest, required] = bm;
        params.set(key, { jsonType: goTypeToJson(varTypes.get(dest) ?? 'any'), required: required === 'true', src: 'BindJsonArg' });
    }
    // util.ParseJsonArg[T]("key", arg, ret, required, rejectEmpty)
    for (const pm of body.matchAll(/util\.ParseJsonArg\[([^\]]+)\]\("([\w]+)",\s*arg,\s*ret,\s*(true|false),\s*(true|false)\)/g)) {
        const [, goT, key, required] = pm;
        params.set(key, { jsonType: goTypeToJson(goT), required: required === 'true', src: 'ParseJsonArg' });
    }
    // direct arg["key"] reads — required-ness inferred from context
    for (const am of body.matchAll(/arg\["([\w]+)"\]/g)) {
        const key = am[1];
        if (params.has(key)) continue;
        const lineStart = body.lastIndexOf('\n', am.index) + 1;
        const lineEnd = body.indexOf('\n', am.index);
        const line = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd);
        const assertM = /arg\["[\w]+"\]\.\(([^)]+)\)/.exec(line);
        const hasAssert = !!assertM;
        const jsonType = hasAssert ? goTypeToJson(assertM[1]) : 'any';
        const guarded = /\bnil\s*(!=|<|==|>)\s*arg\["/.test(line)
            || /,\s*(_|ok)\s*:=/.test(line)
            || /if\s+\w+\s*:=\s*arg\["/.test(line);
        const required = hasAssert && !guarded;
        params.set(key, { jsonType, required, src: 'arg-read' });
    }
    return [...params.entries()].map(([name, v]) => ({ name, ...v }));
}

// --- 4) emit ---
const catalog = {};
let withParams = 0, bare = 0;
for (const r of routes) {
    const fn = funcBodies.get(r.handler);
    const entry = { method: r.method, handler: r.handler };
    if (fn) {
        entry.sourceRef = `kernel/api/${fn.file}:${fn.line}`;
        entry.params = extractParams(fn.body);
        if (entry.params.length > 0) withParams++; else bare++;
        if (/c\.Param\(|c\.Query\(|websocket|SSE|Upgrade/i.test(fn.body)) entry.note = 'uses path/query/stream params; inspect kernel source';
        else if (entry.params.length === 0) entry.params = [];
    } else {
        // handler lives outside kernel/api (e.g. model.*)
        entry.params = [];
        entry.note = 'handler defined outside kernel/api; inspect kernel source';
        entry.dynamic = true;
        bare++;
    }
    // dedupe multi-method same path+handler (GET+POST alias) — keep one entry keyed by path+method
    const key = `${r.method} ${r.path}`;
    catalog[key] = entry;
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), kernel: KERNEL_API, endpoints: catalog }, null, 2));
console.log(`[gen-api-catalog] ${Object.keys(catalog).length} endpoints (${withParams} with params, ${bare} bare/dynamic) -> ${OUT}`);
