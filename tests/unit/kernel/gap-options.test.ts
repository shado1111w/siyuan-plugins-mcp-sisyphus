import { expect, it } from 'vitest';
import { normalizeKernelOptions, isKernelOriginAllowed } from '@/core/kernel-options';
it('bounds advanced budgets and rejects wildcard/credential/path origins', () => {
    const options = normalizeKernelOptions({ readMaxMiB: 10000, readRetries: -1, readTimeoutMs: NaN, allowedOrigins: ['*', 'null', 'https://x/path', 'https://user@x', 'https://x', 'https://x'] });
    expect(options).toMatchObject({ readMaxMiB: 64, readRetries: 0, readTimeoutMs: 30000, allowedOrigins: ['https://x'] });
    expect(isKernelOriginAllowed('https://x', 'localhost:6806', options)).toBe(true);
    expect(isKernelOriginAllowed('https://x.evil', 'localhost:6806', options)).toBe(false);
    expect(isKernelOriginAllowed('http://localhost:6806', 'localhost:6806', options)).toBe(true);
    expect(isKernelOriginAllowed('null', 'localhost:6806', options)).toBe(false);
});
