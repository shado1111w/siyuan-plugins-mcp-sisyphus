import { SiYuanClient } from '../api/client';
import {
    MCP_TOOLS_CONFIG_API_PATH,
    buildDefaultToolConfig,
    normalizeToolConfig,
    warnLegacyToolConfigOnce,
    type ToolConfig,
} from '../core/config';
import { PermissionManager } from '../core/permissions';
import { OfficialMcpBridge, type OfficialMcpRuntime } from '../core/official-mcp-bridge';
import { applyConfigToEnv, loadFileConfig, resolveConfig } from './config';
import { ensureRequiredPluginInstalled } from './plugin-check';

import type { ParsedArgs } from './args';

export interface CliRuntimeState {
    client: SiYuanClient;
    toolConfig: ToolConfig;
    permMgr: PermissionManager;
    officialMcpRuntime: OfficialMcpRuntime;
    writeCoordinator?: CliWriteCoordinatorSettings;
}

export interface CliWriteCoordinatorEndpoint {
    url: string;
    token?: string;
}

export interface CliWriteCoordinatorSettings {
    /** Ordered candidate endpoints — try in sequence, fall back on connect failure. */
    endpoints: CliWriteCoordinatorEndpoint[];
}

const HTTP_SETTINGS_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings';

export async function loadCliRuntimeState(
    cli: ParsedArgs,
    options: { loadPermissions?: boolean } = {},
): Promise<CliRuntimeState> {
    const fileConfig = loadFileConfig(cli.configPath);
    const resolved = resolveConfig(fileConfig, {
        cliUrl: cli.url,
        cliToken: cli.token,
        profile: cli.profile,
    });
    applyConfigToEnv(resolved);

    const client = new SiYuanClient({ baseUrl: resolved.apiUrl });
    if (resolved.token) client.setToken(resolved.token);

    await ensureRequiredPluginInstalled(client);

    const toolConfig = await loadToolConfigFromAPI(client);
    const permMgr = new PermissionManager(client);
    if (options.loadPermissions !== false) {
        await permMgr.load();
    }

    const officialMcpRuntime: OfficialMcpRuntime = {
        bridge: new OfficialMcpBridge(client),
        discoveryMode: 'blocking',
    };

    const writeCoordinator = toolConfig.writeSafety.strictMode
        ? await loadWriteCoordinatorSettings(client, resolved.token)
        : undefined;

    return { client, toolConfig, permMgr, officialMcpRuntime, writeCoordinator };
}

/**
 * Resolve the write-coordinator endpoints in preference order. The
 * standalone MCP HTTP server comes first; the kernel-hosted endpoint
 * <apiUrl>/plugin/private/<name>/mcp is appended when kernelEndpointEnabled
 * is on, as a fallback for Docker/web where no separate port can be opened.
 */
async function loadWriteCoordinatorSettings(
    client: SiYuanClient,
    apiToken?: string,
): Promise<CliWriteCoordinatorSettings | undefined> {
    try {
        const raw = JSON.parse(await client.readFile(HTTP_SETTINGS_API_PATH)) as Record<string, unknown>;
        if (raw.enabled === false) return undefined;
        const endpoints: CliWriteCoordinatorEndpoint[] = [];

        // Standalone MCP HTTP server — the primary coordinator transport.
        const pluginToken = raw.authEnabled === true && typeof raw.token === 'string' ? raw.token : undefined;
        const port = typeof raw.port === 'number' ? raw.port : 36806;
        const configuredHost = typeof raw.host === 'string' ? raw.host : '127.0.0.1';
        const host = configuredHost === '0.0.0.0' || configuredHost === '::' ? '127.0.0.1' : configuredHost;
        const protocol = raw.tlsEnabled === true ? 'https' : 'http';
        endpoints.push({ url: `${protocol}://${host}:${port}/mcp`, token: pluginToken });

        // Kernel-hosted endpoint — fallback for Docker/web where the kernel
        // shares its own port and no separate MCP listener can be opened.
        if (raw.kernelEndpointEnabled === true) {
            const kernelUrl = deriveKernelEndpointUrl(client.getBaseUrl());
            if (kernelUrl) endpoints.push({ url: kernelUrl, token: apiToken });
        }

        return endpoints.length > 0 ? { endpoints } : undefined;
    } catch {
        return undefined;
    }
}

const KERNEL_PRIVATE_BASE = '/plugin/private/siyuan-plugins-mcp-sisyphus';

/**
 * Derive the kernel-hosted coordinator endpoint from the kernel base URL.
 * Returns `<apiUrl>/plugin/private/<name>/mcp`, or undefined when the API URL
 * cannot be parsed. The trailing /mcp keeps parity with the standalone MCP
 * server path so `callCliWriteCoordinator` needs no special-casing.
 */
export function deriveKernelEndpointUrl(apiUrl: string): string | undefined {
    try {
        const base = new URL(apiUrl);
        base.pathname = `${KERNEL_PRIVATE_BASE}/mcp`;
        base.search = '';
        base.hash = '';
        return base.toString().replace(/\/+$/, '');
    } catch {
        return undefined;
    }
}

async function loadToolConfigFromAPI(client: SiYuanClient): Promise<ToolConfig> {
    try {
        const content = await client.readFile(MCP_TOOLS_CONFIG_API_PATH);
        if (!content) return buildDefaultToolConfig();

        const raw = JSON.parse(content);
        warnLegacyToolConfigOnce(raw, { source: `SiYuan API file "${MCP_TOOLS_CONFIG_API_PATH}"` });
        return normalizeToolConfig(raw);
    } catch {
        return buildDefaultToolConfig();
    }
}
