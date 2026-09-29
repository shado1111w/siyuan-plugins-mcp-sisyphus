/** Serialize read/modify/write metadata operations per runtime client and file group.
 * This is not a cross-process lock or a second note-write coordinator.
 */
const queues = new WeakMap<object, Map<string, Promise<void>>>();
export function queueStorage<T>(client: object, group: string, run: () => Promise<T>): Promise<T> {
    let groups = queues.get(client);
    if (!groups) { groups = new Map(); queues.set(client, groups); }
    const next = (groups.get(group) ?? Promise.resolve()).then(run, run);
    const tail = next.then(() => {}, () => {});
    groups.set(group, tail);
    void tail.then(() => { if (groups!.get(group) === tail) groups!.delete(group); });
    return next;
}
