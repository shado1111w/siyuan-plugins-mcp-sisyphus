import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scenarios } from "../../../skills/source/scenarios.mjs";
import { MCP_SKILLS, renderMcpSkillIndex } from "@/core/skills";

const SKILLS_ROOT = join(import.meta.dirname, "../../../skills");

function parseFrontmatter(content: string) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const fields: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return fields;
}

describe("SKILL.md content evaluation", () => {
    const cliSkills = scenarios.map((s) => ({ id: s.id, dir: `siyuan-sisyphus/${s.cliName}`, name: s.cliName }));
    const mcpSkills = scenarios.map((s) => ({ id: s.id, dir: `siyuan-mcp/${s.mcpName}`, name: s.mcpName }));

    describe.each(cliSkills)("CLI skill $name", ({ id, dir, name }) => {
        const skillPath = join(SKILLS_ROOT, dir, "SKILL.md");

        it("exists", () => {
            expect(existsSync(skillPath)).toBe(true);
        });

        it("has valid frontmatter", () => {
            const content = readFileSync(skillPath, "utf8");
            const fm = parseFrontmatter(content);
            expect(fm).not.toBeNull();
            expect(fm.name).toBe(name);
            expect(fm.description).toBeTruthy();
            expect(fm.description.length).toBeGreaterThan(10);
        });

        it("has a title heading", () => {
            const content = readFileSync(skillPath, "utf8");
            expect(content).toMatch(/^# /m);
        });

        it("contains scenario guidance", () => {
            const content = readFileSync(skillPath, "utf8");
            expect(content).toContain("```");
        });
    });

    describe.each(mcpSkills)("MCP skill $name", ({ id, dir, name }) => {
        const skillPath = join(SKILLS_ROOT, dir, "SKILL.md");

        it("exists", () => {
            expect(existsSync(skillPath)).toBe(true);
        });

        it("has valid frontmatter", () => {
            const content = readFileSync(skillPath, "utf8");
            const fm = parseFrontmatter(content);
            expect(fm).not.toBeNull();
            expect(fm.name).toBe(name);
            expect(fm.description).toBeTruthy();
        });

        it("contains scenario guidance", () => {
            const content = readFileSync(skillPath, "utf8");
            expect(content).toContain("```");
        });
    });

    it("all scenario IDs are unique across cli and mcp", () => {
        const ids = scenarios.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("all scenario cliName and mcpName are unique", () => {
        const names = scenarios.flatMap((s) => [s.cliName, s.mcpName]);
        expect(new Set(names).size).toBe(names.length);
    });

    it("MCP skill index includes all scenarios", () => {
        const index = renderMcpSkillIndex();
        for (const s of scenarios) {
            expect(index).toContain(s.mcpName);
        }
    });

    it("every scenario has required metadata", () => {
        for (const s of scenarios) {
            expect(s.id).toBeTruthy();
            expect(s.cliName).toBeTruthy();
            expect(s.mcpName).toBeTruthy();
            expect(s.cliDescription).toBeTruthy();
            expect(s.mcpDescription).toBeTruthy();
            expect(s.title).toBeTruthy();
            expect(s.body).toBeTruthy();
        }
    });

    it("every scenario body has at least one call example", () => {
        for (const s of scenarios) {
            const hasCalls = Object.keys(s.calls).length > 0 || s.id === "markup-guide";
            expect(hasCalls).toBe(true);
        }
    });

    it("every scenario call references a valid tool and action", () => {
        const validTools = new Set(["notebook", "document", "block", "fs", "file", "search", "av", "tag", "timeline", "dailynote", "system", "flashcard", "extension", "mascot", "feedback"]);
        for (const s of scenarios) {
            for (const [key, call] of Object.entries(s.calls)) {
                expect(validTools.has(call.tool)).toBe(true);
                expect(call.action).toBeTruthy();
            }
        }
    });

    it("MCP skill texts contain no absolute paths or CLI commands", () => {
        for (const skill of MCP_SKILLS) {
            expect(skill.text).not.toContain("/Users/");
            expect(skill.text).not.toContain("siyuan-sisyphus ");
        }
    });
});
