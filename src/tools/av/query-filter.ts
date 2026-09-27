/**
 * av query — human filter/sort grammar and in-process evaluator.
 * Grammar: Col=val Col!=val Col~substr Col!~substr Col>num Col<num Col>=num Col<=num
 *          bare Col = is-not-empty; !Col = is-empty. Sort: 'Col:asc' | 'Col:desc'.
 */

export interface AvQueryColumn { id: string; name: string; type: string; }
export type FilterOperator = 'eq' | 'ne' | 'contains' | 'notContains' | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'notEmpty';
export interface ParsedFilter { column: string; columnID?: string; columnName?: string; op: FilterOperator; value?: string; }
export interface ParsedSort { column: string; columnID?: string; columnName?: string; order: 'asc' | 'desc'; }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const OPS: Array<{ token: string; op: FilterOperator }> = [
    { token: '!~', op: 'notContains' },
    { token: '!=', op: 'ne' },
    { token: '>=', op: 'gte' },
    { token: '<=', op: 'lte' },
    { token: '>', op: 'gt' },
    { token: '<', op: 'lt' },
    { token: '~', op: 'contains' },
    { token: '=', op: 'eq' },
];

export function parseFilterExpression(raw: string): ParseResult<ParsedFilter> {
    const input = raw.trim();
    if (!input) return { ok: false, message: 'Empty filter expression.' };
    if (input.startsWith('!') && !input.includes('~') && !input.includes('=')) {
        const column = input.slice(1).trim();
        if (!column) return { ok: false, message: 'Filter "' + raw + '" is missing a column after \'!\'.' };
        return { ok: true, value: { column, op: 'empty' } };
    }
    let bestIndex = -1; let best: (typeof OPS)[number] | undefined;
    for (const o of OPS) {
        const idx = input.indexOf(o.token);
        if (idx > 0 && (bestIndex < 0 || idx < bestIndex || (idx === bestIndex && o.token.length > best!.token.length))) {
            bestIndex = idx; best = o;
        }
    }
    if (!best) {
        if (/^[A-Za-z0-9_\u4e00-\u9fa5][^=<>!~]*$/.test(input)) {
            return { ok: true, value: { column: input, op: 'notEmpty' } };
        }
        return { ok: false, message: 'Filter "' + raw + '" could not be parsed; expected Col=val, Col!=val, Col~substr, Col>num, !Col, or bare Col.' };
    }
    const column = input.slice(0, bestIndex).trim();
    const value = input.slice(bestIndex + best.token.length).trim();
    if (!column) return { ok: false, message: 'Filter "' + raw + '" is missing a column name before the operator.' };
    if (value === '') return { ok: false, message: 'Filter "' + raw + '" is missing a value after the operator.' };
    if (['gt', 'lt', 'gte', 'lte'].includes(best.op) && !/^-?\d+(\.\d+)?$/.test(value) && Number.isNaN(Date.parse(value))) {
        return { ok: false, message: 'Filter "' + raw + '" uses a comparison operator but "' + value + '" is not a number or ISO date.' };
    }
    return { ok: true, value: { column, op: best.op, value } };
}

export function parseSortExpression(raw: string): ParseResult<ParsedSort> {
    const input = raw.trim();
    if (!input) return { ok: false, message: 'Empty sort expression.' };
    const colon = input.lastIndexOf(':');
    if (colon < 0) return { ok: true, value: { column: input, order: 'asc' } };
    const column = input.slice(0, colon).trim();
    const order = input.slice(colon + 1).trim().toLowerCase();
    if (!column) return { ok: false, message: 'Sort "' + raw + '" is missing a column name.' };
    if (order !== 'asc' && order !== 'desc') return { ok: false, message: 'Sort "' + raw + '" order must be "asc" or "desc", got "' + order + '".' };
    return { ok: true, value: { column, order } };
}

