/*
 * Kernel tool schema manifest — evaluated at BUILD time (Node), never inside
 * the goja sandbox.
 *
 * Importing TOOL_REGISTRY / defineTool here is intentional and safe: this file
 * is only ever loaded by the codegen script (scripts/gen-kernel-schemas.mjs)
 * through vite ssrLoadModule in a Node host, where z.toJSONSchema() works.
 * The resulting plain JSON is what kernel.js embeds, so the sandbox never runs
 * schema reflection itself.
 */

import { buildDefaultToolConfig, TOOL_CATEGORIES } from '../core/config';
import { TOOL_REGISTRY } from '../core/tool-registry';

export interface KernelToolDescriptor {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

/**
 * Collect the aggregated tool descriptors for every statically-known category.
 * 'extension' is intentionally skipped: its tools are discovered at runtime
 * through the official MCP bridge, so there is no static schema to bake in.
 */
export function buildKernelToolManifest(): KernelToolDescriptor[] {
    const config = buildDefaultToolConfig();
    const out: KernelToolDescriptor[] = [];
    for (const category of TOOL_CATEGORIES) {
        if (category === 'extension') continue;
        const module = TOOL_REGISTRY[category];
        if (!module || typeof module.listTools !== 'function') continue;
        const descriptors = module.listTools(config[category]);
        for (const descriptor of descriptors) {
            out.push({
                name: descriptor.name,
                description: descriptor.description,
                inputSchema: descriptor.inputSchema as Record<string, unknown> | undefined,
            });
        }
    }
    return out;
}

