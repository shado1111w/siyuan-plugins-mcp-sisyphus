import { describe, expect, it } from 'vitest';

import {
    compileFilterJson,
    evaluateFilter,
    filterRows,
    parseFilterExpression,
    parseSortExpression,
    resolveColumn,
    sortRows,
    type AvQueryColumn,
    type ParsedFilter,
} from '@/tools/av/query-filter';

const columns: AvQueryColumn[] = [
    { id: 'col-status', name: 'Status', type: 'select' },
    { id: 'col-priority', name: 'Priority', type: 'number' },
    { id: 'col-title', name: 'Title', type: 'block' },
    { id: 'col-due', name: 'Due', type: 'date' },
];

describe('parseFilterExpression', () => {
    it('parses equality', () => {
        const r = parseFilterExpression('Status=done');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toMatchObject({ column: 'Status', op: 'eq', value: 'done' });
    });
    it('parses inequality', () => {
        const r = parseFilterExpression('Status!=todo');
        if (r.ok) expect(r.value.op).toBe('ne');
    });
    it('parses contains and not-contains', () => {
        expect(parseFilterExpression('Title~report').ok).toBe(true);
        const r = parseFilterExpression('Title!~draft');
        if (r.ok) expect(r.value.op).toBe('notContains');
    });
    it('parses numeric comparisons', () => {
        for (const [expr, op] of [['Priority>2','gt'],['Priority<5','lt'],['Priority>=1','gte'],['Priority<=9','lte']] as const) {
            const r = parseFilterExpression(expr);
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value.op).toBe(op);
        }
    });
    it('treats a bare column as not-empty', () => {
        const r = parseFilterExpression('Status');
        if (r.ok) expect(r.value.op).toBe('notEmpty');
    });
    it('treats !column as empty', () => {
        const r = parseFilterExpression('!Status');
        if (r.ok) expect(r.value.op).toBe('empty');
    });
    it('rejects a non-numeric comparison value', () => {
        const r = parseFilterExpression('Priority>abc');
        expect(r.ok).toBe(false);
    });
    it('rejects empty expression', () => {
        expect(parseFilterExpression('   ').ok).toBe(false);
    });
    it('rejects a missing value after operator', () => {
        expect(parseFilterExpression('Status=').ok).toBe(false);
    });
});
describe('parseSortExpression', () => {
    it('defaults to ascending', () => {
        const r = parseSortExpression('Title');
        if (r.ok) expect(r.value).toMatchObject({ column: 'Title', order: 'asc' });
    });
    it('parses explicit order', () => {
        const r = parseSortExpression('Created:desc');
        if (r.ok) expect(r.value).toMatchObject({ column: 'Created', order: 'desc' });
    });
    it('rejects a bad order', () => {
        expect(parseSortExpression('Col:sideways').ok).toBe(false);
    });
});

