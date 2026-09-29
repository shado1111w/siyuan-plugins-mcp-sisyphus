import { loadWriteCoordinatorSettings, type CliWriteCoordinatorSettings } from '../core/write-coordinator-settings';
export { deriveKernelEndpointUrl, loadWriteCoordinatorSettings, selectWriteCoordinatorSettings } from '../core/write-coordinator-settings';
export type { CliWriteCoordinatorSettings, CliWriteCoordinatorEndpoint } from '../core/write-coordinator-settings';
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

    const writeCoordinator = await loadWriteCoordinatorSettings(client, resolved.token);

    return { client, toolConfig, permMgr, officialMcpRuntime, writeCoordinator };
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
