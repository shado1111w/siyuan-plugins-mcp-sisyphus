import type { ParsedArgs } from './args';
import {
    getWritableConfigPath,
    loadFileConfig,
    normalizeFileConfig,
    saveNormalizedConfig,
    setCurrentProfile,
    setProfile,
} from './config';
import { writeHeading, writeHint, writeKeyValueRows, writeSection, writeStatus } from './render';

export function runConfigCommand(cli: ParsedArgs): number {
    switch (cli.configAction) {
        case 'list':
            return runConfigList(cli);
        case 'get':
            return runConfigGet(cli);
        case 'set':
            return runConfigSet(cli);
        case 'use':
            return runConfigUse(cli);
        default:
            throw new Error('Unknown config action.');
    }
}

function runConfigList(cli: ParsedArgs): number {
    const normalized = normalizeFileConfig(loadFileConfig(cli.configPath));
    const out = process.stdout;
    writeHeading('SiYuan profiles', out);

    for (const [name, profile] of Object.entries(normalized.profiles)) {
        const marker = name === normalized.currentProfile ? ' (current)' : '';
        process.stdout.write(`  ${name}${marker}\n`);
        writeKeyValueRows([
            { key: 'apiUrl', value: profile.apiUrl || '' },
            { key: 'token', value: profile.token ? 'configured' : 'empty' },
        ], out);
    }

    writeSection('Next Step', out);
    writeHint('Tip', 'Use `siyuan-sisyphus config use <name>` to switch the active profile.', out);
    return 0;
}

function runConfigGet(cli: ParsedArgs): number {
    const normalized = normalizeFileConfig(loadFileConfig(cli.configPath));
    const name = cli.configName || normalized.currentProfile;
    const profile = normalized.profiles[name];
    if (!profile) {
        throw new Error(`Unknown profile "${name}".`);
    }

    writeHeading(`Profile ${name}`);
    writeKeyValueRows([
        { key: 'current', value: name === normalized.currentProfile ? 'yes' : 'no' },
        { key: 'apiUrl', value: profile.apiUrl || '' },
        { key: 'token', value: profile.token ? 'configured' : 'empty' },
    ]);
    return 0;
}

function runConfigSet(cli: ParsedArgs): number {
    const name = cli.configName;
    if (!name) {
        throw new Error('Missing profile name. Usage: siyuan-sisyphus config set <name> --url <url> [--token <token>]');
    }
    if (!cli.url) {
        throw new Error('Missing --url. Usage: siyuan-sisyphus config set <name> --url <url> [--token <token>]');
    }

    const currentFileConfig = loadFileConfig(cli.configPath);
    const hasStoredConfig = Boolean(
        currentFileConfig.apiUrl ||
        currentFileConfig.token ||
        currentFileConfig.currentProfile ||
        (currentFileConfig.profiles && Object.keys(currentFileConfig.profiles).length > 0),
    );
    const currentName = normalizeFileConfig(currentFileConfig).currentProfile;
    const normalized = setProfile(currentFileConfig, name, { apiUrl: cli.url, token: cli.token }, {
        makeCurrent: !hasStoredConfig || currentName === name,
    });
    const target = saveNormalizedConfig(normalized, cli.configPath);

    writeStatus('success', 'Profile saved.');
    writeKeyValueRows([
        { key: 'path', value: target },
        { key: 'profile', value: name },
        { key: 'apiUrl', value: cli.url },
        { key: 'token', value: cli.token ? 'configured' : (normalized.profiles[name]?.token ? 'configured' : 'empty') },
    ]);
    process.stdout.write('\n');
    writeHint('Next', `Run \`siyuan-sisyphus config use ${name}\` to make it the default profile.`);
    return 0;
}

function runConfigUse(cli: ParsedArgs): number {
    const name = cli.configName;
    if (!name) {
        throw new Error('Missing profile name. Usage: siyuan-sisyphus config use <name>');
    }

    const normalized = setCurrentProfile(loadFileConfig(cli.configPath), name);
    const target = saveNormalizedConfig(normalized, cli.configPath);

    writeStatus('success', 'Active profile updated.');
    writeKeyValueRows([
        { key: 'path', value: target },
        { key: 'profile', value: name },
    ]);
    return 0;
}

export function getConfigTargetPath(configPath?: string): string {
    return getWritableConfigPath(configPath);
}
