import type { TimelineAction } from '../../core/config';
import { TIMELINE_ACTION_HINTS, TIMELINE_GUIDANCE } from '../../core/help';
import {
    TimelineActionSchema,
    TimelineCompareNodeSchema,
    TimelineCreateNodeSchema,
    TimelineDeleteNodeSchema,
    TimelineListNodesSchema,
    TimelineRollbackBlockSchema,
    TimelineRollbackDocumentSchema,
} from '../../core/types';
import {
    compareTimelineNode,
    createTimelineNode,
    deleteTimelineNode,
    listTimelineNodes,
    rollbackTimelineBlock,
    rollbackTimelineDocument,
} from '../../shared/timeline-service';
import { isGlobalTimelineTag } from '../../ui/version-control/timeline';
import { ensurePermissionForDocumentId } from '../internal/context';
import { defineTool } from '../internal/define-tool';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

export const TIMELINE_TOOL_NAME = 'timeline';

export const TIMELINE_VARIANTS: ActionVariant<TimelineAction>[] = [
    createZodActionVariant('list_nodes', TimelineListNodesSchema, 'List global or document timeline nodes.'),
    createZodActionVariant('create_node', TimelineCreateNodeSchema, 'Create a named global or document timeline node.'),
    createZodActionVariant('compare_node', TimelineCompareNodeSchema, 'Compare one document with a timeline node.'),
    createZodActionVariant('delete_node', TimelineDeleteNodeSchema, 'Delete a timeline node tag while retaining its snapshot.'),
    createZodActionVariant('rollback_document', TimelineRollbackDocumentSchema, 'Restore one document file from a timeline node.'),
    createZodActionVariant('rollback_block', TimelineRollbackBlockSchema, 'Restore one changed block from a timeline node.'),
];

export const TIMELINE_ACTION_HANDLERS: Record<TimelineAction, ToolActionHandler> = {
        list_nodes: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineListNodesSchema.parse(rawArgs);
            if (parsed.scope !== 'global') {
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId!, 'read');
                if (denied) return denied;
            }
            return createJsonResult(await listTimelineNodes(client, parsed));
        },
        create_node: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineCreateNodeSchema.parse(rawArgs);
            if (parsed.scope === 'document') {
                const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId!, 'write');
                if (denied) return denied;
                return applyUiRefresh(
                    client,
                    createJsonResult(await createTimelineNode(client, parsed)),
                    [{ type: 'reloadProtyle', id: context.documentId }],
                );
            }
            return createJsonResult(await createTimelineNode(client, parsed));
        },
        compare_node: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineCompareNodeSchema.parse(rawArgs);
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'read');
            if (denied) return denied;
            return createJsonResult(await compareTimelineNode(client, parsed));
        },
        delete_node: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineDeleteNodeSchema.parse(rawArgs);
            if (!isGlobalTimelineTag(parsed.tag)) {
                if (!parsed.documentId) throw new Error('documentId is required for document-scoped timeline tags.');
                const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'delete');
                if (denied) return denied;
                return applyUiRefresh(
                    client,
                    createJsonResult(await deleteTimelineNode(client, parsed)),
                    [{ type: 'reloadProtyle', id: context.documentId }],
                );
            }
            return createJsonResult(await deleteTimelineNode(client, parsed));
        },
        rollback_document: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineRollbackDocumentSchema.parse(rawArgs);
            const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'delete');
            if (denied) return denied;
            return applyUiRefresh(
                client,
                createJsonResult(await rollbackTimelineDocument(client, parsed)),
                [{ type: 'reloadProtyle', id: context.documentId }],
            );
        },
        rollback_block: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineRollbackBlockSchema.parse(rawArgs);
            const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'delete');
            if (denied) return denied;
            return applyUiRefresh(
                client,
                createJsonResult(await rollbackTimelineBlock(client, parsed)),
                [{ type: 'reloadProtyle', id: context.documentId }],
            );
        },
};

const timelineTool = defineTool<TimelineAction>({
    name: TIMELINE_TOOL_NAME,
    description: '🕓 Grouped document timeline, snapshot diff, and rollback operations.',
    variants: TIMELINE_VARIANTS,
    actionSchema: TimelineActionSchema,
    aggregateOptions: {
        guidance: TIMELINE_GUIDANCE,
        actionHints: TIMELINE_ACTION_HINTS,
    },
    handlers: TIMELINE_ACTION_HANDLERS,
});

export const listTimelineTools = timelineTool.listTools;
export const callTimelineTool = timelineTool.callTool;
