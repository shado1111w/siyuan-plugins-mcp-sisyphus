/**
 * text — read a block as plain text. Strips tags, decodes entities, and
 * collapses whitespace so an agent gets the readable content without
 * HTML or kramdown markup noise.
 */

const ENTITY_MAP: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
};

export function decodeEntities(text: string): string {
    return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m);
}

/** Convert a rendered block DOM into readable plain text. */
export function domToPlainText(dom: string): string {
    if (!dom || typeof dom !== 'string') return '';
    let out = dom;
    // Drop non-content scaffolding.
    out = out.replace(/<div class="protyle-attr"[^>]*>.*?<\/div>/gs, ' ');
    out = out.replace(/<div class="protyle-action[^"]*"[^>]*>.*?<\/div>/gs, ' ');
    out = out.replace(/<script\b[^>]*>.*?<\/script>/gs, ' ');
    out = out.replace(/<style\b[^>]*>.*?<\/style>/gs, ' ');
    // Line breaks for block-level boundaries.
    out = out.replace(/<\/(p|div|li|h[1-6]|blockquote|tr|table|ul|ol)>/gi, '\n');
    out = out.replace(/<br\s*\/?>/gi, '\n');
    out = out.replace(/<\/(td|th)>/gi, ' | ');
    // Strip all remaining tags.
    out = out.replace(/<[^>]+>/g, '');
    out = decodeEntities(out);
    // Normalize whitespace per line, drop empty lines.
    const lines = out.split('\n').map((l) => l.replace(/[ \t\u200b]+/g, ' ').trim()).filter((l) => l.length > 0);
    return lines.join('\n');
}
