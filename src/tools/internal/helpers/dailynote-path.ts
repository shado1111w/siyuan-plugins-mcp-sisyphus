const GO_DATE_LAYOUT_RE = /\{\{\s*now\s*\|\s*date\s*"([^"]+)"\s*\}\}/g;

export function todayLocalDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDate(date: string): Date {
    const [y, m, d] = date.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(y, m - 1, d);
}

function formatGoDate(layout: string, date: Date): string {
    // Go reference time: Mon Jan 2 15:04:05 MST 2006.
    // Tokenize once and longest-match first so replacements cannot re-match.
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const pad3 = (n: number) => String(n).padStart(3, '0');
    const pad4 = (n: number) => String(n).padStart(4, '0');
    const mo = date.getMonth() + 1;
    const d = date.getDate();
    // Go layouts use fixed English names; goja does not provide Intl.
    const monthLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][date.getMonth()];
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    const monthShort = monthLong.slice(0, 3);
    const tokens: Array<[string, string]> = [
        ['January', monthLong],
        ['Jan', monthShort],
        ['Monday', weekday],
        ['Mon', weekday.slice(0, 3)],
        ['2006', pad4(date.getFullYear())],
        ['06', String(date.getFullYear()).slice(-2)],
        ['01', pad2(mo)],
        ['02', pad2(d)],
        ['_2', ` ${d}`],
        ['15', pad2(date.getHours())],
        ['03', pad2(0)],   // 12-hour clock hour (rare in save paths; kept for parity)
        ['04', pad2(date.getMinutes())],
        ['05', pad2(date.getSeconds())],
        ['PM', date.getHours() >= 12 ? 'PM' : 'AM'],
        ['pm', date.getHours() >= 12 ? 'pm' : 'am'],
        ['MST', 'CST'],
    ];
    // Sort longest first to avoid '01' matching inside '2006'.
    const sorted = [...tokens].sort((a, b) => b[0].length - a[0].length);
    let out = '';
    let i = 0;
    while (i < layout.length) {
        let matched = false;
        for (const [token, replacement] of sorted) {
            if (layout.startsWith(token, i)) {
                out += replacement;
                i += token.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            out += layout[i];
            i += 1;
        }
    }
    return out;
}

export function renderDailyNoteHPath(savePathTemplate: string, date: string): string | null {
    const target = parseDate(date);
    let rendered = savePathTemplate;
    let match: RegExpExecArray | null;
    const re = new RegExp(GO_DATE_LAYOUT_RE.source, 'g');
    while ((match = re.exec(savePathTemplate)) !== null) {
        const layout = match[1];
        rendered = rendered.replace(match[0], formatGoDate(layout, target));
    }
    // Still contains other Go template expressions we cannot render locally.
    if (rendered.includes('{{')) return null;
    if (!rendered.startsWith('/')) rendered = `/${rendered}`;
    return rendered.replace(/\/+$/, '') || '/';
}