export function resolveColumn(columns: AvQueryColumn[], token: string, kind: 'filter' | 'sort'): { ok: true; column: AvQueryColumn } | { ok: false; message: string } {
    const trimmed = token.trim();
    const byId = columns.find((c) => c.id === trimmed);
    if (byId) return { ok: true, column: byId };
    const byName = columns.filter((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (byName.length === 1) return { ok: true, column: byName[0] };
    if (byName.length > 1) return { ok: false, message: 'Column "' + trimmed + '" matched ' + byName.length + ' columns; use the column ID instead.' };
    const names = columns.map((c) => c.name).filter(Boolean).join(', ');
    return { ok: false, message: (kind === 'filter' ? 'Filter' : 'Sort') + ' column "' + trimmed + '" was not found. Available columns: ' + names + '.' };
}

function cellToComparable(cell: unknown): { text: string; numeric?: number; isEmpty: boolean } {
    if (cell === null || cell === undefined || cell === '') return { text: '', isEmpty: true };
    if (typeof cell === 'number') return { text: String(cell), numeric: cell, isEmpty: false };
    if (typeof cell === 'boolean') return { text: String(cell), isEmpty: false };
    if (Array.isArray(cell)) {
        const parts = cell.map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).content : item)).filter((v) => v !== undefined && v !== null && v !== '');
        return { text: parts.join(', '), isEmpty: parts.length === 0 };
    }
    if (typeof cell === 'object') {
        const rec = cell as Record<string, unknown>;
        if (typeof rec.content === 'number') return { text: String(rec.content), numeric: rec.content, isEmpty: false };
        if (typeof rec.content === 'string') return { text: rec.content, isEmpty: rec.content === '' };
        return { text: JSON.stringify(cell), isEmpty: false };
    }
    return { text: String(cell), isEmpty: false };
}

export function evaluateFilter(filter: ParsedFilter, cells: Record<string, unknown>): boolean {
    const raw = filter.columnID ? cells[filter.columnID] : undefined;
    const cmp = cellToComparable(raw);
    const expected = (filter.value ?? '').toLowerCase();
    switch (filter.op) {
        case 'empty': return cmp.isEmpty;
        case 'notEmpty': return !cmp.isEmpty;
        case 'eq': return !cmp.isEmpty && cmp.text.toLowerCase() === expected;
        case 'ne': return cmp.isEmpty || cmp.text.toLowerCase() !== expected;
        case 'contains': return !cmp.isEmpty && cmp.text.toLowerCase().includes(expected);
        case 'notContains': return cmp.isEmpty || !cmp.text.toLowerCase().includes(expected);
        case 'gt': case 'lt': case 'gte': case 'lte': {
            const exp = filter.value ?? '';
            const expNum = /^-?\d+(\.\d+)?$/.test(exp) ? Number(exp) : Date.parse(exp);
            const act = cmp.numeric ?? (/^-?\d+(\.\d+)?$/.test(cmp.text) ? Number(cmp.text) : Date.parse(cmp.text));
            if (!Number.isFinite(act) || !Number.isFinite(expNum)) return false;
            if (filter.op === 'gt') return act > expNum;
            if (filter.op === 'lt') return act < expNum;
            if (filter.op === 'gte') return act >= expNum;
            return act <= expNum;
        }
    }
}

export function compareRowsBySort(sort: ParsedSort, aCells: Record<string, unknown>, bCells: Record<string, unknown>): number {
    const a = cellToComparable(aCells[sort.columnID!]);
    const b = cellToComparable(bCells[sort.columnID!]);
    if (a.isEmpty && b.isEmpty) return 0;
    if (a.isEmpty) return 1;
    if (b.isEmpty) return -1;
    const result = (a.numeric !== undefined && b.numeric !== undefined)
        ? a.numeric - b.numeric
        : a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' });
    return sort.order === 'desc' ? -result : result;
}

export function sortRows<T extends { cells: Record<string, unknown> }>(rows: T[], sorts: ParsedSort[]): T[] {
    if (sorts.length === 0) return rows;
    return [...rows].sort((a, b) => {
        for (const sort of sorts) {
            const cmp = compareRowsBySort(sort, a.cells, b.cells);
            if (cmp !== 0) return cmp;
        }
        return 0;
    });
}

export function filterRows<T extends { cells: Record<string, unknown> }>(rows: T[], filters: ParsedFilter[]): T[] {
    if (filters.length === 0) return rows;
    return rows.filter((row) => filters.every((f) => evaluateFilter(f, row.cells)));
}

