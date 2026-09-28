/*
 * KernelSiYuanClient — a SiYuanClient-compatible adapter backed by the
 * kernel petal's siyuan.client.fetch API.
 *
 * Runs inside the goja sandbox. `siyuan.client.fetch(path, init)` hits
 * http://127.0.0.1:<kernelPort><path> with the plugin's auth token injected
 * automatically — no manual Authorization header needed. The response object
 * exposes .json()/.text()/.arrayBuffer()/.ok/.status instead of a fetch
 * Response, so we normalize it here.
 *
 * Only the methods that WriteSafetyCoordinator + tool handlers actually
 * call are implemented. Multipart upload (putFile) and host filesystem
 * access are not available in the kernel sandbox.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare const siyuan: any;

export class KernelResponseError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryable: boolean,
    ) {
        super(message);
        this.name = 'KernelResponseError';
    }
}

export class KernelSiYuanClient {
    private token = '';

    setToken(token: string): void {
        // The kernel injects the plugin token automatically; storing it is
        // harmless and keeps parity with SiYuanClient's surface.
        this.token = token;
    }

    getBaseUrl(): string {
        return 'kernel://localhost';
    }

    getAuthHeaders(): Record<string, string> {
        return {};
    }

    private async doFetch(
        path: string,
        init: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown>; arrayBuffer: () => Promise<unknown> }> {
        const resp = await siyuan.client.fetch(path, {
            method: init.method ?? 'GET',
            headers: init.headers ?? {},
            body: init.body,
        });
        return {
            ok: !!resp?.ok,
            status: typeof resp?.status === 'number' ? resp.status : 0,
            text: () => resp.text(),
            json: () => resp.json(),
            arrayBuffer: () => resp.arrayBuffer(),
        };
    }

    private async readData<T>(
        path: string,
        init: { method?: string; headers?: Record<string, string>; body?: string },
        _maxResponseBytes?: number,
    ): Promise<T> {
        const resp = await this.doFetch(path, init);
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            const retryable = !(resp.status >= 400 && resp.status < 500 && resp.status !== 429);
            throw new KernelResponseError(
                `HTTP error: ${resp.status} ${text.slice(0, 200)}`,
                resp.status,
                retryable,
            );
        }
        const rawText = await resp.text();
        if (rawText.trim() === '') return null as T;
        let result: { code?: number; msg?: string; data?: T };
        try {
            result = JSON.parse(rawText) as { code?: number; msg?: string; data?: T };
        } catch {
            throw new KernelResponseError(
                `Invalid SiYuan API response from ${path}: ${rawText.slice(0, 200)}`,
                resp.status,
                false,
            );
        }
        if (result.code !== 0) {
            throw new KernelResponseError(
                `SiYuan API error: ${result.code} - ${result.msg}`,
                resp.status,
                false,
            );
        }
        return result.data as T;
    }

    async requestRead<T>(endpoint: string, data?: object, maxResponseBytes?: number): Promise<T> {
        return this.readData<T>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data ?? {}),
        }, maxResponseBytes);
    }

    async requestWrite<T>(endpoint: string, data?: object): Promise<T> {
        return this.readData<T>(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data ?? {}),
        });
    }

    /** @deprecated parity with SiYuanClient; defaults to write semantics. */
    async request<T>(endpoint: string, data?: object): Promise<T> {
        return this.requestWrite(endpoint, data);
    }

    async requestApi(endpoint: string, method: string, body?: string): Promise<unknown> {
        const upper = method.toUpperCase();
        const init: { method: string; headers: Record<string, string>; body?: string } = {
            method: upper,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body !== undefined && upper !== 'GET' && upper !== 'HEAD') init.body = body;
        return this.readData<unknown>(endpoint, init);
    }

    async readFile(path: string): Promise<string> {
        // storage/petal paths resolve via siyuan.storage; workspace paths go
        // through the kernel getFile API. A missing petal file surfaces from
        // goja as "open <path>: no such file or directory", which callers like
        // WriteSafetyLedger treat as absent only when the message matches a
        // not-found pattern — normalize it to an empty read.
        if (isPetalPath(path)) {
            try {
                const obj = await siyuan.storage.get(petalRelative(path));
                if (!obj) return '';
                return await obj.text();
            } catch (error) {
                if (isMissingFileError(error)) return '';
                throw error;
            }
        }
        const resp = await this.doFetch('/api/file/getFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        return await resp.text();
    }

    async readFileBinary(path: string): Promise<Uint8Array> {
        if (isPetalPath(path)) {
            try {
                const obj = await siyuan.storage.get(petalRelative(path));
                if (!obj) return new Uint8Array(0);
                const ab = await obj.arrayBuffer();
                return new Uint8Array(ab as ArrayBuffer);
            } catch (error) {
                if (isMissingFileError(error)) return new Uint8Array(0);
                throw error;
            }
        }
        const resp = await this.doFetch('/api/file/getFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        const ab = await resp.arrayBuffer();
        return new Uint8Array(ab as ArrayBuffer);
    }

    async writeFile(path: string, content: string): Promise<void> {
        if (isPetalPath(path)) {
            await siyuan.storage.put(petalRelative(path), content);
            return;
        }
        // Workspace files: putFile expects multipart; kernel mode writes via
        // base64 JSON upload is not part of the kernel API. Fall back to a
        // clear error rather than corrupting the workspace.
        throw new KernelResponseError(
            `kernel sandbox: writeFile('${path}') outside storage/petal is not supported`,
            501,
            false,
        );
    }

    async requestFormDataRead<T>(endpoint: string, _formData: unknown): Promise<T> {
        return this.requestRead<T>(endpoint, {});
    }

    async requestFormDataWrite<T>(_endpoint: string, _formData: unknown): Promise<T> {
        throw new KernelResponseError(
            'kernel sandbox: multipart form-data writes are not supported',
            501,
            false,
        );
    }

    async requestFormData<T>(endpoint: string, formData: unknown): Promise<T> {
        return this.requestFormDataWrite<T>(endpoint, formData);
    }
}

const PETAL_PREFIX = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/';

function isPetalPath(path: string): boolean {
    return typeof path === 'string' && path.startsWith(PETAL_PREFIX);
}

function petalRelative(path: string): string {
    return path.slice(PETAL_PREFIX.length);
}

// goja's storage.get throws a Go-flavored message for absent files; the
// desktop getFile API instead returns an HTTP 202 error envelope. Treat the
// kernel-side throw as the same "missing" condition.
function isMissingFileError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /no such file or directory|not exist|file does not exist|cannot find/i.test(msg);
}
