import { describe, expect, it, vi } from "vitest";
import {
    shouldShowBalanceCard,
    getFeedProp,
    formatBubbleText,
} from "@/ui/components/puppy-bubble";
import { createJsonFilePoller } from "@/ui/components/puppy-polling";

describe("puppy-bubble", () => {
    it("shouldShowBalanceCard", () => {
        expect(shouldShowBalanceCard("mascot", "get_balance")).toBe(true);
        expect(shouldShowBalanceCard("mascot", "shop")).toBe(false);
        expect(shouldShowBalanceCard("notebook", "list")).toBe(false);
    });

    it("getFeedProp returns null for non-buy", () => {
        expect(getFeedProp("shop", "bubble", "", "")).toBeNull();
        expect(getFeedProp("get_balance", "bubble", "", "")).toBeNull();
    });

    it("getFeedProp returns item emoji for buy", () => {
        const result = getFeedProp("buy", "any", "🐟", "food");
        expect(result).toEqual({ emoji: "🐟", kind: "food" });
    });

    it("getFeedProp returns drink type", () => {
        const result = getFeedProp("buy", "any", "🥛", "drink");
        expect(result).toEqual({ emoji: "🥛", kind: "drink" });
    });

    it("getFeedProp detects from bubble text", () => {
        expect(getFeedProp("buy", "购买猫粮", "", "")).toEqual({ emoji: "🍖", kind: "food" });
        expect(getFeedProp("buy", "喝牛奶", "", "")).toEqual({ emoji: "🥛", kind: "drink" });
        expect(getFeedProp("buy", "random", "", "")).toBeNull();
    });

    it("formatBubbleText mascot running", () => {
        expect(formatBubbleText("mascot", "get_balance", "running", { balance: 0, mascotItemLabel: "" })).toContain("查看余额");
        expect(formatBubbleText("mascot", "shop", "running", { balance: 0, mascotItemLabel: "" })).toContain("查看商店");
        expect(formatBubbleText("mascot", "buy", "running", { balance: 0, mascotItemLabel: "猫粮" })).toContain("猫粮");
    });

    it("formatBubbleText mascot success", () => {
        expect(formatBubbleText("mascot", "get_balance", "success", { balance: 100, mascotItemLabel: "" })).toContain("100");
        expect(formatBubbleText("mascot", "shop", "success", { balance: 0, mascotItemLabel: "" })).toContain("✓");
        expect(formatBubbleText("mascot", "buy", "success", { balance: 0, mascotItemLabel: "牛奶" })).toContain("牛奶");
    });

    it("formatBubbleText mascot error", () => {
        expect(formatBubbleText("mascot", "get_balance", "error", { balance: 0, mascotItemLabel: "" })).toContain("✗");
        expect(formatBubbleText("mascot", "buy", "error", { balance: 0, mascotItemLabel: "猫粮" })).toContain("不足");
    });

    it("formatBubbleText non-mascot", () => {
        expect(formatBubbleText("notebook", "list", "running", { balance: 0, mascotItemLabel: "" })).toBe("notebook/list");
        expect(formatBubbleText("notebook", "list", "success", { balance: 0, mascotItemLabel: "" })).toContain("✓");
        expect(formatBubbleText("notebook", "list", "error", { balance: 0, mascotItemLabel: "" })).toContain("✗");
    });

    it("formatBubbleText testing suffix", () => {
        expect(formatBubbleText("notebook", "list", "running", { balance: 0, mascotItemLabel: "" }, true)).toContain("test");
    });
});

describe("puppy-polling", () => {
    it("creates poller with start/stop", () => {
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: (raw) => raw,
            onValue: vi.fn(),
        });
        expect(poller.isRunning()).toBe(false);
        poller.start();
        expect(poller.isRunning()).toBe(true);
        poller.stop();
        expect(poller.isRunning()).toBe(false);
    });

    it("pollOnce calls fetch and parses", async () => {
        const onValue = vi.fn();
        const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: "test" }), { status: 200 }));
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: (raw) => raw,
            onValue,
            fetchFn: fetchFn as any,
        });
        await poller.pollOnce();
        expect(fetchFn).toHaveBeenCalledWith("/api/test", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ path: "/test" }),
        }));
        expect(onValue).toHaveBeenCalled();
    });

    it("pollOnce ignores failed responses", async () => {
        const onValue = vi.fn();
        const fetchFn = vi.fn(async () => new Response("", { status: 500 }));
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: (raw) => raw,
            onValue,
            fetchFn: fetchFn as any,
        });
        await poller.pollOnce();
        expect(onValue).not.toHaveBeenCalled();
    });

    it("pollOnce ignores empty text", async () => {
        const onValue = vi.fn();
        const fetchFn = vi.fn(async () => new Response("", { status: 200 }));
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: (raw) => raw,
            onValue,
            fetchFn: fetchFn as any,
        });
        await poller.pollOnce();
        expect(onValue).not.toHaveBeenCalled();
    });

    it("pollOnce ignores parse returning null", async () => {
        const onValue = vi.fn();
        const fetchFn = vi.fn(async () => new Response("data", { status: 200 }));
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: () => null,
            onValue,
            fetchFn: fetchFn as any,
        });
        await poller.pollOnce();
        expect(onValue).not.toHaveBeenCalled();
    });

    it("pollOnce catches fetch errors", async () => {
        const onValue = vi.fn();
        const fetchFn = vi.fn(async () => { throw new Error("net"); });
        const poller = createJsonFilePoller({
            endpoint: "/api/test",
            path: "/test",
            intervalMs: 1000,
            parse: (raw) => raw,
            onValue,
            fetchFn: fetchFn as any,
        });
        await expect(poller.pollOnce()).resolves.toBeUndefined();
    });
});
