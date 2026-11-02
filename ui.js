import { KEY, VERSION, MODES, entities, excerpt, recordFor, assignRank, removeRank, archiveKey, logAction, weightedPick, drawWeight, discordUrl, downloadUrl, dateLabel, companionLabel, makeBackup, readBackup, normalize, applyRankPreset } from './core.js';
import { saveFile, fullBackup } from './backup.js';
import { createId } from './ids.js';
import { bindCarousel } from './carousel.js';

const asset = name => globalThis.__UE_PREVIEW_ASSETS__?.[name] || new URL(`./assets/${name}`, import.meta.url).href;
const nameFace = asset('plaque-name-face.png');
const portraitFrame = asset('plaque-portrait-frame.png');
const trayImage = asset('tray-empty.png');
export function node(tag, cls = '', value = '') {
    const e = document.createElement(tag); if (cls) e.className = cls; if (value !== '') e.textContent = value; return e;
}
function field(label, control, hint = '') {
    const wrap = node('label', 'ue-field'); control.setAttribute('aria-label', label); wrap.append(node('span', '', label), control); if (hint) wrap.append(node('small', 'ue-muted', hint)); return wrap;
}
function input(value = '', type = 'text') { const e = node('input', 'ue-input'); e.type = type; e.value = value; return e; }
function select(options, value) { const e = node('select', 'ue-input'); for (const [id, label] of options) { const option = node('option', '', label); option.value = id; e.append(option); } e.value = value; return e; }
function dateTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '时间未知'; }
function crown() {
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 52'); svg.setAttribute('class', 'ue-crown'); svg.setAttribute('aria-hidden', 'true');
    for (const d of ['M7 17 19 27 23 11 32 24 41 11 45 27 57 17 50 41Q32 46 14 41Z', 'M14 45Q32 50 50 45L48 50Q32 54 16 50Z']) {
        const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); path.setAttribute('fill', 'currentColor'); svg.append(path);
    }
    for (const [cx, cy, r] of [[7, 13, 4], [23, 7, 3], [32, 4, 4], [41, 7, 3], [57, 13, 4]]) {
        const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r); circle.setAttribute('fill', 'currentColor'); svg.append(circle);
    }
    const peak = document.createElementNS(ns, 'path'); peak.setAttribute('d', 'M25 23 32 9 39 23 32 28Z'); peak.setAttribute('fill', 'currentColor'); svg.append(peak);
    return svg;
}
// Native document handlers close unpinned drawers on outside clicks/Escape.
// Stop only our owned surfaces, after local handlers; don't block native menus.
function isolateSurface(element) {
    element.addEventListener('click', event => event.stopPropagation());
    element.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
}

