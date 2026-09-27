import type { SiYuanClient } from '../../api/client';
import type { DocumentAction, CategoryToolConfig } from '../../core/config';
import { DOCUMENT_ACTION_HINTS, DOCUMENT_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    DocumentActionSchema,
    DocumentCreateDailyNoteSchema,
    DocumentCreateSchema,
    DocumentEnsureLinkTargetsSchema,
    DocumentDocToHeadingSchema,
    DocumentDuplicateSchema,
    DocumentCopySchema,
    DocumentGetChildBlocksSchema,
    DocumentGetChildDocsSchema,
    DocumentGetDocSchema,
    DocumentGetOutlineSchema,
    DocumentAppendSchema,
    DocumentPrependSchema,
    DocumentReadSchema,
    DocumentHeadingToDocSchema,
    DocumentListTreeSchema,
    DocumentLookupSchema,
    DocumentMoveSchema,
    DocumentReorderSchema,
    DocumentRemoveSchema,
    DocumentRenameSchema,
    DocumentSearchDocsSchema,
    DocumentGetAttrSchema,
    DocumentSetAttrSchema,
    DocumentFindReplaceSchema,
    DocumentArchiveSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { DOCUMENT_ACTION_HANDLERS } from './handlers';

export const DOCUMENT_TOOL_NAME = 'document';

export const DOCUMENT_VARIANTS: ActionVariant<DocumentAction>[] = [
    createZodActionVariant('create', DocumentCreateSchema, 'Create a new document. Requires notebook + path OR notebook + parentPath + title in every mode; notebook + title alone is invalid. Use parentPath=/ for the notebook root. Prefer path for child documents; parentPath + title also accepts a human-readable parent path or a storage path ending in .sy.'),
    createZodActionVariant('lookup', DocumentLookupSchema, 'Look up document IDs, storage paths, human-readable paths, and document metadata from one document reference.'),
    createZodActionVariant('ensure_link_targets', DocumentEnsureLinkTargetsSchema, 'Resolve, reuse, or create explicitly scoped direct-child document link targets. Existing targets require IDs; titles are never guessed as identities.'),
    createZodActionVariant('rename', DocumentRenameSchema, 'Rename a document'),
    createZodActionVariant('remove', DocumentRemoveSchema, 'Delete a document'),
    createZodActionVariant('move', DocumentMoveSchema, 'Move a document to another location'),
    createZodActionVariant('reorder', DocumentReorderSchema, 'Apply a complete manual order to all visible direct child documents and enable custom sorting.'),
    createZodActionVariant('get_child_blocks', DocumentGetChildBlocksSchema, 'Get top-level blocks of a document'),
    createZodActionVariant('get_child_docs', DocumentGetChildDocsSchema, 'Get child documents'),
    createZodActionVariant('set_attr', DocumentSetAttrSchema, 'Set document metadata such as icon and cover image.'),
    createZodActionVariant('get_attr', DocumentGetAttrSchema, 'Read a document attributes (icon, cover, custom-*) as JSON. --key narrows to one value.'),
    createZodActionVariant('list_tree', DocumentListTreeSchema, 'Get document tree'),
    createZodActionVariant('search_docs', DocumentSearchDocsSchema, 'Search documents by title'),
    createZodActionVariant('get_doc', DocumentGetDocSchema, 'Read document Markdown in complete block windows, or return the current HTML view.'),
    createZodActionVariant('append', DocumentAppendSchema, 'Append block content to the end of a document. Locate by id, or by notebook + hpath (notebook-local path). Skips the separate lookup step that block append requires.'),
    createZodActionVariant('prepend', DocumentPrependSchema, 'Prepend block content to the start of a document. Locate by id, or by notebook + hpath (notebook-local path).'),
    createZodActionVariant('read', DocumentReadSchema, 'Read a document by scope: full (default), outline (headings only), section (a heading subtree via --anchor), range (between --start-id/--end-id block ids), or keyword (blocks matching --pattern with optional context). Preferred single entry for targeted reads; get_doc remains for windowed full-text pagination.'),
    createZodActionVariant('get_outline', DocumentGetOutlineSchema, 'Get the native SiYuan heading tree for a document without reading its body.'),
    createZodActionVariant('create_daily_note', DocumentCreateDailyNoteSchema, 'Create or open today\'s daily note'),
    createZodActionVariant('duplicate', DocumentDuplicateSchema, 'Duplicate a document'),
    createZodActionVariant('copy', DocumentCopySchema, 'Duplicate a document then move the copy under toID or toNotebook + toPath, with an optional new title.'),
    createZodActionVariant('heading_to_doc', DocumentHeadingToDocSchema, 'Convert a heading to a separate document'),
    createZodActionVariant('doc_to_heading', DocumentDocToHeadingSchema, 'Merge a document into another as a heading'),
    createZodActionVariant('find_replace', DocumentFindReplaceSchema, 'Find and replace text scoped to a single document. Expands the document to its block IDs and calls the kernel findReplace, so only blocks inside this document are touched. Defaults to plain-text replacement; use replaceTypes to widen.'),
    createZodActionVariant('archive', DocumentArchiveSchema, 'Soft-archive a document: sets custom-archived=true (reversible via set_attr) and optionally moves it under an archive path. Unlike remove, nothing is deleted.'),
];

DOCUMENT_VARIANTS.find((variant) => variant.action === 'create')!.schema.oneOf = [
    { required: ['path'], not: { anyOf: [{ required: ['parentPath'] }, { required: ['title'] }] } },
    { required: ['parentPath', 'title'], not: { required: ['path'] } },
];

const documentTool = defineTool<DocumentAction>({
    name: 'document',
    description: '📝 Grouped document operations.',
    variants: DOCUMENT_VARIANTS,
    actionSchema: DocumentActionSchema,
    aggregateOptions: {
        guidance: DOCUMENT_GUIDANCE,
        actionHints: DOCUMENT_ACTION_HINTS,
        propertyDescriptionOverrides: {
            path: 'Path value. For action="create", use a human-readable target path RELATIVE TO THE NOTEBOOK ROOT (must start with /, MUST NOT include the notebook name; e.g., /Folder/Weekly Note, not /NotebookName/Folder/Weekly Note). For action="lookup", "list_tree", "search_docs", and path-based rename/remove/move, use a storage path returned by document(action="lookup", id=..., include=["path"]) (or / for list_tree notebook root); use hpath for human-readable lookup.',
            parentPath: 'Parent path for title-based creation, RELATIVE TO THE NOTEBOOK ROOT. Accepts a human-readable path (must start with /, MUST NOT include the notebook name; e.g., /Folder) or a storage path ending in .sy returned by document(action="lookup").',
            fromPaths: 'Source storage paths returned by document(action="lookup").',
            toPath: 'Target storage path. Use the storage path of an existing destination document returned by document(action="lookup").',
        },
    },
    handlers: DOCUMENT_ACTION_HANDLERS,
});

export function listDocumentTools(config: CategoryToolConfig<DocumentAction>) {
    return documentTool.listTools(config);
}

export async function callDocumentTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<DocumentAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return documentTool.callTool(client, args, config, permMgr);
}