// ---------------------------------------------------------------------------
// --filter-json: nested {and|or|leaf} filter compiled to a row predicate. Leaf
// shape { "Col": "expr" } where expr reuses the linear operator tokens
// (=, !=, ~, !~, >, <, >=, <=), a bare value (eq), empty string (notEmpty), or
// "!" (empty). Combines with linear --filter via an implicit top-level AND.
// ---------------------------------------------------------------------------

export interface FilterJsonLeaf { op: FilterOperator; value?: string }

const OP_TOKENS: Record<string, FilterOperator> = {
    '=': 'eq', '!=': 'ne', '~': 'contains', '!~': 'notContains',
    '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte',
};

function leafFromExpr(expr: string): { ok: true; leaf: FilterJsonLeaf } | { ok: false; message: string } {
    const t = expr.trim();
    const m = /^(!?~|!=|>=|<=|>|<|=)/.exec(t);
    if (m) {
        const value = t.slice(m[1].length).trim();
        if (value === '') return { ok: false, message: 'filterJson leaf has an operator but no value: "' + expr + '".' };
        return { ok: true, leaf: { op: OP_TOKENS[m[1]], value } };
    }
    if (t === '') return { ok: true, leaf: { op: 'notEmpty' } };
    if (t === '!') return { ok: true, leaf: { op: 'empty' } };
    return { ok: true, leaf: { op: 'eq', value: t } };
}

export function compileFilterJson(
    node: unknown,
    columns: AvQueryColumn[],
): { ok: true; pred: (cells: Record<string, unknown>) => boolean; leaves: number } | { ok: false; message: string } {
    const MAX_DEPTH = 12;
    const MAX_LEAVES = 64;
    let leaves = 0;
    const build = (n: unknown, depth: number): { ok: true; pred: (c: Record<string, unknown>) => boolean } | { ok: false; message: string } => {
        if (depth > MAX_DEPTH) return { ok: false, message: 'filterJson nesting exceeds ' + MAX_DEPTH + ' levels.' };
        if (n === null || typeof n !== 'object' || Array.isArray(n)) return { ok: false, message: 'filterJson node must be an object.' };
        const obj = n as Record<string, unknown>;
        if (Array.isArray(obj.and)) {
            const subs = obj.and.map(s => build(s, depth + 1));
            const bad = subs.find(s => !s.ok);
            if (bad) return bad as { ok: false; message: string };
            const preds = (subs as Array<{ ok: true; pred: (c: Record<string, unknown>) => boolean }>).map(s => s.pred);
            return { ok: true, pred: (c) => preds.every(p => p(c)) };
        }
        if (Array.isArray(obj.or)) {
            const subs = obj.or.map(s => build(s, depth + 1));
            const bad = subs.find(s => !s.ok);
            if (bad) return bad as { ok: false; message: string };
            const preds = (subs as Array<{ ok: true; pred: (c: Record<string, unknown>) => boolean }>).map(s => s.pred);
            return { ok: true, pred: (c) => preds.some(p => p(c)) };
        }
        const keys = Object.keys(obj);
        if (keys.length !== 1) return { ok: false, message: 'filterJson leaf must be a single { "Col": "expr" } object, got keys: ' + keys.join(',') + '.' };
        if (++leaves > MAX_LEAVES) return { ok: false, message: 'filterJson has more than ' + MAX_LEAVES + ' leaf conditions.' };
        const colToken = keys[0];
        const expr = String(obj[colToken] ?? '');
        const resolved = resolveColumn(columns, colToken, 'filter');
        if (!resolved.ok) return { ok: false, message: resolved.message };
        const lf = leafFromExpr(expr);
        if (!lf.ok) return lf;
        return {
            ok: true,
            pred: (c) => evaluateFilter({ column: colToken, columnID: resolved.column.id, columnName: resolved.column.name, op: lf.leaf.op, value: lf.leaf.value }, c),
        };
    };
    const r = build(node, 0);
    if (!r.ok) return r;
    return { ok: true, pred: r.pred, leaves };
}
