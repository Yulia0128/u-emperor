import { dayKey, moveDay, periodFor, chronicleReport, QUIPS, PRAISES, praiseLine } from './chronicles.js';
import { createId } from './ids.js';

export function openChronicle(ui, node) {
    const { dialog, body } = ui.dialog('史册', { wide: true, className: 'ue-chronicle' });
    const book = ui.state.chronicle, today = dayKey(Date.now(), book.zone);
    let anchor = today, mode = 'month'; const choices = new Map();
    const quip = type => { if (!choices.has(type)) choices.set(type, QUIPS[type][Math.floor(Math.random() * QUIPS[type].length)]); return choices.get(type); };
    const praiseVariants = Object.fromEntries(Object.entries(PRAISES).map(([key, lines]) => [key, Math.floor(Math.random() * lines.length)]));
    const head = node('div', 'ue-history-controls'); const modes = node('div', 'ue-history-modes');
    const picker = node('input', 'ue-input'); picker.type = 'date'; picker.value = anchor; picker.setAttribute('aria-label', '史册日期');
    const previous = ui.button('‹', () => shift(-1), 'ue-icon', '上一期'); const next = ui.button('›', () => shift(1), 'ue-icon', '下一期');
    head.append(previous, picker, next, ui.button('本期', () => { anchor = today; render(); }, 'ue-subtle'));
    const content = node('div', 'ue-history-layout'); const calendar = node('section', 'ue-history-calendar'); const report = node('section', 'ue-history-report'); content.append(calendar, report);
    const bubble = node('div', 'ue-history-day-bubble'); bubble.id = createId('ue-day'); bubble.hidden = true;
    bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite'); bubble.setAttribute('aria-atomic', 'true');
    let bubbleRevision = 0, bubbleDate = '', finishFade;
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function positionBubble() {
        if (bubble.hidden) return;
        const target = calendar.querySelector(`[aria-label="${bubbleDate}"]`); if (!target) return;
        const rect = target.getBoundingClientRect(), parent = calendar.getBoundingClientRect();
        const center = rect.left + rect.width / 2 - parent.left - calendar.clientLeft;
        const left = Math.max(8, Math.min(center - bubble.offsetWidth / 2, calendar.clientWidth - bubble.offsetWidth - 8));
        bubble.style.left = `${left}px`; bubble.style.top = `${rect.bottom - parent.top - calendar.clientTop + 6}px`;
        bubble.style.setProperty('--ue-tip', `${Math.max(8, Math.min(bubble.offsetWidth - 8, center - left))}px`);
    }
    async function selectDate(key, active) {
        const request = ++bubbleRevision; finishFade?.();
        if (!bubble.hidden && !reducedMotion()) {
            await new Promise(resolve => {
                const finish = () => { clearTimeout(timer); bubble.removeEventListener('transitionend', end); if (finishFade === finish) finishFade = null; resolve(); };
                const end = event => { if (event.target === bubble && event.propertyName === 'opacity') finish(); };
                const timer = setTimeout(finish, 340); finishFade = finish;
                bubble.addEventListener('transitionend', end); bubble.dataset.phase = 'leaving';
            });
        }
        if (!dialog.open || request !== bubbleRevision) return;
        bubble.hidden = true; anchor = key; render(true);
        const target = calendar.querySelector(`[aria-label="${key}"]`); target?.focus({ preventScroll: true });
        if (!active) return;
        const total = Object.values(book.days[key]).reduce((sum, row) => sum + row.floors, 0);
        bubbleDate = key; bubble.textContent = `今日聊了 ${total.toLocaleString()} 楼`;
        bubble.dataset.phase = 'entering'; bubble.hidden = false; target?.setAttribute('aria-describedby', bubble.id);
        positionBubble(); void bubble.offsetWidth; bubble.dataset.phase = 'visible';
    }
    window.addEventListener('resize', positionBubble);
    dialog.addEventListener('close', () => { bubbleRevision++; finishFade?.(); window.removeEventListener('resize', positionBubble); }, { once: true });
    const note = node('p', 'ue-muted ue-small');
    note.textContent = `自 ${dayKey(book.startedAt, book.zone)} 开始记载 · ${book.zone}`;
    body.append(head, note, content);
    function shift(direction) {
        const p = periodFor(anchor, mode);
        anchor = direction > 0 ? p.end : moveDay(p.start, -1); render();
    }
    const buttons = new Map();
    for (const [id, label] of [['week', '周'], ['month', '月'], ['year', '年']]) { const b = ui.button(label, () => { mode = id; render(); }, 'ue-subtle'); buttons.set(id, b); modes.append(b); }
    picker.addEventListener('change', () => { if (picker.value) { anchor = picker.value; render(); } });
    function render(keepBubble = false) {
        if (!dialog.open) return;
        if (!keepBubble) { bubbleRevision++; finishFade?.(); bubble.hidden = true; }
        picker.value = anchor; for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === mode));
        const data = chronicleReport(book, anchor, mode), p = data.period;
        const started = dayKey(book.startedAt, book.zone), unavailable = p.last < started || p.start > today;
        const gaps = book.gaps.some(g => p.contains(dayKey(g.start, book.zone)) || p.contains(dayKey(g.end, book.zone)) || (dayKey(g.start, book.zone) < p.start && dayKey(g.end, book.zone) >= p.end)) || (book.pausedAt > 0 && p.last >= dayKey(book.pausedAt, book.zone));
        calendar.replaceChildren(); report.replaceChildren();
        const caption = node('div', 'ue-history-calendar-head'); caption.append(node('h3', '', `${anchor.slice(0, 4)} 年 ${+anchor.slice(5, 7)} 月`)); calendar.append(caption);
        const grid = node('div', 'ue-history-days');
        for (const label of ['一', '二', '三', '四', '五', '六', '日']) grid.append(node('span', 'ue-muted', label));
        const month = periodFor(anchor, 'month'), offset = (new Date(month.start).getUTCDay() + 6) % 7;
        for (let i = 0; i < offset; i++) grid.append(node('span'));
        for (let day = month.start; day < month.end; day = moveDay(day, 1)) {
            const key = day; const active = Object.keys(book.days[day] || {}).length > 0;
            const b = ui.button(String(+day.slice(-2)), () => selectDate(key, active), 'ue-history-day');
            b.dataset.inPeriod = String(p.contains(day)); b.dataset.active = String(Object.keys(book.days[day] || {}).length > 0); b.setAttribute('aria-label', key); b.setAttribute('aria-pressed', String(day === anchor));
            if (day === today) b.setAttribute('aria-current', 'date'); grid.append(b);
        }
        calendar.append(grid, modes, bubble);
        const periodTitle = node('div', 'ue-history-period'); periodTitle.append(node('h3', '', `${p.start.replaceAll('-', '.')} — ${p.last.replaceAll('-', '.')}`), node('span', 'ue-badge', unavailable ? p.start > today ? '尚未开篇' : '尚未收录' : p.contains(today) ? '本期进行中' : '往期回顾')); report.append(periodTitle);
        if (!unavailable && (p.start < started || gaps)) report.append(node('p', 'ue-muted ue-small', '本期部分日期未记录，以下仅为已收录内容。'));
        const stats = node('div', 'ue-history-stats');
        for (const [type, label, value, unit] of [['floors', '聊天总楼层', data.floors, '楼'], ['tokens', '总Token', data.tokens, 'tokens'], ['newcomers', '新入宫', data.newcomers.length, '位']]) {
            const tile = node('article', 'ue-history-stat'); tile.append(node('span', 'ue-muted', label));
            const partial = type === 'tokens' && data.floors > data.tokenFloors;
            const missing = unavailable || (partial && !data.tokenFloors);
            tile.append(node('strong', '', missing ? '—' : `${partial ? '≥ ' : ''}${value.toLocaleString()} ${unit}`));
            if (unavailable || missing || (!value && !partial)) tile.append(node('p', 'ue-muted', unavailable ? '此段史册尚未收录。' : missing ? '尚无 Token 记录。' : quip(type)));
            stats.append(tile);
        }
        report.append(stats);
        const awards = node('div', 'ue-history-awards');
        const names = id => ui.host.ctx.characters.find(c => c.avatar === id)?.name || '已离宫角色';
        for (const [key, title] of [['favorites', '独占圣眷'], ['companions', '长相厮守'], ['ascents', '青云直上'], ['returns', '藕断丝连']]) {
            const tile = node('article', `ue-history-award ue-history-${key}`); tile.append(node('h3', '', title));
            if (unavailable || !data[key].length) tile.append(node('p', 'ue-muted', unavailable ? '此段史册尚未收录。' : quip(key)));
            for (const row of data[key]) {
                const winner = node('div', 'ue-history-winner');
                const exists = ui.host.ctx.characters.some(c => c.avatar === row.id);
                if (exists) { const image = node('img'); image.src = ui.host.cover(row.id); image.alt = ''; winner.append(image); }
                const copy = node('div'); const name = exists ? ui.button(names(row.id), () => ui.detail(row.id), 'ue-history-name') : node('span', '', names(row.id)); copy.append(name);
                copy.append(node('p', 'ue-muted', praiseLine(key, row, praiseVariants[key]))); winner.append(copy); tile.append(winner);
            }
            awards.append(tile);
        }
        report.append(awards);
        if (data.newcomers.length) { const arrivals = node('details', 'ue-text-section'); arrivals.append(node('summary', '', `本期入宫名录 · ${data.newcomers.length} 位`)); for (const [id, at] of data.newcomers) arrivals.append(node('p', 'ue-prose', `${names(id)} · ${dayKey(at, book.zone)}`)); report.append(arrivals); }
    }
    render();
}
