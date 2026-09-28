import { describe, expect, it } from 'vitest';

import { deriveKernelEndpointUrl } from '@/cli/runtime';

describe('deriveKernelEndpointUrl', () => {
    it('maps the kernel base URL to the private plugin /mcp path', () => {
        expect(deriveKernelEndpointUrl('http://127.0.0.1:6806'))
            .toBe('http://127.0.0.1:6806/plugin/private/siyuan-plugins-mcp-sisyphus/mcp');
        expect(deriveKernelEndpointUrl('http://siyuan.xupeidong.cn:5666'))
            .toBe('http://siyuan.xupeidong.cn:5666/plugin/private/siyuan-plugins-mcp-sisyphus/mcp');
    });

    it('drops any existing path, query, and hash from the base URL', () => {
        expect(deriveKernelEndpointUrl('https://siyuan.example.com:5666/stage/build/desktop/?r=abc#x'))
            .toBe('https://siyuan.example.com:5666/plugin/private/siyuan-plugins-mcp-sisyphus/mcp');
    });

    it('returns undefined when the API URL cannot be parsed', () => {
        expect(deriveKernelEndpointUrl('not a url')).toBeUndefined();
        expect(deriveKernelEndpointUrl('')).toBeUndefined();
    });
});
