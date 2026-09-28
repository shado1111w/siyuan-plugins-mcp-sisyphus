import { describe, expect, it } from 'vitest';

import { deriveKernelEndpointUrl, normalizeCoordinatorUrl, resolveCoordinatorHost } from '@/cli/runtime';

describe('normalizeCoordinatorUrl', () => {
    it('appends /mcp when missing', () => {
        expect(normalizeCoordinatorUrl('https://mcp.example.com')).toBe('https://mcp.example.com/mcp');
        expect(normalizeCoordinatorUrl('https://mcp.example.com/')).toBe('https://mcp.example.com/mcp');
        expect(normalizeCoordinatorUrl('https://mcp.example.com/sisyphus')).toBe('https://mcp.example.com/sisyphus/mcp');
    });

    it('keeps an existing /mcp suffix', () => {
        expect(normalizeCoordinatorUrl('https://mcp.example.com/mcp')).toBe('https://mcp.example.com/mcp');
        expect(normalizeCoordinatorUrl('https://mcp.example.com/mcp/')).toBe('https://mcp.example.com/mcp');
    });
});

describe('resolveCoordinatorHost', () => {
    it('rewrites loopback bind hosts to the remote kernel hostname', () => {
        expect(resolveCoordinatorHost('127.0.0.1', 'http://siyuan.example.com:5666')).toBe('siyuan.example.com');
        expect(resolveCoordinatorHost('0.0.0.0', 'https://siyuan.example.com')).toBe('siyuan.example.com');
        expect(resolveCoordinatorHost('localhost', 'https://siyuan.example.com:5666/path')).toBe('siyuan.example.com');
    });

    it('keeps loopback when the kernel is also loopback', () => {
        expect(resolveCoordinatorHost('127.0.0.1', 'http://127.0.0.1:6806')).toBe('127.0.0.1');
        expect(resolveCoordinatorHost('0.0.0.0', 'http://localhost:6806')).toBe('127.0.0.1');
    });

    it('keeps a non-loopback configured host untouched', () => {
        expect(resolveCoordinatorHost('192.168.1.10', 'http://siyuan.example.com:5666')).toBe('192.168.1.10');
    });

    it('falls back to loopback when the kernel URL is unparseable', () => {
        expect(resolveCoordinatorHost('127.0.0.1', 'not a url')).toBe('127.0.0.1');
    });
});

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
