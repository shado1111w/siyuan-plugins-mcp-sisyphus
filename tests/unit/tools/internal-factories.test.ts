import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";

import {
    toErrorText,
    createJsonResult,
    createPaginatedResult,
    createSetIconReminder,
    createWriteSuccessResult,
    createErrorResult,
    createPermissionDeniedResult,
    createDisabledActionResult,
} from "@/tools/internal/result-factory";
import {
    createActionSchema,
    buildAggregatedTool,
} from "@/tools/internal/schema-builder";
import { tryHandleHelpAction } from "@/tools/internal/help-router";
import { buildDefaultToolConfig } from "@/core/config";
import { createZodActionVariant } from "@/tools/internal/shared";

const mockSchema = z.object({ name: z.string() });

describe("result-factory", () => {
    it("toErrorText creates error result", () => {
        const r = toErrorText({ error: { message: "test" } });
        expect(r.isError).toBe(true);
        expect(JSON.parse(r.content[0].text).error.message).toBe("test");
    });

    it("createJsonResult creates success result", () => {
        const r = createJsonResult({ id: "1" });
        expect(r.isError).toBeUndefined();
        expect(JSON.parse(r.content[0].text).id).toBe("1");
    });

    it("createPaginatedResult with defaults", () => {
        const r = createPaginatedResult([{ id: "1" }], { total: 1, page: 1, pageSize: 10, pageCount: 1 });
        const p = JSON.parse(r.content[0].text);
        expect(p.data).toHaveLength(1);
        expect(p.hasNextPage).toBe(false);
    });

    it("createSetIconReminder for notebook", () => {
        expect(createSetIconReminder("notebook", false)).toContain("notebook");
        expect(createSetIconReminder("notebook", true)).toContain("notebook");
    });

    it("createWriteSuccessResult merges", () => {
        const r = createWriteSuccessResult({ id: "1" }, { extra: "field" });
        const p = JSON.parse(r.content[0].text);
        expect(p.success).toBe(true);
        expect(p.extra).toBe("field");
    });

    it("createErrorResult with ZodError", () => {
        try { mockSchema.parse({}); } catch (e) {
            const r = createErrorResult(e, { tool: "test", action: "create" });
            const p = JSON.parse(r.content[0].text);
            expect(r.isError).toBe(true);
            expect(p.error.type).toBe("validation_error");
            expect(p.error.fields).toBeDefined();
        }
    });

    it("createErrorResult with regular Error", () => {
        const r = createErrorResult(new Error("oops"), { tool: "test" });
        const p = JSON.parse(r.content[0].text);
        expect(p.error.type).toBe("internal_error");
        expect(p.error.message).toBe("oops");
    });

    it("createPermissionDeniedResult", () => {
        const r = createPermissionDeniedResult("nb-1", "r", "write");
        const p = JSON.parse(r.content[0].text);
        expect(p.error.type).toBe("permission_denied");
    });

    it("createDisabledActionResult", () => {
        const r = createDisabledActionResult("notebook", "remove");
        const p = JSON.parse(r.content[0].text);
        expect(p.error.type).toBe("action_disabled");
    });
});

describe("schema-builder", () => {
    it("createActionSchema creates schema with action field", () => {
        const s = createActionSchema("create", { name: { type: "string" } }, ["name"], "Create a doc");
        expect(s.type).toBe("object");
        expect(s.properties.action.const).toBe("create");
        expect(s.required).toEqual(["action", "name"]);
    });

    it("buildAggregatedTool returns empty for disabled config", () => {
        const config = buildDefaultToolConfig().notebook;
        config.enabled = false;
        const result = buildAggregatedTool("notebook", "desc", config, [], {});
        expect(result).toEqual([]);
    });

    it("buildAggregatedTool returns empty for no variants", () => {
        const config = buildDefaultToolConfig().notebook;
        const result = buildAggregatedTool("notebook", "desc", config, [], {});
        expect(result).toEqual([]);
    });

    it("buildAggregatedTool builds tool schema", () => {
        const config = buildDefaultToolConfig().notebook;
        const variants = [
            createZodActionVariant("list", z.object({}), "List notebooks"),
            createZodActionVariant("create", z.object({ name: z.string() }), "Create a notebook"),
        ];
        const [tool] = buildAggregatedTool("notebook", "Notebook ops", config, variants, {});
        expect(tool.name).toBe("notebook");
        expect(tool.inputSchema.properties.action).toBeDefined();
        expect(tool.inputSchema.properties.topic).toBeDefined();
    });

    it("buildAggregatedTool includes confirmation warning", () => {
        const config = buildDefaultToolConfig().notebook;
        config.actions.remove = true;
        const variants = [
            createZodActionVariant("list", z.object({}), "List"),
            createZodActionVariant("remove", z.object({}), "Remove"),
        ];
        const [tool] = buildAggregatedTool("notebook", "Notebook ops", config, variants, {});
        expect(tool.inputSchema.properties.action.description).toContain("confirmation");
    });
});

describe("help-router", () => {
    it("returns null for non-help action", () => {
        const config = buildDefaultToolConfig().notebook;
        const r = tryHandleHelpAction("notebook", { action: "list" }, config, []);
        expect(r).toBeNull();
    });

    it("returns help index for overview", () => {
        const config = buildDefaultToolConfig().notebook;
        config.actions.list = true;
        const variants = [createZodActionVariant("list", z.object({}), "List notebooks")];
        const r = tryHandleHelpAction("notebook", { action: "help" }, config, variants);
        const p = JSON.parse(r.content[0].text);
        expect(p.tool).toBe("notebook");
        expect(Object.keys(p.actions)).toContain("list");
    });

    it("returns action help for valid topic", () => {
        const config = buildDefaultToolConfig().notebook;
        const variants = [createZodActionVariant("list", z.object({}), "List notebooks")];
        const r = tryHandleHelpAction("notebook", { action: "help", topic: "list" }, config, variants);
        const p = JSON.parse(r.content[0].text);
        expect(p.tool).toBe("notebook");
        expect(p.action).toBe("list");
    });

    it("returns error for unknown topic", () => {
        const config = buildDefaultToolConfig().notebook;
        const r = tryHandleHelpAction("notebook", { action: "help", topic: "nonexist" }, config, []);
        const p = JSON.parse(r.content[0].text);
        expect(r.isError).toBe(true);
        expect(p.error.type).toBe("unknown_help_topic");
    });
});
