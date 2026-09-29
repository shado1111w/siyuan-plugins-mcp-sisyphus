/*
 * Kernel-side resources/prompts surface.
 *
 * The shared src/core/resources.ts pulls every tool's *_VARIANTS at module
 * top level (z.toJSONSchema), which hangs the goja sandbox. We therefore
 * implement the MCP resources/prompts methods here against the goja-safe
 * skills.ts catalog plus a small static help index — behaviour matches the
 * desktop server for skills/prompts, and covers the help namespaces that do
 * not depend on per-action variant reflection.
 */

import {
    MCP_SKILLS,
    SKILL_INDEX_URI,
    getMcpSkill,
    listMcpPrompts,
    getMcpPrompt,
    listSepSkillResources,
    readSepSkillResource,
    renderMcpSkillIndex,
} from '../core/skills';

const MIME_TYPE = 'text/markdown';

export const USER_RULES_RESOURCE_URI = 'siyuan://help/user-rules';
export const ACTION_RESOURCE_TEMPLATE_URI = 'siyuan://help/action/{tool}/{action}';
export const TOOL_OVERVIEW_RESOURCE_URI = 'siyuan://help/tool-overview';

/* ---------- resources ---------- */

export function kernelListResources(): unknown[] {
    const staticResources = [
        {
            uri: TOOL_OVERVIEW_RESOURCE_URI,
            name: 'siyuan-mcp-tool-overview',
            title: 'SiYuan MCP Tool Overview',
            description: 'Category map and usage guidance for the aggregated Sisyphus tools.',
            mimeType: MIME_TYPE,
        },
        {
            uri: USER_RULES_RESOURCE_URI,
            name: 'siyuan-mcp-user-rules',
            title: 'SiYuan MCP User Rules',
            description: 'Active user-defined custom rules applied to tool selection.',
            mimeType: MIME_TYPE,
        },
        {
            uri: SKILL_INDEX_URI,
            name: 'siyuan-mcp-skill-index',
            title: 'SiYuan MCP Skill Index',
            description: 'Routes tasks to scenario-oriented SiYuan MCP skills.',
            mimeType: MIME_TYPE,
        },
        ...MCP_SKILLS.map((skill) => ({
            uri: 'siyuan://skills/' + skill.name,
            name: skill.name,
            title: skill.title,
            description: skill.description,
            mimeType: MIME_TYPE,
        })),
    ];
    return staticResources;
}

export function kernelListResourceTemplates(): unknown[] {
    return [
        {
            uriTemplate: ACTION_RESOURCE_TEMPLATE_URI,
            name: 'action-help',
            title: 'Per-action MCP Help',
            description: 'Returns valid shapes, guidance, and minimal examples for a specific tool action. Use tool action="help" for the authoritative schema.',
            mimeType: MIME_TYPE,
        },
    ];
}

export function kernelReadResource(uri: string, userRulesText = ''): { uri: string; mimeType: string; text: string } | null {
    if (uri === SKILL_INDEX_URI) {
        return { uri, mimeType: MIME_TYPE, text: renderMcpSkillIndex() };
    }
    if (uri === USER_RULES_RESOURCE_URI) {
        return {
            uri,
            mimeType: MIME_TYPE,
            text: userRulesText.trim()
                ? '# Active user rules\n\n' + userRulesText.trim() + '\n'
                : '# Active user rules\n\nNo custom user rules are configured.\n',
        };
    }
    if (uri === TOOL_OVERVIEW_RESOURCE_URI) {
        return { uri, mimeType: MIME_TYPE, text: renderToolOverview() };
    }
    let parsed: URL;
    try {
        parsed = new URL(uri);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'siyuan:') {
        const sep = readSepSkillResource(uri);
        return sep ?? null;
    }
    if (parsed.hostname === 'skills') {
        const segs = parsed.pathname.split('/').filter(Boolean);
        if (segs.length !== 1) return null;
        const skill = getMcpSkill(decodeURIComponent(segs[0]));
        if (!skill) return null;
        return { uri, mimeType: MIME_TYPE, text: skill.text };
    }
    return null;
}

function renderToolOverview(): string {
    const cats = [
        'fs — workspace tree and Markdown CRUD (human-readable paths)',
        'notebook — notebooks, icons, per-notebook permissions',
        'document — document lifecycle, rename/move/duplicate, outline',
        'block — block-level insert/update/move/kramdown/attrs',
        'av — attribute-view (database) rows, columns, filters, cells',
        'file — assets, templates, exports, image readback',
        'search — fulltext/semantic/SQL/backlinks/find_replace',
        'tag — list/rename/remove tags',
        'timeline — document snapshot nodes, diff, rollback',
        'system — version, network, conf, sync',
        'flashcard — decks, cards, review',
        'extension — dynamically discovered official/plugin tools',
        'mascot — mascot balance and shop',
        'feedback — submit feedback to the developer',
    ];
    return [
        '# SiYuan MCP Tool Overview',
        '',
        'Sisyphus exposes aggregated tools. Each tool takes an "action" field; call <tool>(action="help") for the authoritative per-action schema.',
        '',
        ...cats.map((c) => '- ' + c),
        '',
        'Kernel endpoint note: binary/local-filesystem actions (upload_asset, export_resources, extract_doc) are unavailable inside the kernel sandbox; read paths such as read_image and get_image_ocr_text work.',
    ].join('\n');
}

/* ---------- prompts ---------- */

export function kernelListPrompts(): unknown[] {
    return listMcpPrompts();
}
export function kernelGetPrompt(name: string, task?: string) {
    return getMcpPrompt(name, task);
}
