import { createInterface, type Interface } from 'node:readline';

import { getDefaultConfigPath, getWritableConfigPath, loadFileConfig, normalizeFileConfig, saveNormalizedConfig, setProfile } from './config';
import { writeHeading, writeHint, writeKeyValueRows, writeStatus } from './render';

class Prompter {
    private rl: Interface;
    private closed = false;
    constructor() {
        this.rl = createInterface({ input: process.stdin, output: process.stdout });
        this.rl.once('close', () => { this.closed = true; });
    }
    ask(question: string): Promise<string> {
        if (this.closed) return Promise.resolve('');
        return new Promise((resolve) => {
            let done = false;
            const onClose = () => {
                if (done) return;
                done = true;
                resolve('');
            };
            this.rl.once('close', onClose);
            this.rl.question(question, (answer) => {
                if (done) return;
                done = true;
                this.rl.off('close', onClose);
                resolve(answer.trim());
            });
        });
    }
    close(): void {
        if (!this.closed) this.rl.close();
    }
}

export async function runInit(configPath?: string): Promise<void> {
    const target = getWritableConfigPath(configPath ?? getDefaultConfigPath());
    const existingFileConfig = loadFileConfig(configPath);
    const normalized = normalizeFileConfig(existingFileConfig);

    const p = new Prompter();
    try {
        writeHeading('SiYuan CLI setup');
        writeHint('Path', target);
        writeHint('Tip', 'Press Enter to accept the default shown in brackets.');
        process.stdout.write('\n');

        const profileName = (await p.ask(`Profile name [default]: `)) || 'default';
        if (normalized.profiles[profileName]) {
            const confirm = (await p.ask(`Profile "${profileName}" already exists. Overwrite it? [y/N] `)).toLowerCase();
            if (confirm !== 'y' && confirm !== 'yes') {
                writeStatus('warning', 'Aborted. Existing profile was kept.');
                return;
            }
        }

        const apiUrl = (await p.ask('SiYuan API URL [http://127.0.0.1:6806]: ')) || 'http://127.0.0.1:6806';
        const token = await p.ask('SiYuan API token (find it in SiYuan > Settings > About): ');

        const makeCurrentAnswer = (await p.ask(`Make "${profileName}" the active profile? [Y/n] `)).toLowerCase();
        const makeCurrent = !makeCurrentAnswer || makeCurrentAnswer === 'y' || makeCurrentAnswer === 'yes';

        // coordinatorUrl is intentionally not prompted: for remote/Docker
        // kernels the kernel endpoint is auto-derived from apiUrl when the
        // plugin's kernelEndpointEnabled toggle is on. `config set` still
        // accepts an explicit coordinatorUrl override for exotic setups.
        const config = setProfile(existingFileConfig, profileName, { apiUrl, token }, { makeCurrent });
        saveNormalizedConfig(config, configPath);
        process.stdout.write('\n');
        writeStatus('success', 'Config written.');
        writeKeyValueRows([
            { key: 'path', value: target },
            { key: 'profile', value: profileName },
            { key: 'current', value: config.currentProfile },
            { key: 'apiUrl', value: apiUrl },
            { key: 'token', value: token ? 'configured' : 'empty' },
        ]);
        process.stdout.write('\n');
        writeHint('Next', 'Run `siyuan-sisyphus notebook list` to verify the connection, or `siyuan-sisyphus config list` to inspect all profiles.');
    } finally {
        p.close();
    }
}
