/**
 * update_task_marker — set the checked state of a task-list block without
 * rewriting its content. Operates on the rendered DOM: flips data-task,
 * the protyle-task--done class, and the check/uncheck icon.
 */

export type TaskMarkerResult =
    | { ok: true; dom: string; changed: boolean; taskItems: number }
    | { ok: false; message: string }

/**
 * Returns true when the DOM is a task list container or a single task item.
 * A task block has data-subtype="t" (or an inner NodeListItem with data-task).
 */
export function isTaskDom(dom: string): boolean {
    return /data-task=\s*"[ xX]"/.test(dom) || /data-subtype="t"/.test(dom) && /protyle-action--task/.test(dom);
}

function taskItemStates(dom: string): { checked: number; unchecked: number } {
    let checked = 0;
    let unchecked = 0;
    const re = /data-task=\s*"([ xX])"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(dom)) !== null) {
        if (m[1] === 'X' || m[1] === 'x') checked += 1;
        else unchecked += 1;
    }
    return { checked, unchecked };
}

/**
 * Rewrite every task item inside the DOM to the requested checked state.
 * Idempotent: returns changed=false when already in the target state.
 */
export function setTaskMarker(dom: string, checked: boolean): TaskMarkerResult {
    if (!dom || typeof dom !== 'string') {
        return { ok: false, message: 'Empty block DOM.' };
    }
    const states = taskItemStates(dom);
    const taskItems = states.checked + states.unchecked;
    if (taskItems === 0) {
        return { ok: false, message: 'Block is not a task list item; no data-task marker found. Only task (todo) blocks can be toggled.' };
    }
    const target = checked ? 'X' : ' ';
    const currentUniform = checked ? states.unchecked === 0 : states.checked === 0;
    if (currentUniform) {
        return { ok: true, dom, changed: false, taskItems };
    }

    let out = dom.replace(/data-task=\s*"[ xX]"/g, 'data-task="' + target + '"');

    // Toggle the done class on each task list-item element.
    out = out.replace(/class="([^"]*\bli\b[^"]*)"/g, (match, cls: string) => {
        const hasDone = /\bprotyle-task--done\b/.test(cls);
        if (checked && !hasDone) return 'class="' + cls + ' protyle-task--done"';
        if (!checked && hasDone) return 'class="' + cls.replace(/\s*protyle-task--done/g, '') + '"';
        return match;
    });

    // Swap the checkbox icon.
    if (checked) {
        out = out.replace(/#iconUncheck/g, '#iconCheck');
    } else {
        out = out.replace(/#iconCheck/g, '#iconUncheck');
    }

    return { ok: true, dom: out, changed: true, taskItems };
}
