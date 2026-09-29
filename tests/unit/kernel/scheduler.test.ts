import { expect, it, vi } from 'vitest';
import { KernelScheduler } from '@/kernel/scheduler';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
it('limits reads to four, preserves exclusive FIFO and allows each lane to progress independently', async () => {
    const s = new KernelScheduler();
    const gate = deferred(); let reads = 0, maxReads = 0;
    const pending = Array.from({ length: 8 }, (_, i) => s.run(s.begin('s', i), 'read', async () => { reads++; maxReads = Math.max(reads, maxReads); await gate.promise; reads--; }));
    const order: number[] = [];
    const writeGate = deferred();
    const w1 = s.run(s.begin('s', 'w1'), 'exclusive', async () => { order.push(1); await writeGate.promise; });
    const w2 = s.run(s.begin('s', 'w2'), 'exclusive', async () => { order.push(2); });
    await tick(); expect(maxReads).toBe(4); expect(reads).toBe(4); expect(order).toEqual([1]);
    gate.resolve(); await Promise.all(pending); expect(order).toEqual([1]);
    writeGate.resolve(); await Promise.all([w1, w2]); expect(order).toEqual([1, 2]); expect(maxReads).toBe(4);
});
it('cancels only pending requests in the same session with type-sensitive RPC IDs', async () => {
    const s = new KernelScheduler(1), gate = deferred();
    const active = s.run(s.begin('a', 1), 'exclusive', () => gate.promise);
    const run = vi.fn(async () => 'should not run');
    const task = s.begin('a', 2), pending = s.run(task, 'exclusive', run);
    const checked = expect(pending).rejects.toMatchObject({ code: 'request_cancelled' });
    expect(s.cancel('b', 2)).toBe(false); expect(s.cancel('a', '2')).toBe(false);
    expect(s.cancel('a', 1)).toBe(false); expect(s.cancel('a', 2)).toBe(true);
    await checked; s.finish(task); gate.resolve(); await active; expect(run).not.toHaveBeenCalled();
});
it('cancellation during preparation and session close prevent execution without poisoning later work', async () => {
    const s = new KernelScheduler(); const t = s.begin('a', 1); s.cancelSession('a');
    const run = vi.fn(async () => 1);
    await expect(s.run(t, 'read', run)).rejects.toMatchObject({ code: 'request_cancelled' });
    s.finish(t); expect(run).not.toHaveBeenCalled();
    await expect(s.run(s.begin('a', 1), 'read', async () => 42)).resolves.toBe(42);
});
it('bounds admitted requests and refuses duplicate IDs; failure releases execution slots', async () => {
    const s = new KernelScheduler(1, 2); const t = s.begin('a', 1);
    expect(() => s.begin('a', 1)).toThrow('already in flight');
    const other = s.begin('b', 1); expect(() => s.begin('c', 1)).toThrow('capacity');
    const failed = s.run(t, 'read', async () => { throw new Error('failed'); });
    const next = s.run(other, 'read', async () => 'okay');
    await expect(failed).rejects.toThrow('failed'); s.finish(t);
    await expect(next).resolves.toBe('okay'); s.finish(other);
    expect(() => s.begin('c', 1)).not.toThrow();
});
it('cooperatively stops reads without freeing the active slot before native I/O settles', async () => {
    const { taskClient } = await import('@/kernel/task-client');
    const s = new KernelScheduler(1), gate = deferred();
    const task = s.begin('owner', 'task'); task.cooperative = true;
    const native = { requestRead: vi.fn(async () => { await gate.promise; return 1; }) };
    const c = taskClient(native, s, task);
    const first = s.run(task, 'read', async () => { await c.requestRead(); return c.requestRead(); });
    const rejected = expect(first).rejects.toMatchObject({ code: 'request_cancelled' });
    await tick(); expect(s.cancel('owner', 'task')).toBe(true);
    const later = vi.fn(async () => 2);
    const next = s.run(s.begin('owner', 'next'), 'read', later);
    expect(s.snapshot()).toMatchObject({ readsRunning: 1, queued: 1, cancelledRunning: 1 });
    expect(later).not.toHaveBeenCalled();
    gate.resolve(); await rejected; await next;
    expect(native.requestRead).toHaveBeenCalledTimes(1);
});
it('makes commit a synchronous cancellation barrier and continues readback', async () => {
    const s = new KernelScheduler(), task = s.begin('owner', 1); task.cooperative = true;
    const gate = deferred();
    const run = s.run(task, 'exclusive', async () => { s.beginCommit(task); await gate.promise; s.checkpoint(task); return 'committed'; });
    await tick(); expect(s.cancel('owner', 1)).toBe(false); s.cancelSession('owner');
    expect(s.status('owner', 1)).toMatchObject({ committing: true, cancelRequested: false });
    gate.resolve(); await expect(run).resolves.toBe('committed');
});
