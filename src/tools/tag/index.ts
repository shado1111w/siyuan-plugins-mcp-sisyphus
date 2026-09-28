import * as tagApi from '../../api/tag';
import * as searchApi from '../../api/search';
import type { TagAction } from '../../core/config';
import { TAG_ACTION_HINTS, TAG_GUIDANCE } from '../../core/help';
import {
    TagActionSchema,
    TagListSchema,
    TagRemoveSchema,
    TagRenameSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

export const TAG_TOOL_NAME = 'tag';

export const TAG_VARIANTS: ActionVariant<TagAction>[] = [
    createZodActionVariant('list', TagListSchema, 'List tags in the workspace.'),
    createZodActionVariant('rename', TagRenameSchema, 'Rename a tag.'),
    createZodActionVariant('remove', TagRemoveSchema, 'Remove a tag.'),
];

export const TAG_ACTION_HANDLERS: Record<TagAction, ToolActionHandler> = {
        list: async ({ client, rawArgs }) => {
            const parsed = TagListSchema.parse(rawArgs);
            const keyword = parsed.query ?? parsed.keyword;
            if (keyword && keyword.trim().length > 0) {
                const result = await searchApi.searchTag(client, keyword);
                const typedResult = result && typeof result === 'object' ? result as unknown as Record<string, unknown> : {};
                const tags = Array.isArray(typedResult.tags) ? typedResult.tags : [];
                return createJsonResult({
                    ...typedResult,
                    resolvedArgs: { keyword },
                    ...(tags.length === 0 ? {
                        warning: 'No matching tags were found. If the tag was just created, SiYuan tag indexing may still be catching up; verify the markdown uses #tag# syntax and retry shortly.',
                    } : {}),
                });
            }
            const result = await tagApi.listTags(client, parsed);
            return createJsonResult(result);
        },
        rename: async ({ client, rawArgs }) => {
            const parsed = TagRenameSchema.parse(rawArgs);
            await tagApi.renameTag(client, parsed.oldLabel, parsed.newLabel);
            return applyUiRefresh(
                client,
                createJsonResult({ success: true, oldLabel: parsed.oldLabel, newLabel: parsed.newLabel }),
                [{ type: 'reloadTag' }],
            );
        },
        remove: async ({ client, rawArgs }) => {
            const parsed = TagRemoveSchema.parse(rawArgs);
            await tagApi.removeTag(client, parsed.label);
            return applyUiRefresh(
                client,
                createJsonResult({ success: true, label: parsed.label }),
                [{ type: 'reloadTag' }],
            );
        },
};

const tagTool = defineTool<TagAction>({
    name: 'tag',
    description: '🏷️ Grouped tag operations.',
    variants: TAG_VARIANTS,
    actionSchema: TagActionSchema,
    aggregateOptions: {
        guidance: TAG_GUIDANCE,
        actionHints: TAG_ACTION_HINTS,
    },
    handlers: TAG_ACTION_HANDLERS,
});

export const listTagTools = tagTool.listTools;
export const callTagTool = tagTool.callTool;
