import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, MascotAction } from '../../core/config';
import { MASCOT_ACTION_HINTS, MASCOT_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { readPuppyStats, spendPuppyBalance } from '../../core/puppy-state';
import {
    MascotActionSchema,
    MascotBuySchema,
    MascotGetBalanceSchema,
    MascotShopSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';

export const MASCOT_TOOL_NAME = 'mascot';
export const SHOP_ITEMS = [
    { id: 'cat-food', label: 'Cat Food', cost: 5, type: 'food', emoji: '🍖' },
    { id: 'milk', label: 'Milk', cost: 3, type: 'drink', emoji: '🥛' },
    { id: 'dried-fish', label: 'Dried Fish', cost: 4, type: 'food', emoji: '🐟' },
    { id: 'can-food', label: 'Canned Food', cost: 6, type: 'food', emoji: '🥫' },
    { id: 'catnip', label: 'Catnip', cost: 5, type: 'snack', emoji: '🌿' },
    { id: 'chicken-leg', label: 'Chicken Leg', cost: 7, type: 'food', emoji: '🍗' },
    { id: 'cheese', label: 'Cheese', cost: 4, type: 'snack', emoji: '🧀' },
] as const;
export const FOOD_ITEM = SHOP_ITEMS[0];
export const DRINK_ITEM = SHOP_ITEMS[1];

function getShopItem(itemId: string) {
    return SHOP_ITEMS.find((item) => item.id === itemId) ?? null;
}

export const MASCOT_VARIANTS: ActionVariant<MascotAction>[] = [
    createZodActionVariant('get_balance', MascotGetBalanceSchema, 'Get the mascot balance. Every successful MCP tool call earns 1 coin.'),
    createZodActionVariant('shop', MascotShopSchema, 'List the mascot shop inventory.'),
    createZodActionVariant('buy', MascotBuySchema, 'Buy one item from the mascot shop.'),
];

export const MASCOT_ACTION_HANDLERS: Record<MascotAction, ToolActionHandler> = {
        get_balance: async ({ client, rawArgs }) => {
            MascotGetBalanceSchema.parse(rawArgs);
            const stats = await readPuppyStats(client);
            return createJsonResult({
                action: 'get_balance',
                balance: stats.balance,
                totalEarned: stats.totalCalls,
            });
        },
        shop: async ({ client, rawArgs }) => {
            MascotShopSchema.parse(rawArgs);
            const stats = await readPuppyStats(client);
            return createJsonResult({
                action: 'shop',
                balance: stats.balance,
                totalEarned: stats.totalCalls,
                items: SHOP_ITEMS,
            });
        },
        buy: async ({ client, rawArgs }) => {
            const parsed = MascotBuySchema.parse(rawArgs);
            const item = getShopItem(parsed.item_id);
            if (!item) {
                throw new Error(`Unknown mascot shop item: ${parsed.item_id}.`);
            }

            const stats = await spendPuppyBalance(client, item.cost, `buy:${item.id}`);
            return createJsonResult({
                success: true,
                action: 'buy',
                item_id: item.id,
                item: item.label,
                type: item.type,
                emoji: item.emoji,
                cost: item.cost,
                balance: stats.balance,
                totalEarned: stats.totalCalls,
            });
        },
};

const mascotTool = defineTool<MascotAction>({
    name: 'mascot',
    description: '🐾 Grouped mascot balance and care operations. Every successful MCP tool call earns 1 coin for the mascot.',
    variants: MASCOT_VARIANTS,
    actionSchema: MascotActionSchema,
    aggregateOptions: {
        guidance: MASCOT_GUIDANCE,
        actionHints: MASCOT_ACTION_HINTS,
    },
    handlers: MASCOT_ACTION_HANDLERS,
});

export function listMascotTools(config: CategoryToolConfig<MascotAction>) {
    return mascotTool.listTools(config);
}

export async function callMascotTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<MascotAction>,
    _permMgr: PermissionManager,
): Promise<ToolResult> {
    return mascotTool.callTool(client, args, config, _permMgr);
}
