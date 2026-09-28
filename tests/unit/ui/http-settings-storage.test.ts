import { describe, expect, it } from 'vitest';

import { buildDefaultHttpServerSettings, normalizeHttpServerSettings } from '@/ui/setting/tool-config-storage';

describe('HTTP server settings storage', () => {
    it('defaults to loopback binding', () => {
        expect(buildDefaultHttpServerSettings().host).toBe('127.0.0.1');
        expect(normalizeHttpServerSettings(undefined).host).toBe('127.0.0.1');
        expect(buildDefaultHttpServerSettings().skillsExtensionEnabled).toBe(true);
    });

    it('allows binding the HTTP server to all IPv4 interfaces', () => {
        expect(normalizeHttpServerSettings({ host: '0.0.0.0' }).host).toBe('0.0.0.0');
    });

    it('falls back to loopback for unsupported bind hosts', () => {
        expect(normalizeHttpServerSettings({ host: 'localhost' }).host).toBe('127.0.0.1');
        expect(normalizeHttpServerSettings({ host: '192.168.1.10' }).host).toBe('127.0.0.1');
    });

    it('normalizes the Skills over MCP switch while preserving old HTTP configs', () => {
        const migrated = normalizeHttpServerSettings({ port: 39000 });
        expect(migrated.skillsExtensionEnabled).toBe(true);

        const enabled = normalizeHttpServerSettings({
            skillsExtensionEnabled: true,
        });
        expect(enabled.skillsExtensionEnabled).toBe(true);
        expect(enabled).not.toHaveProperty('skillsExtensionCatalog');
    });

    it('keeps a valid publicBaseUrl and strips trailing slashes', () => {
        const s = normalizeHttpServerSettings({
            publicBaseUrl: 'https://mcp.example.com:5666/sisyphus/',
        });
        expect(s.publicBaseUrl).toBe('https://mcp.example.com:5666/sisyphus');
    });

    it('drops invalid or non-http publicBaseUrl values', () => {
        expect(normalizeHttpServerSettings({ publicBaseUrl: 'ftp://x' }).publicBaseUrl).toBe('');
        expect(normalizeHttpServerSettings({ publicBaseUrl: 'not a url' }).publicBaseUrl).toBe('');
        expect(normalizeHttpServerSettings({ publicBaseUrl: '   ' }).publicBaseUrl).toBe('');
        expect(normalizeHttpServerSettings({ publicBaseUrl: 42 }).publicBaseUrl).toBe('');
    });
});