describe('resolveColumn', () => {
    it('resolves by id', () => {
        const r = resolveColumn(columns, 'col-status', 'filter');
        expect(r.ok).toBe(true);
    });
    it('resolves by name case-insensitively', () => {
        const r = resolveColumn(columns, 'status', 'filter');
        if (r.ok) expect(r.column.id).toBe('col-status');
    });
    it('errors on unknown column listing available', () => {
        const r = resolveColumn(columns, 'Nope', 'filter');
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.message).toContain('Status');
    });
    it('errors on ambiguous name', () => {
        const dup = [...columns, { id: 'col-status2', name: 'Status', type: 'select' }];
        const r = resolveColumn(dup, 'Status', 'filter');
        expect(r.ok).toBe(false);
    });
});
describe('evaluateFilter + filterRows + sortRows', () => {
    const rows = [
        { id: 'r1', cells: { 'col-status': 'done', 'col-priority': 3, 'col-title': 'Write report' } },
        { id: 'r2', cells: { 'col-status': 'todo', 'col-priority': 1, 'col-title': 'Draft plan' } },
        { id: 'r3', cells: { 'col-status': 'done', 'col-priority': 5, 'col-title': 'Review code' } },
        { id: 'r4', cells: { 'col-status': '', 'col-priority': 2 } },
    ];

    const f = (expr: string, col = 'col-status'): ParsedFilter => {
        const r = parseFilterExpression(expr);
        if (!r.ok) throw new Error('parse failed');
        return { ...r.value, columnID: col };
    };

    it('filters equality', () => {
        const out = filterRows(rows, [{ ...f('Status=done') }]);
        expect(out.map(r => r.id)).toEqual(['r1', 'r3']);
    });
    it('filters inequality', () => {
        const out = filterRows(rows, [f('Status!=done')]);
        expect(out.map(r => r.id)).toEqual(['r2', 'r4']);
    });
    it('filters contains on a different column', () => {
        const c = { ...f('x~report', 'col-title') };
        const out = filterRows(rows, [c]);
        expect(out.map(r => r.id)).toEqual(['r1']);
    });
    it('filters numeric greater-than', () => {
        const c = { ...f('x>2', 'col-priority') };
        const out = filterRows(rows, [c]);
        expect(out.map(r => r.id)).toEqual(['r1', 'r3']);
    });
    it('filters empty and not-empty', () => {
        expect(filterRows(rows, [{ ...f('!x'), op: 'empty' }]).map(r => r.id)).toEqual(['r4']);
        expect(filterRows(rows, [{ ...f('x'), op: 'notEmpty' }]).map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
    });
    it('ANDs multiple filters', () => {
        const out = filterRows(rows, [f('Status=done'), { ...f('x>4', 'col-priority') }]);
        expect(out.map(r => r.id)).toEqual(['r3']);
    });
    it('sorts numeric ascending then descending', () => {
        const asc = sortRows(rows, [{ column: 'Priority', columnID: 'col-priority', order: 'asc' }]);
        expect(asc[0].id).toBe('r2');
        const desc = sortRows(rows, [{ column: 'Priority', columnID: 'col-priority', order: 'desc' }]);
        expect(desc[0].id).toBe('r3');
    });
    it('pushes empty cells last in sort', () => {
        const sorted = sortRows(rows, [{ column: 'Title', columnID: 'col-title', order: 'asc' }]);
        expect(sorted[sorted.length - 1].id).toBe('r4');
    });

describe('compileFilterJson', () => {
    const jrows = [
        { id: 'r1', cells: { 'col-status': 'done', 'col-priority': 3, 'col-title': 'Write report' } },
        { id: 'r2', cells: { 'col-status': 'todo', 'col-priority': 1, 'col-title': 'Draft plan' } },
        { id: 'r3', cells: { 'col-status': 'done', 'col-priority': 5, 'col-title': 'Review code' } },
        { id: 'r4', cells: { 'col-status': '', 'col-priority': 2 } },
    ];
    const pred = (node) => {
        const r = compileFilterJson(node, columns);
        if (!r.ok) throw new Error(r.message);
        return r.pred;
    };
    it('compiles a leaf operator prefix', () => {
        const p = pred({ Priority: '>2' });
        expect(jrows.filter(r => p(r.cells)).map(r => r.id)).toEqual(['r1', 'r3']);
    });
    it('bare value is equality', () => {
        expect(jrows.filter(r => pred({ Status: 'done' })(r.cells)).map(r => r.id)).toEqual(['r1', 'r3']);
    });
    it('compiles nested or', () => {
        const p = pred({ or: [{ Status: 'done' }, { Priority: '>4' }] });
        expect(jrows.filter(r => p(r.cells)).map(r => r.id)).toEqual(['r1', 'r3']);
    });
    it('compiles and inside or', () => {
        const p = pred({ or: [{ and: [{ Status: 'done' }, { Priority: '>4' }] }, { Title: '~plan' }] });
        expect(jrows.filter(r => p(r.cells)).map(r => r.id)).toEqual(['r2', 'r3']);
    });
    it('supports empty / notEmpty sentinels', () => {
        expect(jrows.filter(r => pred({ Status: '!' })(r.cells)).map(r => r.id)).toEqual(['r4']);
        expect(jrows.filter(r => pred({ Status: '' })(r.cells)).map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
    });
    it('rejects a multi-key leaf', () => {
        expect(compileFilterJson({ Status: 'done', Priority: '1' }, columns).ok).toBe(false);
    });
    it('rejects an unknown column', () => {
        expect(compileFilterJson({ Nope: 'x' }, columns).ok).toBe(false);
    });
    it('rejects non-object nodes', () => {
        expect(compileFilterJson('x', columns).ok).toBe(false);
        expect(compileFilterJson([{ Status: 'done' }], columns).ok).toBe(false);
    });
    it('caps pathological nesting', () => {
        let node = { Status: 'done' };
        for (let i = 0; i < 20; i++) node = { and: [node] };
        expect(compileFilterJson(node, columns).ok).toBe(false);
    });
});

});

