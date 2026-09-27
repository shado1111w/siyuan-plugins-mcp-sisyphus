import { describe, expect, it } from 'vitest';

import { isTaskDom, setTaskMarker } from '@/tools/block/task-marker';
import { decodeEntities, domToPlainText } from '@/tools/block/plain-text';

const UNCHECKED = '<div data-subtype="t" data-node-id="l1" data-type="NodeList" class="list"><div data-marker="*" data-subtype="t" data-task=" " data-node-id="i1" data-type="NodeListItem" class="li"><div class="protyle-action protyle-action--task"><svg><use xlink:href="#iconUncheck"></use></svg></div><div data-type="NodeParagraph" class="p"><div contenteditable="true">todo A</div></div></div></div>';

const CHECKED = '<div data-subtype="t" data-node-id="l2" data-type="NodeList" class="list"><div data-marker="*" data-subtype="t" data-task="X" data-node-id="i2" data-type="NodeListItem" class="li protyle-task--done"><div class="protyle-action protyle-action--task"><svg><use xlink:href="#iconCheck"></use></svg></div><div data-type="NodeParagraph" class="p"><div contenteditable="true">done B</div></div></div></div>';

const PARA = '<div data-node-id="p1" data-type="NodeParagraph" class="p"><div contenteditable="true">plain text</div></div>';

describe('isTaskDom', () => {
    it('detects task list and item DOM', () => {
        expect(isTaskDom(UNCHECKED)).toBe(true);
        expect(isTaskDom(CHECKED)).toBe(true);
    });
    it('rejects a plain paragraph', () => {
        expect(isTaskDom(PARA)).toBe(false);
    });
});

describe('setTaskMarker', () => {
    it('checks an unchecked task', () => {
        const r = setTaskMarker(UNCHECKED, true);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.changed).toBe(true);
            expect(r.dom).toContain('data-task="X"');
            expect(r.dom).toContain('#iconCheck');
            expect(r.dom).toContain('protyle-task--done');
            expect(r.dom).not.toContain('#iconUncheck');
        }
    });
    it('unchecks a checked task', () => {
        const r = setTaskMarker(CHECKED, false);
        if (r.ok) {
            expect(r.changed).toBe(true);
            expect(r.dom).toContain('data-task=" "');
            expect(r.dom).toContain('#iconUncheck');
            expect(r.dom).not.toContain('protyle-task--done');
        }
    });
    it('is idempotent when already in the target state', () => {
        const r = setTaskMarker(CHECKED, true);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.changed).toBe(false);
            expect(r.dom).toBe(CHECKED);
        }
    });
    it('rejects a non-task block', () => {
        const r = setTaskMarker(PARA, true);
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.message).toContain('not a task');
    });
    it('counts task items', () => {
        const r = setTaskMarker(UNCHECKED, true);
        if (r.ok) expect(r.taskItems).toBe(1);
    });
    it('flips every task item in a multi-item list', () => {
        const two = UNCHECKED + UNCHECKED.replace(/data-task=" "/, 'data-task="X"');
        const r = setTaskMarker(two, true);
        if (r.ok) {
            expect(r.taskItems).toBe(2);
            expect(r.dom.match(/data-task="X"/g)).toHaveLength(2);
        }
    });
});

describe('decodeEntities', () => {
    it('decodes common entities', () => {
        expect(decodeEntities('a &amp; b &lt;c&gt; &quot;q&quot;')).toBe('a & b <c> "q"');
    });
});

describe('domToPlainText', () => {
    it('extracts readable text from a task DOM', () => {
        expect(domToPlainText(UNCHECKED)).toBe('todo A');
    });
    it('strips tags and scaffolding', () => {
        const dom = '<div data-type="NodeParagraph" class="p"><div contenteditable="true"><strong>bold</strong> and <em>em</em></div><div class="protyle-attr" contenteditable="false">​</div></div>';
        expect(domToPlainText(dom)).toBe('bold and em');
    });
    it('keeps separate blocks on separate lines', () => {
        const dom = '<div class="p">line one</div><div class="p">line two</div>';
        expect(domToPlainText(dom)).toBe('line one\nline two');
    });
    it('returns empty for empty input', () => {
        expect(domToPlainText('')).toBe('');
    });
    it('decodes entities in text', () => {
        const dom = '<div class="p"><div>tom &amp; jerry</div></div>';
        expect(domToPlainText(dom)).toBe('tom & jerry');
    });
});
