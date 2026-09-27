import { describe, expect, it, afterEach } from "vitest";
import { ProcessManager } from "@/core/process";

describe("ProcessManager", () => {
    let pm: ProcessManager;
    afterEach(() => { pm?.destroy(); });

    it("starts and stops", async () => {
        pm = new ProcessManager();
        expect(pm.getStatus()).toBe("stopped");
        await pm.start(["echo", "hello"]);
        expect(["running", "stopped"]).toContain(pm.getStatus());
        await pm.stop();
        expect(pm.getStatus()).toBe("stopped");
    });

    it("throws when already running", async () => {
        pm = new ProcessManager();
        pm.start(["sleep", "10"]);
        await new Promise(r => setTimeout(r, 50));
        await expect(pm.start(["echo", "x"])).rejects.toThrow("already");
        await pm.stop();
    });

    it("handles spawn error", async () => {
        pm = new ProcessManager();
        await expect(pm.start(["/nonexistent/binary"])).rejects.toThrow();
        expect(pm.getStatus()).toBe("error");
        expect(pm.getErrorMessage()).toBeTruthy();
    });

    it("isRunning reports", async () => {
        pm = new ProcessManager();
        expect(pm.isRunning()).toBe(false);
        pm.start(["sleep", "10"]);
        await new Promise(r => setTimeout(r, 50));
        expect(pm.isRunning()).toBe(true);
        await pm.stop();
        expect(pm.isRunning()).toBe(false);
    });

    it("onStatusChange works", async () => {
        pm = new ProcessManager();
        const statuses: string[] = [];
        const cb = (s: string) => statuses.push(s);
        pm.onStatusChange(cb);
        await pm.start(["echo", "hi"]);
        expect(statuses.length).toBeGreaterThan(0);
        pm.offStatusChange(cb);
        const before = statuses.length;
        await pm.stop();
        expect(statuses.length).toBe(before);
    });

    it("destroy cleans up", async () => {
        pm = new ProcessManager();
        pm.start(["sleep", "10"]);
        await new Promise(r => setTimeout(r, 50));
        pm.destroy();
        expect(pm.getStatus()).toBe("stopped");
        expect(pm.getProcess()).toBeNull();
    });

    it("handles exit code error", async () => {
        pm = new ProcessManager();
        await pm.start(["sh", "-c", "exit 1"]);
        await new Promise(r => setTimeout(r, 200));
        expect(pm.getStatus()).toBe("error");
    });
});
