import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig, isDangerousAction } from '@/core/config';
import { callSystemTool, listSystemTools, SYSTEM_VARIANTS } from '@/tools/system';
import { parseResult } from '../../helpers/parse-result';

describe('system tool schemas', () => {
    it('derives constrained config and notification schemas from Zod', () => {
        const conf = SYSTEM_VARIANTS.find((variant) => variant.action === 'conf');
        const notify = SYSTEM_VARIANTS.find((variant) => variant.action === 'notify');
        const changelog = SYSTEM_VARIANTS.find((variant) => variant.action === 'changelog');
        const performSync = SYSTEM_VARIANTS.find((variant) => variant.action === 'perform_sync');

        expect(conf?.schema.properties?.mode?.enum).toEqual(['summary', 'get']);
        expect(conf?.schema.properties?.maxDepth?.type).toBe('integer');
        expect(conf?.schema.properties?.maxDepth?.minimum).toBe(0);
        expect(conf?.schema.properties?.maxDepth?.maximum).toBe(5);
        expect(conf?.schema.properties?.maxItems?.minimum).toBe(1);
        expect(conf?.schema.properties?.maxItems?.maximum).toBe(100);
        expect(notify?.schema.required).toEqual(['action', 'msg', 'level']);
        expect(notify?.schema.properties?.level?.enum).toEqual(['info', 'error']);
        expect(changelog?.schema.properties?.fromVersion?.type).toBe('string');
        expect(changelog?.schema.properties?.limit?.minimum).toBe(1);
        expect(changelog?.schema.properties?.limit?.maximum).toBe(50);
        expect(performSync?.schema.required).toEqual(['action']);
        expect(performSync?.schema.additionalProperties).toBe(false);
    });

    it('keeps perform_sync enabled by default and marked high-risk', () => {
        const config = buildDefaultToolConfig().system;

        expect(config.actions.perform_sync).toBe(true);
        expect(isDangerousAction('system', 'perform_sync')).toBe(true);
    });

    it('publishes typed system parameters plus strict internal branches', () => {
        const [tool] = listSystemTools(buildDefaultToolConfig().system);
        const schema = tool.inputSchema;
        const notifyBranch = schema['x-sisyphus-actionSchemas']?.find((branch) => branch.properties?.action?.const === 'notify');

        expect(schema.properties?.msg).toBeDefined();
        expect(schema.properties?.msg?.type).toBe('string');
        expect(schema.properties?.timeout?.type).toBe('number');
        expect(notifyBranch?.properties?.msg?.description).toBe('Message content');
        expect(notifyBranch?.properties?.level?.enum).toEqual(['info', 'error']);
        expect(notifyBranch?.additionalProperties).toBe(false);
    });

    it('returns structured changelog entries with personalization review hints', async () => {
        const config = buildDefaultToolConfig().system;
        const result = await callSystemTool({} as never, { action: 'changelog', fromVersion: '0.4.8' }, config, {} as never);
        const parsed = parseResult(result);

        expect(parsed.source).toBe('bundled CHANGELOG.md');
        expect(parsed.resource).toBe('siyuan://help/changelog');
        expect(parsed.entries.length).toBeGreaterThan(0);
        expect(parsed.entries[0].version).toMatch(/^\d+\.\d+\.\d+/);
        expect(parsed.personalizationReview).toEqual(expect.objectContaining({
            shouldReview: expect.any(Boolean),
            affectedVersions: expect.any(Array),
            affectedAreas: expect.any(Array),
        }));
    });

    it('whoami aggregates workspace, version, language and account', async () => {
        const config = buildDefaultToolConfig().system;
        const client = {
            requestRead: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/system/getWorkspaceInfo') return { workspaceDir: '/w', siyuanVer: '3.8.5' };
                if (endpoint === '/api/system/getConf') return { conf: { lang: 'zh_CN', userData: '' } };
                if (endpoint === '/api/system/version') return '3.8.5';
                return null;
            }),
        } as never;
        const result = await callSystemTool(client, { action: 'whoami' }, config, {} as never);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toMatchObject({
            workspaceDir: '/w',
            siyuanVer: '3.8.5',
            lang: 'zh_CN',
            user: null,
            signedIn: false,
        });
        expect(parsed.transport).toBeDefined();
    });

    it('whoami parses a signed-in userData string and degrades on kernel errors', async () => {
        const config = buildDefaultToolConfig().system;
        const client = {
            requestRead: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/system/getWorkspaceInfo') throw new Error('down');
                if (endpoint === '/api/system/getConf') return { conf: { lang: 'en', userData: JSON.stringify({ userNickname: 'alice' }) } };
                if (endpoint === '/api/system/version') return '3.8.5';
                return null;
            }),
        } as never;
        const result = await callSystemTool(client, { action: 'whoami' }, config, {} as never);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.user).toEqual({ userNickname: 'alice' });
        expect(parsed.signedIn).toBe(true);
        // workspaceDir fell back but version still resolved from getVersion.
        expect(parsed.workspaceDir).toBeNull();
        expect(parsed.siyuanVer).toBe('3.8.5');
    });
});