export class EmperorUI {
    constructor(host) {
        this.host = host; this.dialogs = new Set(); this.shells = new Set(); this.query = ''; this.tag = ''; this.activeRank = 'all'; this.controller = new AbortController(); this.historyJobs = new Map();
    }
    get state() { return this.host.ctx.extensionSettings[KEY]; }
    save() { this.host.save(); }
    setState(state) { this.host.ctx.extensionSettings[KEY] = normalize(state); this.save(); this.redraw(); }
    notify(message, bad = false) {
        if (!this.toast) { this.toast = node('div', 'ue-toast'); this.toast.setAttribute('role', 'status'); document.body.append(this.toast); }
        this.toast.textContent = message; this.toast.dataset.bad = String(bad); this.toast.hidden = false;
        clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { if (this.toast) this.toast.hidden = true; }, 6500);
    }
    button(label, action, cls = '', title = '') {
        const b = node('button', `ue-button ${cls}`, label); b.type = 'button';
        if (title) { b.title = title; b.setAttribute('aria-label', title); }
        b.addEventListener('click', async () => {
            if (b.disabled) return;
            b.disabled = true; b.setAttribute('aria-busy', 'true');
            try { await action(); } catch (e) { this.notify(e.message || '操作失败，请重试。', true); }
            finally { if (b.dataset.revealed !== 'true') b.disabled = false; b.removeAttribute('aria-busy'); }
        }); return b;
    }
    dialog(title, { wide = false, className = '' } = {}) {
        const d = node('dialog', `ue-dialog ${wide ? 'ue-wide' : ''} ${className}`);
        isolateSurface(d);
        const head = node('header', 'ue-dialog-head'); const h = node('h2', '', title); h.id = createId('ue-title');
        const close = this.button('×', () => d.close(), 'ue-icon', '关闭');
        head.append(h, close); const body = node('div', 'ue-dialog-body');
        d.setAttribute('aria-labelledby', h.id); d.append(head, body); document.body.append(d);
        const opener = document.activeElement;
        d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
        d.addEventListener('close', () => { this.dialogs.delete(d); d.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
        this.dialogs.add(d); d.showModal();
        return { dialog: d, body };
    }
    closeAll() { for (const d of [...this.dialogs].reverse()) d.close(); }
    async all({ statsRequired = false } = {}) {
        let stats = {};
        try { stats = await this.host.stats(); }
        catch (e) { if (statsRequired) throw new Error(`旧情复燃需要历史聊天统计：${e.message}`); stats = this.host.statsValue || {}; }
        const all = entities(this.host.ctx, this.state, stats);
        for (const entity of all) {
            const history = this.host.historyValue?.get(entity.id);
            entity.played ||= history?.played === true;
            entity.historyPending = !!this.host.history && !history;
            entity.historyUnavailable = history?.complete === false;
            if (!this.host.history) continue;
            const job = this.host.history(entity.id);
            if (this.historyJobs.get(entity.id) === job) continue;
            this.historyJobs.set(entity.id, job);
            job.then(dates => {
                if (this.controller.signal.aborted || !this.state.enabled || this.host.historyJobs.get(entity.id) !== job) return;
                const record = recordFor(this.state, entity.id);
                if (dates.first) record.firstPlayedAt = record.firstPlayedAt ? Math.min(record.firstPlayedAt, dates.first) : dates.first;
                record.lastPlayedAt = Math.max(record.lastPlayedAt, dates.last);
                this.save();
            }).catch(() => {}).finally(() => {
                if (this.controller.signal.aborted) return;
                clearTimeout(this.historyTimer); this.historyTimer = setTimeout(() => this.redraw(), 80);
            });
        }
        return all;
    }
    companion(entity) { return !entity.firstPlayed && entity.historyUnavailable ? '相伴时间待补全' : !entity.firstPlayed && entity.historyPending && !entity.played ? '正在读取相伴…' : companionLabel(entity.firstPlayed, Date.now(), entity.played); }
    async redraw() { for (const shell of this.shells) await shell.draw(); }
    cover(entity, cls = '') {
        const image = node('img', `ue-cover ${cls}`); image.src = this.host.cover(entity.id); image.alt = entity.name; image.loading = 'lazy'; image.draggable = false;
        image.addEventListener('error', () => { image.removeAttribute('src'); image.classList.add('ue-cover-error'); }, { once: true }); return image;
    }
    async continue(entity, filename) {
        let chat = filename;
        if (!chat) {
            const rows = await this.host.listChats(entity.id);
            chat = [entity.record.lastChat, entity.raw.chat].find(name => name && rows.some(r => r.name === name)) || rows[0]?.name;
        }
        const opened = chat ? await this.host.open(entity.id, chat) : await this.host.newChat(entity.id);
        logAction(this.state, entity.id, 'open', Date.now(), opened); this.save(); this.closeAll();
    }
    async fresh(entity, greetingIndex = null) {
        const name = await this.host.newChat(entity.id, greetingIndex);
        logAction(this.state, entity.id, 'open', Date.now(), name); this.save(); this.closeAll();
    }
    rankStyle(element, rankId) {
        const position = Math.max(0, this.state.ranks.findIndex(rank => rank.id === rankId));
        const colors = ['#e5c576', '#c7d0db', '#bd8b65'];
        const color = colors[position] || `hsl(215 7% ${Math.max(21, 48 - (position - 3) * 5)}%)`;
        element.style.setProperty('--ue-rank-gold', color);
        element.style.setProperty('--ue-rank-label', position < 3 ? color : `hsl(215 5% ${Math.max(58, 72 - (position - 3) * 3)}%)`);
        element.style.setProperty('--ue-rank-glow', String(position < 3 ? [.36, .27, .22][position] : Math.max(.04, .16 - (position - 3) * .025)));
    }
    card(entity) {
        const card = node('article', `ue-card ${entity.rank.id === 'queen' ? 'ue-queen' : ''}`);
        card.dataset.rank = entity.rank.id;
        this.rankStyle(card, entity.rank.id);
        const open = this.button('', () => this.detail(entity.id), 'ue-card-open', `查看 ${entity.name}`); open.append(this.cover(entity));
        const content = node('div', 'ue-card-copy');
        content.append(node('h3', '', entity.name), node('p', 'ue-card-meta', this.companion(entity)));
        const actions = node('div', 'ue-card-actions');
        actions.append(this.button('▷', () => this.continue(entity), 'ue-icon ue-primary', `继续 ${entity.name} 的上次聊天`));
        actions.append(this.button('···', () => this.detail(entity.id), 'ue-icon', `${entity.name} 的档案与存档`));
        card.append(open, content, actions); return card;
    }
    shell({ home = false, native = false } = {}) {
        const root = node('section', 'ue-app'); root.dataset.ueVersion = VERSION; root.setAttribute('aria-label', 'U皇万岁角色管理器');
        isolateSurface(root);
        const header = node('header', 'ue-header'); const brand = node('div', 'ue-brand');
        const search = input('', 'search'); search.placeholder = '搜索角色或标签'; search.setAttribute('aria-label', '搜索角色或标签');
        const tools = node('div', 'ue-tools');
        tools.append(this.button('＋', () => this.importDialog(), 'ue-icon', '入宫：导入或创建角色'), this.button('⚙', () => this.settings(), 'ue-icon', '设置与备份'));
        if (home) tools.append(this.button('原生首页', () => { this.state.homepage = false; this.save(); this.onHomePreference?.(); }, 'ue-subtle'));
        if (native) tools.append(this.button('原生面板', () => this.onNativeEntry?.(), 'ue-subtle'));
        const layout = node('div', 'ue-layout'); const sidebar = node('nav', 'ue-sidebar'); sidebar.setAttribute('aria-label', '妃位快速跳转');
        const main = node('div', 'ue-main'); const top = node('div', 'ue-toolbar'); const count = node('span', 'ue-muted');
        let viewRank = 'all', renderedRank = 'all'; const viewScrolls = new Map(), railPositions = new Map(); let carousels = [];
        const navigate = async rankId => {
            viewRank = rankId; rankDrawer?.close(); await draw();
            groups.querySelector('.ue-category-title')?.focus({ preventScroll: true });
        };
        let rankDrawer;
        const categories = this.button('', () => {
            if (rankDrawer?.open) return;
            const opened = this.dialog('妃位分类', { className: 'ue-rank-drawer' }); rankDrawer = opened.dialog;
            categories.setAttribute('aria-expanded', 'true'); opened.body.append(filters);
            rankDrawer.addEventListener('close', () => { if (root.isConnected) layout.prepend(filters); categories.setAttribute('aria-expanded', 'false'); rankDrawer = null; }, { once: true });
        }, 'ue-category-entry', '打开妃位分类'); categories.setAttribute('aria-expanded', 'false');
        categories.append(crown()); brand.append(categories, node('h1', '', 'U皇万岁')); header.append(brand, tools);
        const tag = select([['', '全部标签']], ''); tag.setAttribute('aria-label', '按标签筛选'); tag.classList.add('ue-tag-filter');
        const filters = node('div', 'ue-drawer-filters'); filters.append(field('搜索角色或标签', search), field('按标签筛选', tag), node('h3', '', '妃位分类'), sidebar);
        const refresh = this.button('↻', async () => { await this.host.refresh(); await draw(); }, 'ue-icon', '刷新角色与存档信息');
        const drawButton = this.button('翻牌', () => this.drawDialog(), 'ue-primary ue-draw-entry');
        const back = this.button('‹ 返回金字塔', () => navigate('all'), 'ue-subtle ue-back-gallery'); back.hidden = true;
        top.append(back, count, refresh, drawButton); const groups = node('div', 'ue-groups'); main.append(top, groups); layout.append(filters, main); root.append(header, layout);
        let revision = 0, timer;
        const draw = async () => {
            const id = ++revision; const all = await this.all();
            if (id !== revision || !this.shells.has(shell)) return;
            const query = search.value.trim().toLocaleLowerCase();
            const filtered = all.filter(e => (!query || [e.name, ...e.tags].join(' ').toLocaleLowerCase().includes(query)) && (!tag.value || e.tags.includes(tag.value)));
            const selectedTag = tag.value;
            tag.replaceChildren(...[['', '全部标签'], ...[...new Set(all.flatMap(e => e.tags))].sort().map(t => [t, t])].map(([value, label]) => { const o = node('option', '', label); o.value = value; return o; })); tag.value = selectedTag;
            if (!this.state.ranks.some(rank => rank.id === viewRank)) viewRank = 'all';
            viewScrolls.set(renderedRank, main.scrollTop);
            groups.querySelectorAll('.ue-carousel').forEach(rail => railPositions.set(rail.dataset.rank, rail.querySelector('.ue-carousel-viewport').scrollLeft));
            carousels.forEach(carousel => carousel.dispose()); carousels = [];
            root.dataset.view = viewRank === 'all' ? 'gallery' : 'category'; root.dataset.rank = viewRank;
            back.hidden = viewRank === 'all'; this.activeRank = viewRank;
            const current = viewRank === 'all' ? filtered : filtered.filter(entity => entity.rank.id === viewRank);
            count.textContent = `${current.length} / ${all.length} 位角色`;
            sidebar.replaceChildren(); groups.replaceChildren();
            sidebar.append(this.button('全部角色', () => navigate('all'), 'ue-nav-item'));
            for (const [position, rank] of this.state.ranks.entries()) {
                const members = filtered.filter(e => e.rank.id === rank.id).sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name, 'zh-CN'));
                if ((query || selectedTag) && !members.length && viewRank !== rank.id) continue;
                const nav = this.button('', () => navigate(rank.id), 'ue-nav-item'); nav.dataset.rank = rank.id;
                nav.append(node('span', '', rank.name), node('span', 'ue-count', String(members.length))); sidebar.append(nav);
                if (viewRank !== 'all' && viewRank !== rank.id) continue;
                const section = node('section', `ue-rank-section ${viewRank === 'all' ? 'ue-gallery-tier' : 'ue-category-view'} ${rank.id === 'cold' ? 'ue-cold' : ''}`);
                section.dataset.rank = rank.id; this.rankStyle(section, rank.id);
                const heading = node('div', 'ue-section-heading'); const title = node('h2');
                if (viewRank === 'all') title.append(this.button(rank.name, () => navigate(rank.id), 'ue-rank-entry', `查看${rank.name}全部角色`));
                else { title.textContent = rank.name; title.className = 'ue-category-title'; title.tabIndex = -1; }
                heading.append(title, node('span', 'ue-count', String(members.length)));
                if (rank.id === 'cold') heading.append(node('small', 'ue-muted', '不参与随机翻牌'));
                section.append(heading);
                const visible = members.slice(0, 24);
                let grid, carousel;
                if (viewRank === 'all' && members.length) {
                    const rail = node('div', 'ue-carousel'); rail.dataset.rank = rank.id; rail.style.setProperty('--ue-slots', String(position === 0 ? 1 : position * 2));
                    const viewport = node('div', 'ue-carousel-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', `${rank.name}角色横向列表`);
                    grid = node('div', 'ue-carousel-track'); viewport.append(grid);
                    const left = node('button', 'ue-button ue-carousel-arrow', '‹'); left.type = 'button'; left.dataset.direction = 'previous'; left.setAttribute('aria-label', `向左浏览${rank.name}`);
                    const right = node('button', 'ue-button ue-carousel-arrow', '›'); right.type = 'button'; right.dataset.direction = 'next'; right.setAttribute('aria-label', `向右浏览${rank.name}`); left.hidden = right.hidden = true;
                    rail.append(viewport, left, right); section.append(rail);
                    visible.forEach(entity => grid.append(this.card(entity)));
                    carousel = bindCarousel(rail, railPositions.get(rank.id) || 0); carousels.push(carousel);
                } else {
                    grid = node('div', 'ue-card-grid'); visible.forEach(entity => grid.append(this.card(entity))); section.append(grid);
                }
                if (!members.length) { section.classList.add('ue-vacant'); grid.append(node('p', 'ue-empty ue-compact', query || selectedTag ? '该分类没有符合筛选的角色。' : rank.id === 'queen' ? '尊位暂空，静候册封。' : rank.id === 'cold' ? '这里还没有角色。' : '尚未册封到此位。')); }
                let shown = visible.length;
                if (members.length > shown) {
                    const more = this.button(`再看 ${Math.min(24, members.length - shown)} 位`, () => { const next = members.slice(shown, shown + 24); next.forEach(e => grid.insertBefore(this.card(e), more.parentElement === grid ? more : null)); shown += next.length; more.textContent = `再看 ${Math.min(24, members.length - shown)} 位`; more.hidden = shown >= members.length; carousel?.observeCards(); }, 'ue-subtle ue-load-more');
                    if (carousel) grid.append(more); else section.append(more);
                }
                groups.append(section);
            }
            if (!all.length) { groups.replaceChildren(node('p', 'ue-empty', '后宫尚空。点击右上角 ＋，迎接第一位角色。')); }
            else if (!filtered.length) groups.replaceChildren(node('p', 'ue-empty', '没有符合当前筛选的角色。'));
            syncNav();
            renderedRank = viewRank; main.scrollTop = viewScrolls.get(viewRank) || 0;
        };
        const syncNav = () => sidebar.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String((b.dataset.rank || 'all') === this.activeRank)));
        search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 140); }); tag.addEventListener('change', draw);
        const shell = { root, draw, dispose: () => { revision++; clearTimeout(timer); carousels.forEach(carousel => carousel.dispose()); rankDrawer?.close(); this.shells.delete(shell); } };
        this.shells.add(shell); draw(); return shell;
    }
    open() {
        const existing = [...this.dialogs].find(d => d.classList.contains('ue-manager'));
        if (existing) { existing.focus(); return; }
        const { dialog, body } = this.dialog('U皇万岁', { wide: true, className: 'ue-manager' });
        const shell = this.shell(); body.append(shell.root); dialog.addEventListener('close', shell.dispose, { once: true });
    }
    async detail(avatar) {
        const all = await this.all(); let entity = all.find(e => e.id === avatar);
        if (!entity) throw new Error('角色已不存在，请刷新。');
        logAction(this.state, avatar, 'view'); this.save();
        const { dialog, body } = this.dialog(entity.name, { wide: true, className: 'ue-detail' });
        const top = node('div', 'ue-detail-summary'); top.append(this.cover(entity));
        const intro = node('div'); const companion = node('p', '', this.companion(entity)); const entered = node('p', 'ue-muted', `入宫于 ${dateLabel(entity.record.enteredAt)}`);
        intro.append(node('span', 'ue-badge', entity.rank.name), companion, entered);
        const historyJob = this.host.history?.(avatar);
        historyJob?.then(async () => { if (!dialog.open) return; const latest = (await this.all()).find(e => e.id === avatar); if (latest && dialog.open) { companion.textContent = this.companion(latest); entered.textContent = `入宫于 ${dateLabel(latest.record.enteredAt)}`; } }).catch(() => {});
        const actions = node('div', 'ue-actions'); actions.append(this.button('▷ 继续上次', () => this.continue(entity), 'ue-primary'), this.button('开启新故事', () => this.fresh(entity)));
        intro.append(actions); top.append(intro); body.append(top);
        const tabs = node('nav', 'ue-tabs'); tabs.setAttribute('aria-label', '角色详情'); const panel = node('div', 'ue-tab-panel');
        body.append(tabs, panel);
        let revision = 0;
        const tab = async name => {
            const id = ++revision; panel.replaceChildren(node('p', 'ue-muted', '正在读取…'));
            tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === name)));
            try {
                const raw = await this.host.fullCharacter(avatar); entity = { ...entity, raw };
                if (!dialog.open || id !== revision) return;
                panel.replaceChildren();
                if (name === '档案') this.profile(panel, entity);
                if (name === '开场') this.greetings(panel, entity);
                if (name === '世界书') await this.books(panel, entity, () => dialog.open && id === revision);
                if (name === '存档') await this.archives(panel, entity, () => dialog.open && id === revision);
            } catch (e) { if (dialog.open && id === revision) { panel.replaceChildren(node('p', 'ue-error', e.message), this.button('重试', () => tab(name))); } }
        };
        for (const name of ['档案', '开场', '世界书', '存档']) tabs.append(this.button(name, () => tab(name)));
        await tab('档案');
    }
    profile(panel, entity) {
        const raw = entity.raw.data || entity.raw;
        const tools = node('div', 'ue-actions');
        tools.append(this.button('册封／入宫登记', () => this.registration(entity.id)), this.button('更新／替换角色卡', () => this.replacement(entity)), this.button('原生编辑', async () => { this.onNativeEntry?.(); await this.host.editCharacter(entity.id); this.closeAll(); }));
        if (entity.record.sourceUrl) tools.append(this.link('查看原帖 ↗', entity.record.sourceUrl));
        panel.append(tools);
        const info = [['人设', raw.description || entity.raw.description], ['性格', raw.personality], ['场景', raw.scenario], ['作者说明', raw.creator_notes || entity.raw.creatorcomment], ['示例对话', raw.mes_example]];
        if (raw.creator || raw.character_version) panel.append(node('p', 'ue-muted', [raw.creator && `作者：${raw.creator}`, raw.character_version && `版本：${raw.character_version}`].filter(Boolean).join(' · ')));
        for (const [label, value] of info) if (typeof value === 'string' && value.trim()) { const section = node('details', 'ue-text-section'); if (label === '人设') section.open = true; section.append(node('summary', '', label), node('pre', 'ue-prose', value)); panel.append(section); }
    }
    link(label, url) { const a = node('a', 'ue-button', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
    greetings(panel, entity) {
        const raw = entity.raw.data || entity.raw;
        const native = [raw.first_mes ?? entity.raw.first_mes, ...(Array.isArray(raw.alternate_greetings) ? raw.alternate_greetings : [])];
        if (!native[0]) native.shift();
        const greetings = native.map((g, index) => ({ g, index })).filter(({ g }) => typeof g === 'string' && g.trim());
        if (!greetings.length) panel.append(node('p', 'ue-empty', '这张角色卡尚未设置开场白。'));
        panel.append(node('p', 'ue-muted', '预览为纯文本，不执行卡内脚本。选择开场会建立一份新存档。'));
        greetings.forEach(({ g, index }, i) => {
            const detail = node('details', 'ue-text-section'); detail.open = i === 0;
            detail.append(node('summary', '', `开场 ${i + 1} · ${excerpt(g, 50)}`), node('pre', 'ue-prose', g), this.button('用此开场开启新故事', () => this.fresh(entity, index), 'ue-primary')); panel.append(detail);
        });
    }
    async books(panel, entity, current) {
        const names = await this.host.worldbooks(entity.id);
        if (!current()) return;
        if (!names.length) panel.append(node('p', 'ue-muted', '尚未关联独立世界书。'));
        for (const name of names) {
            const row = node('div', 'ue-save'); row.append(node('strong', '', name), this.button('查看', async () => {
                const data = await this.host.readWorld(name);
                const { body } = this.dialog(name, { wide: true });
                const entries = Object.values(data.entries || {});
                if (!entries.length) body.append(node('p', 'ue-muted', '世界书暂无条目。'));
                for (const entry of entries) { const d = node('details', 'ue-text-section'); d.append(node('summary', '', entry.comment || (Array.isArray(entry.key) ? entry.key.join('、') : '') || '未命名条目'), node('pre', 'ue-prose', String(entry.content || ''))); body.append(d); }
            }), this.button('原生编辑', async () => { this.closeAll(); await this.host.openWorld(name); })); panel.append(row);
        }
        const embedded = entity.raw.data?.character_book;
        if (embedded) {
            const details = node('details', 'ue-text-section'); details.append(node('summary', '', '卡内嵌入世界书'), node('p', 'ue-muted', '这里显示角色卡内的副本，可能与酒馆中已导入的世界书不同。'));
            for (const entry of Object.values(embedded.entries || {})) { const d = node('details'); d.append(node('summary', '', entry.comment || '条目'), node('pre', 'ue-prose', String(entry.content || ''))); details.append(d); } panel.append(details);
        }
    }
    async archives(panel, entity, current) {
        const status = node('p', 'ue-muted', '正在读取存档列表…'); const list = node('div', 'ue-save-list'); panel.append(status, list);
        const rows = await this.host.listChats(entity.id);
        if (!current()) return;
        const hasArchivePreferences = rows.some(row => Object.hasOwn(this.state.archives, archiveKey(entity.id, row.name)));
        if (rows.length && !hasArchivePreferences) {
            const primary = rows.find(row => row.name === entity.record.lastChat) || rows.find(row => row.name === entity.raw.chat) || rows[0];
            this.state.archives[archiveKey(entity.id, primary.name)] = { alias: '', pinned: true };
            this.save();
        }
        let details = rows;
        const render = () => {
            if (!current()) return;
            list.replaceChildren();
            const sorted = [...details].sort((a, b) => Number(!!this.state.archives[archiveKey(entity.id, b.name)]?.pinned) - Number(!!this.state.archives[archiveKey(entity.id, a.name)]?.pinned) || b.date - a.date);
            if (!rows.length) list.append(node('p', 'ue-empty', '还没有存档，开启第一段故事吧。'));
            for (const row of sorted) {
                const key = archiveKey(entity.id, row.name); const meta = this.state.archives[key] || {};
                const item = node('article', 'ue-save'); const open = this.button('', () => this.continue(entity, row.name), 'ue-save-open');
                open.append(node('strong', '', `${meta.pinned ? '⌖ ' : ''}${meta.alias || row.name}`), node('small', 'ue-muted', `${row.messages === null ? '消息数待读取' : `${row.messages} 条消息`} · ${dateTime(row.date)}`));
                if (row.preview) open.append(node('span', 'ue-save-excerpt', row.preview));
                const actions = node('div', 'ue-save-actions');
                actions.append(this.button(meta.pinned ? '取消置顶' : '置顶', () => { this.state.archives[key] = { ...meta, pinned: !meta.pinned }; this.save(); render(); }), this.button('改名', () => {
                    const { dialog, body } = this.dialog('存档显示名'); const name = input(meta.alias || row.name); name.maxLength = 100;
                    body.append(field('名称', name, '只修改这里的显示名，原生文件名保留。'), this.button('保存', () => { this.state.archives[key] = { ...meta, alias: name.value.trim() }; this.save(); dialog.close(); render(); }, 'ue-primary'));
                }), this.button('预览', async () => {
                    const messages = await this.host.readChat(entity.id, row.name); const { body } = this.dialog(meta.alias || row.name, { wide: true });
                    body.append(node('p', 'ue-muted', '只读取现有消息，不调用模型；显示最近 80 条纯文本。'));
                    messages.filter(m => typeof m.mes === 'string').slice(-80).forEach(m => { const section = node('section', 'ue-message'); section.append(node('strong', '', m.name || (m.is_user ? '你' : entity.name)), node('pre', 'ue-prose', m.mes)); body.append(section); });
                }), this.button('删除', () => this.confirmDelete(entity, row, async () => { const i = rows.findIndex(r => r.name === row.name); if (i >= 0) rows.splice(i, 1); details = details.filter(r => r.name !== row.name); render(); }), 'ue-danger'));
                item.append(open, actions); list.append(item);
            }
        };
        render(); status.textContent = rows.length ? '正在读取原生消息数与时间…' : '';
        if (rows.length) {
            try { const loaded = await this.host.chatDetails(entity.id); const map = new Map(loaded.map(r => [r.name, r])); details = rows.map(r => map.get(r.name) || r); if (current()) { status.textContent = `${rows.length} 份存档 · 消息数来自酒馆`; render(); } }
            catch { if (current()) status.textContent = '暂未读到消息数和时间，仍可打开存档；重新切换此标签可重试。'; }
        }
    }
    confirmDelete(entity, row, after) {
        const { dialog, body } = this.dialog('删除这份存档？');
        body.append(node('p', '', row.name), node('p', 'ue-muted', '这会调用酒馆原生删除，无法在此撤销。角色和其他存档会保留。'));
        body.append(this.button('确认删除', async () => { await this.host.deleteChat(entity.id, row.name); delete this.state.archives[archiveKey(entity.id, row.name)]; this.save(); dialog.close(); await after(); this.notify('该存档已删除。'); }, 'ue-danger'), this.button('取消', () => dialog.close()));
    }
    async registration(avatar) {
        const entity = (await this.all()).find(e => e.id === avatar); if (!entity) throw new Error('角色已不存在。');
        const record = entity.record; const { dialog, body } = this.dialog('入宫登记');
        const rank = select(this.state.ranks.map(r => [r.id, r.name]), record.rankId);
        const source = input(record.sourceUrl, 'url'); source.placeholder = 'https://discord.com/channels/…';
        const demotion = select(this.state.ranks.filter(r => r.id !== 'queen').map(r => [r.id, r.name]), 'noble');
        const incumbent = Object.entries(this.state.records).find(([id, r]) => id !== avatar && r.rankId === 'queen');
        const queenName = this.state.ranks.find(r => r.id === 'queen').name;
        const demotionField = field(`原${queenName}的新封位`, demotion, `册封时同时完成交接，${queenName}始终最多一位。`);
        const sync = () => { demotionField.hidden = rank.value !== 'queen' || !incumbent; }; rank.addEventListener('change', sync); sync();
        const tags = input(entity.tags.join('、')); tags.readOnly = true;
        body.append(node('p', '', entity.name), field('妃位', rank), demotionField, field('Discord 原帖（可不填）', source), field('现有标签', tags, '标签沿用酒馆原生设置，可从档案的「原生编辑」管理。'));
        body.append(this.button('完成登记', async () => { const url = discordUrl(source.value); assignRank(this.state, avatar, rank.value, demotion.value); record.sourceUrl = url; this.save(); dialog.close(); await this.redraw(); this.notify('入宫登记已保存。'); }, 'ue-primary'), this.button('稍后再说', () => dialog.close()));
    }
    importDialog() {
        const { dialog, body } = this.dialog('迎接新角色');
        body.append(node('p', 'ue-muted', '导入后可填写原帖、选择封位；跳过登记则默认为未册封。'));
        const mode = select([['file', '本地文件'], ['url', 'URL 导入']], 'file');
        const file = input('', 'file'); file.accept = '.png,.json,.charx,.yaml,.yml,.byaf'; file.multiple = true;
        const url = input('', 'url'); url.placeholder = '下载直链或酒馆支持的角色站网址';
        const fileField = field('角色卡文件', file); const urlField = field('下载网址', url, '与酒馆原生 URL 导入使用相同下载接口。Discord 原帖请在登记时填写。');
        const sync = () => { fileField.hidden = mode.value !== 'file'; urlField.hidden = mode.value !== 'url'; }; mode.addEventListener('change', sync); sync();
        const status = node('p', 'ue-muted'); status.setAttribute('role', 'status');
        const completedFiles = new Map();
        body.append(field('导入方式', mode), fileField, urlField, status, this.button('导入并登记', async () => {
            const imported = [];
            try {
                if (mode.value === 'url') imported.push(await this.host.importUrl(url.value));
                else {
                    if (!file.files.length) throw new Error('请先选择角色卡。');
                    for (const item of file.files) { if (completedFiles.has(item)) continue; status.textContent = `正在导入：${item.name}`; const avatar = await this.host.importFile(item); completedFiles.set(item, avatar); imported.push(avatar); }
                }
            } catch (e) { status.textContent = `已导入 ${imported.length} 张。${e.message}`; throw e; }
            finally { for (const avatar of imported) recordFor(this.state, avatar, Date.now()); this.save(); if (imported.length) await this.redraw(); }
            dialog.close();
            if (imported.length === 1) await this.registration(imported[0]);
            else this.notify(`已导入 ${imported.length} 张角色卡，默认为未册封，可逐张登记。`);
        }, 'ue-primary'), this.button('原生创建角色', async () => { this.onNativeEntry?.(); await this.host.createCharacter(); this.closeAll(); }));
    }
    replacement(entity) {
        const { dialog, body } = this.dialog('更新／替换角色卡');
        body.append(node('p', '', entity.name), node('p', 'ue-muted', '保留角色标识、封位、原帖和现有聊天；覆盖角色资料中的本地修改。'));
        const mode = select([['file', '本地文件'], ['url', '下载网址']], 'file'); const file = input('', 'file'); file.accept = '.png,.json,.charx,.yaml,.yml,.byaf';
        const url = input('', 'url'); url.placeholder = '角色卡下载直链或酒馆支持的角色站网址';
        const jump = this.button('打开网址 ↗', () => { window.open(downloadUrl(url.value), '_blank', 'noopener,noreferrer'); });
        const fileField = field('新角色卡', file); const urlField = field('下载网址', url, 'Discord 原帖仅用于跳转，不能作为下载地址。'); urlField.append(jump);
        const sync = () => { fileField.hidden = mode.value !== 'file'; urlField.hidden = mode.value !== 'url'; }; mode.addEventListener('change', sync); sync();
        body.append(field('更新方式', mode), fileField, urlField, this.button('确认替换', async () => {
            if (mode.value === 'file') { if (!file.files[0]) throw new Error('请先选择文件。'); await this.host.importFile(file.files[0], entity.id); }
            else await this.host.importUrl(url.value, entity.id);
            this.save(); dialog.close(); await this.redraw(); this.notify('角色卡已替换，重新打开档案可查看新资料。');
        }, 'ue-primary'));
    }
    async drawDialog() {
        const { dialog, body } = this.dialog('今夜翻谁', { wide: true, className: 'ue-draw-dialog' });
        const controls = node('div', 'ue-draw-controls');
        const mode = select(MODES.map(([id, label]) => [id, label]), this.state.mode);
        const presentation = select([['blind', '盲翻'], ['named', '点名']], this.state.presentation);
        const tag = select([['', '全部标签']], ''); const description = node('p', 'ue-muted');
        controls.append(field('翻牌规则', mode), field('翻牌方式', presentation), field('候选标签', tag));
        const rank = select([['', '全部非冷宫妃位'], ...this.state.ranks.filter(r => r.id !== 'cold').map(r => [r.id, r.name])], this.state.drawRank); controls.append(field('候选妃位', rank));
        const settings = this.button('⚙', () => {
            const opened = this.dialog('翻牌设置', { className: 'ue-draw-settings' });
            opened.body.append(controls, description, this.button('返回托盘', () => opened.dialog.close(), 'ue-primary'), this.button('重新摆牌', async () => { await deal(); opened.dialog.close(); }));
        }, 'ue-icon', '翻牌设置'); dialog.querySelector('.ue-dialog-head').insertBefore(settings, dialog.querySelector('.ue-dialog-head .ue-icon'));
        const stage = node('div', 'ue-plaque-stage'); stage.setAttribute('aria-label', '胡桃木翻牌托盘');
        const tray = node('img', 'ue-tray-image'); tray.src = trayImage; tray.alt = '深胡桃木托盘'; tray.draggable = false; tray.loading = 'eager';
        const rim = node('img', 'ue-tray-front-rim'); rim.src = trayImage; rim.alt = ''; rim.draggable = false; rim.setAttribute('aria-hidden', 'true');
        const plaques = node('div', 'ue-plaques'); stage.append(tray, plaques, rim); const result = node('div', 'ue-draw-result');
        const status = node('p', 'ue-draw-status'); status.setAttribute('role', 'status'); status.hidden = true;
        tray.addEventListener('error', () => { stage.dataset.assetError = 'true'; status.textContent = '托盘素材未能加载，请重新打开新版预览或刷新页面。'; status.hidden = false; });
        tray.addEventListener('load', () => { delete stage.dataset.assetError; });
        const next = this.button('重新摆牌', () => deal(), 'ue-draw-again'); next.hidden = true;
        body.append(status, stage, result, next); result.hidden = true;
        let all = [], pool = [], revision = 0;
        let savedTag = this.state.drawTag;
        const filtered = () => all.filter(e => e.rank.id !== 'cold' && (!tag.value || e.tags.includes(tag.value)) && (!rank.value || e.rank.id === rank.value) && drawWeight(e, mode.value) > 0);
        const deal = async () => {
            const id = ++revision; result.replaceChildren(); result.hidden = true; next.hidden = true; status.hidden = true; plaques.replaceChildren();
            description.textContent = '正在准备牌签…';
            try {
                all = await this.all({ statsRequired: mode.value === 'rekindle' });
                if (!dialog.open || id !== revision) return;
                const currentTag = savedTag || tag.value; savedTag = '';
                tag.replaceChildren(...[['', '全部标签'], ...[...new Set(all.flatMap(e => e.tags))].sort().map(t => [t, t])].map(([v, t]) => { const o = node('option', '', t); o.value = v; return o; })); tag.value = currentTag;
                if (tag.selectedIndex < 0) tag.value = '';
                pool = filtered();
                description.textContent = `${MODES.find(([id]) => id === mode.value)[2]} 当前 ${pool.length} 位候选，始终排除冷宫。`;
                this.state.mode = mode.value; this.state.presentation = presentation.value; this.state.drawTag = tag.value; this.state.drawRank = rank.value; this.save();
                if (!pool.length) { status.textContent = mode.value === 'rekindle' ? '当前范围没有确认玩过的角色，请打开翻牌设置更换规则或筛选。' : '当前范围没有可翻的角色，请打开翻牌设置调整筛选。'; status.hidden = false; stage.hidden = true; return; }
                stage.hidden = false; next.textContent = '重新摆牌';
                if (presentation.value === 'blind') {
                    for (let i = 0; i < 5; i++) plaques.append(this.plaque(null, `翻开第 ${i + 1} 枚牌`, button => reveal(weightedPick(pool, mode.value), button)));
                } else {
                    const remaining = [...pool]; const dealt = [];
                    while (remaining.length && dealt.length < 5) { const e = weightedPick(remaining, mode.value); if (!e) break; dealt.push(e); remaining.splice(remaining.findIndex(x => x.id === e.id), 1); }
                    dealt.forEach(e => plaques.append(this.plaque(e, `点名 ${e.name}`, button => reveal(e, button))));
                    for (let i = dealt.length; i < 5; i++) { const empty = this.plaque(null, '当前没有更多点名候选', () => {}); empty.disabled = true; empty.dataset.empty = 'true'; plaques.append(empty); }
                    description.append(node('span', '', ' 点名时按此规则摆出候选，由你亲自选择。'));
                }
            } catch (e) { if (dialog.open && id === revision) { description.textContent = e.message; status.textContent = e.message; status.hidden = false; stage.hidden = true; next.hidden = false; next.textContent = '重新准备'; } }
        };
        const reveal = async (entity, button) => {
            if (!entity || button.dataset.revealed === 'true') return;
            const id = revision;
            plaques.querySelectorAll('button').forEach(b => { b.disabled = true; });
            button.dataset.revealed = 'true';
            const portrait = this.cover(entity, 'ue-plaque-portrait'); portrait.loading = 'eager';
            const frame = node('img', 'ue-plaque-frame'); frame.src = portraitFrame; frame.alt = '';
            const back = button.querySelector('.ue-plaque-back'); back.append(portrait, frame);
            // Prepare the real reverse before rotating, so the back never flashes an empty image.
            if (portrait.decode) await portrait.decode().catch(() => {});
            if (!dialog.open || id !== revision || !button.isConnected) return;
            button.setAttribute('aria-label', `翻到了 ${entity.name}`);
            logAction(this.state, entity.id, 'flip'); this.save();
            const inner = button.querySelector('.ue-plaque-inner');
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
            await new Promise(resolve => requestAnimationFrame(resolve));
            inner.classList.add('ue-is-flipped');
            if (!reduced) await new Promise(resolve => {
                let timer;
                const finish = () => { clearTimeout(timer); inner.removeEventListener('transitionend', finish); resolve(); };
                inner.addEventListener('transitionend', finish); timer = setTimeout(finish, 750);
            });
            if (!dialog.open || id !== revision) return;
            result.hidden = false; next.hidden = false;
            result.replaceChildren(node('span', 'ue-badge', entity.rank.name), node('h3', '', entity.name), node('p', 'ue-muted', this.companion(entity)));
            const actions = node('div', 'ue-actions'); actions.append(this.button('▷ 继续上次', () => this.continue(entity), 'ue-primary'), this.button('选择存档', async () => { await this.detail(entity.id); const d = [...this.dialogs].at(-1); [...d.querySelectorAll('.ue-tabs button')].find(b => b.textContent === '存档')?.click(); }), this.button('开启新故事', () => this.fresh(entity)), this.button('查看档案', () => this.detail(entity.id))); result.append(actions);
        };
        for (const control of [mode, presentation, tag, rank]) control.addEventListener('change', deal);
        dialog.addEventListener('close', () => { revision++; }, { once: true }); await deal();
    }
    plaque(entity, label, action) {
        let button;
        button = this.button('', () => action(button), 'ue-plaque', label);
        const inner = node('span', 'ue-plaque-inner');
        const front = node('span', 'ue-plaque-front'); const back = node('span', 'ue-plaque-back'); const edge = node('span', 'ue-plaque-edge'); edge.setAttribute('aria-hidden', 'true');
        const image = node('img', 'ue-plaque-face'); image.src = nameFace; image.alt = ''; front.append(image);
        if (entity) front.append(node('span', 'ue-plaque-name', entity.name));
        inner.append(front, back, edge); button.append(inner);
        return button;
    }
    settings() {
        const { dialog, body } = this.dialog('设置与备份', { wide: true });
        const home = input('', 'checkbox'); home.checked = this.state.homepage;
        home.addEventListener('change', () => { this.state.homepage = home.checked; this.save(); this.onHomePreference?.(); });
        const replace = input('', 'checkbox'); replace.checked = this.state.replaceCharacters;
        replace.addEventListener('change', () => { this.state.replaceCharacters = replace.checked; this.save(); this.onPanelPreference?.(); });
        body.append(field('在酒馆原生首页展示管理器', home), field('替代右上角原生角色面板', replace, '原生编辑和创建仍可使用；关闭此项立即恢复原生角色界面。'), node('h3', '', '妃位管理'), node('p', 'ue-muted', '最高封位最多一位；冷宫始终不参与随机。名字可修改，规则随分类保留。'));
        const preset = select([['history', '历史'], ['empress', '女帝']], this.state.rankPreset);
        preset.addEventListener('change', () => {
            try { applyRankPreset(this.state, preset.value); this.save(); drawRanks(); this.redraw(); }
            catch (error) { preset.value = this.state.rankPreset; this.notify(error.message, true); }
        });
        body.append(field('默认分类类型', preset, '历史：皇后、皇贵妃…；女帝：帝后、皇贵君、贵君、文君、侧君、贵卿、侍君。切换保留册封、权重及手动改名。'));
        const ranks = node('div', 'ue-rank-editor'); body.append(ranks);
        const drawRanks = () => {
            ranks.replaceChildren();
            this.state.ranks.forEach((r, i) => {
                const row = node('div', 'ue-rank-edit-row'); const name = input(r.name); name.maxLength = 30; name.setAttribute('aria-label', `${r.name}的名称`);
                const weight = input(r.weight, 'number'); weight.min = '0.1'; weight.max = '100'; weight.step = '0.1'; weight.disabled = r.id === 'cold'; weight.setAttribute('aria-label', `${r.name}的抽取权重`);
                row.append(name, weight, this.button('保存', () => { if (!name.value.trim()) throw new Error('妃位名不能为空。'); if (r.id !== 'cold' && (!Number.isFinite(+weight.value) || +weight.value < 0.1 || +weight.value > 100)) throw new Error('权重需在 0.1–100 之间。'); r.name = name.value.trim(); r.weight = r.id === 'cold' ? 0 : +weight.value; this.save(); this.redraw(); this.notify('妃位已保存。'); }), this.button('↑', () => {
                    if (i <= 1 || r.id === 'cold') return;
                    [this.state.ranks[i - 1], this.state.ranks[i]] = [this.state.ranks[i], this.state.ranks[i - 1]]; this.save(); drawRanks(); this.redraw();
                }, 'ue-icon', `上移${r.name}`));
                if (!['queen', 'cold', 'unranked'].includes(r.id)) row.append(this.button('删除', () => {
                    const confirm = this.dialog('删除这个妃位？'); confirm.body.append(node('p', '', `原属「${r.name}」的角色将移到未册封，角色和聊天保留。`), this.button('确认删除', () => { removeRank(this.state, r.id); this.save(); confirm.dialog.close(); drawRanks(); this.redraw(); }, 'ue-danger'));
                }, 'ue-danger'));
                ranks.append(row);
            });
        }; drawRanks();
        body.append(this.button('＋ 新增妃位', () => { if (this.state.ranks.length >= 40) throw new Error('最多保留 40 个妃位。'); this.state.ranks.splice(-1, 0, { id: createId('rank'), name: '新封位', weight: 1 }); this.save(); drawRanks(); this.redraw(); }), node('h3', '', '备份与恢复'), node('p', 'ue-muted', '管理备份只包含封位、登记、原帖、记录和存档别名／置顶。角色库快照另含角色 PNG、聊天 JSONL 和关联世界书，不包含账号设置或群聊。'));
        const actions = node('div', 'ue-actions');
        actions.append(this.button('导出管理备份', () => saveFile(`U皇万岁-管理备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(this.state), null, 2))), this.button('导出角色库快照 ZIP', () => this.backupDialog()));
        const restore = input('', 'file'); restore.accept = '.json';
        actions.append(this.button('恢复管理备份', () => restore.click()));
        restore.addEventListener('change', async () => {
            try {
                const file = restore.files[0]; if (!file) return;
                if (file.size > 10 * 1024 * 1024) throw new Error('管理备份超过 10 MB，无法读取。');
                const restored = readBackup(JSON.parse(await file.text()));
                const confirm = this.dialog('确认恢复管理数据');
                confirm.body.append(node('p', '', `备份含 ${restored.ranks.length} 个妃位、${Object.keys(restored.records).length} 条角色记录。将替换现有管理设置，不写入角色或聊天。`), this.button('下载当前备份并恢复', () => { saveFile('U皇万岁-恢复前管理备份.json', JSON.stringify(makeBackup(this.state), null, 2)); this.setState(restored); confirm.dialog.close(); dialog.close(); this.onHomePreference?.(); this.onPanelPreference?.(); this.notify('管理数据已恢复。'); }, 'ue-primary'));
            } catch (e) { this.notify(e.message, true); }
            restore.value = '';
        });
        body.append(actions, restore); restore.hidden = true;
        body.append(node('h3', '', '翻牌说明'), node('p', 'ue-muted', '情有独钟按单卡妃位权重；喜新厌旧取其倒数。旧情复燃采用「log₂(1＋历史用户消息数)² × (1＋ln(1＋未玩天数))」，历史投入为主。全程不调用模型。'), node('p', 'ue-muted ue-small', `版本 ${VERSION} · 原生扩展 · 目标最低酒馆 1.15.0`));
    }
    backupDialog() {
        const { dialog, body } = this.dialog('导出角色库快照'); const controller = new AbortController();
        body.append(node('p', 'ue-muted', '将读取全部角色、聊天及关联世界书。大库可能需要较长时间；超过 256 MB 时会停止，建议改用酒馆原生数据备份。'));
        const status = node('p', 'ue-muted'); status.setAttribute('role', 'status'); body.append(status);
        body.append(this.button('开始导出', async () => {
            const data = await fullBackup(this.host, structuredClone(this.state), message => { status.textContent = message; }, controller.signal);
            if (controller.signal.aborted) return;
            saveFile(`U皇万岁-角色库快照-${new Date().toISOString().slice(0, 10)}.zip`, data, 'application/zip'); status.textContent = '快照已生成并交给浏览器下载。';
        }, 'ue-primary'));
        dialog.addEventListener('close', () => controller.abort(), { once: true });
    }
    dispose() {
        this.controller.abort(); clearTimeout(this.historyTimer); this.closeAll(); for (const shell of [...this.shells]) { shell.dispose(); shell.root.remove(); } clearTimeout(this.toastTimer); this.toast?.remove(); this.toast = null;
    }
}
