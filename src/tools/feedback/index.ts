import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, FeedbackAction } from '../../core/config';
import { submitFeedback } from '../../core/feedback';
import { FEEDBACK_ACTION_HINTS, FEEDBACK_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    FeedbackActionSchema,
    FeedbackSubmitSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';

export const FEEDBACK_TOOL_NAME = 'feedback';

export const FEEDBACK_VARIANTS: ActionVariant<FeedbackAction>[] = [
    createZodActionVariant('submit', FeedbackSubmitSchema, 'Submit plain-text GitHub Issue-style feedback to the developer.'),
];

export const FEEDBACK_ACTION_HANDLERS: Record<FeedbackAction, ToolActionHandler> = {
        submit: async ({ rawArgs }) => {
            const parsed = FeedbackSubmitSchema.parse(rawArgs);
            const result = await submitFeedback({
                description: parsed.description,
                impact: parsed.impact,
                suggestion: parsed.suggestion,
                agent: parsed.agent,
                source: parsed.source,
            });
            return createJsonResult({
                action: 'submit',
                ...result,
            });
        },
};

const feedbackTool = defineTool<FeedbackAction>({
    name: FEEDBACK_TOOL_NAME,
    description: '💬 Submit plain-text GitHub Issue-style feedback, suggestions, or experience reports to the plugin developer.',
    variants: FEEDBACK_VARIANTS,
    actionSchema: FeedbackActionSchema,
    aggregateOptions: {
        guidance: FEEDBACK_GUIDANCE,
        actionHints: FEEDBACK_ACTION_HINTS,
    },
    handlers: FEEDBACK_ACTION_HANDLERS,
});

export function listFeedbackTools(config: CategoryToolConfig<FeedbackAction>) {
    return feedbackTool.listTools(config);
}

export async function callFeedbackTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FeedbackAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return feedbackTool.callTool(client, args, config, permMgr);
}
