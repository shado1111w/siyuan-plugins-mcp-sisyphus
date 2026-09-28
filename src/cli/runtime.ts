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

export interface CliWriteCoordinatorSettings {
    url: string;
    token?: string;
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
        cliCoordinatorUrl: cli.coordinatorUrl,
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
        ? await loadWriteCoordinatorSettings(client, resolved.coordinatorUrl, resolved.token)
        : undefined;

    return { client, toolConfig, permMgr, officialMcpRuntime, writeCoordinator };
}

/**
 * Resolve the write-coordinator URL with four priority levels:
 *   1. --coordinator-url flag or SIYUAN_COORDINATOR_URL env (explicit override)
 *   2. mcpHttpSettings.publicBaseUrl (plugin-declared external address, for
 *      remote deployments behind reverse proxies like frps)
 *   3. Kernel-hosted endpoint <apiUrl>/plugin/private/<name>/mcp when the
 *      plugin's kernelEndpointEnabled flag is on (works on Docker/web where
 *      no separate MCP HTTP port can be opened — single port, path-routed).
 *   4. Legacy host:port guess — loopback hosts are rewritten to the kernel
 *      base URL hostname when the CLI targets a remote SiYuan.
 */
async function loadWriteCoordinatorSettings(
    client: SiYuanClient,
    explicitUrl?: string,
    apiToken?: string,
): Promise<CliWriteCoordinatorSettings | undefined> {
    const override = explicitUrl?.trim() || process.env.SIYUAN_COORDINATOR_URL?.trim();
    try {
        const raw = JSON.parse(await client.readFile(HTTP_SETTINGS_API_PATH)) as Record<string, unknown>;
        if (raw.enabled === false) return undefined;
        // Standalone HTTP server (and its publicBaseUrl front) authenticates
        // with the plugin's own bearer token; the kernel endpoint is
        // authenticated by the kernel using the SiYuan API token instead.
        const pluginToken = raw.authEnabled === true && typeof raw.token === 'string' ? raw.token : undefined;
        const overrideIsKernelEndpoint = !!override && override.includes(KERNEL_PRIVATE_BASE);
        const overrideToken = overrideIsKernelEndpoint ? apiToken : pluginToken;

        if (override) {
            return { url: normalizeCoordinatorUrl(override), token: overrideToken };
        }

        const publicBaseUrl = typeof raw.publicBaseUrl === 'string' ? raw.publicBaseUrl.trim() : '';
        if (publicBaseUrl) {
            return { url: normalizeCoordinatorUrl(publicBaseUrl), token: pluginToken };
        }

        // Kernel-hosted endpoint: shares the kernel's own HTTP port, so it
        // works wherever the kernel is reachable (Docker, remote, frps) — no
        // separate MCP port needed. Enabled via the plugin's
        // kernelEndpointEnabled toggle in HTTP server settings. The kernel
        // authenticates this route with the workspace API token.
        if (raw.kernelEndpointEnabled === true) {
            const kernelUrl = deriveKernelEndpointUrl(client.getBaseUrl());
            if (kernelUrl) return { url: kernelUrl, token: apiToken };
        }

        const port = typeof raw.port === 'number' ? raw.port : 36806;
        const configuredHost = typeof raw.host === 'string' ? raw.host : '127.0.0.1';
        const protocol = raw.tlsEnabled === true ? 'https' : 'http';
        const host = resolveCoordinatorHost(configuredHost, client.getBaseUrl());
        return { url: `${protocol}://${host}:${port}/mcp`, token: pluginToken };
    } catch {
        return undefined;
    }
}

/** Append /mcp if the URL does not already end with it. */
export function normalizeCoordinatorUrl(url: string): string {
    const trimmed = url.replace(/\/+$/, '');
    return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`;
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

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::', '[::1]', '::1']);

/**
 * When the configured bind host is loopback but the CLI points at a remote
 * kernel, rewrite the coordinator host to the kernel hostname so remote
 * deployments work without extra flags. Loopback kernel URLs keep the
 * legacy 127.0.0.1 mapping.
 */
export function resolveCoordinatorHost(configuredHost: string, kernelBaseUrl: string): string {
    if (!LOOPBACK_HOSTS.has(configuredHost)) return configuredHost;
    try {
        const kernelHost = new URL(kernelBaseUrl).hostname;
        if (kernelHost && !LOOPBACK_HOSTS.has(kernelHost)) {
            return kernelHost;
        }
    } catch {
        // fall through to legacy loopback
    }
    return '127.0.0.1';
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
