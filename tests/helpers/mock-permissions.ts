import { vi } from 'vitest';

interface MockPermissionManagerOptions {
    canRead?: (notebookId: string) => boolean;
    canWrite?: (notebookId: string) => boolean;
    canDelete?: (notebookId: string) => boolean;
    get?: (notebookId: string) => 'none' | 'r' | 'rw' | 'rwd';
    getAll?: () => Record<string, 'none' | 'r' | 'rw' | 'rwd'>;
}

/**
 * Create a mock PermissionManager for tool-level tests.
 */
export function createMockPermissionManager(options: MockPermissionManagerOptions = {}) {
    return {
        reload: vi.fn(async () => undefined),
        canRead: vi.fn(options.canRead ?? (() => true)),
        canWrite: vi.fn(options.canWrite ?? (() => true)),
        canDelete: vi.fn(options.canDelete ?? (() => true)),
        get: vi.fn(options.get ?? (() => 'rwd')),
        getAll: vi.fn(options.getAll ?? (() => ({}))),
    } as any;
}
