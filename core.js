import { newChronicle, cleanChronicle, promotion } from './chronicles.js';
export const VERSION = '0.7.3';
export const KEY = 'u_emperor';
export const DAY = 86400000;
export const MODES = Object.freeze([
    ['random', '完全随机', '所有非冷宫角色，每张牌机会相同。'],
    ['devoted', '情有独钟', '仅按封位权重抽取，高位更容易被翻到。'],
    ['fickle', '喜新厌旧', '封位权重取倒数，低位更容易被翻到。'],
    ['rekindle', '旧情复燃', '历史聊天投入为主，久未游玩时间为辅。仅抽玩过的角色。'],
]);
const safeKey = key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key);
export const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, number(v, lo)));
export const text = v => typeof v === 'string' ? v : '';
export const stem = v => text(v).replace(/\.jsonl$/i, '');
export const archiveKey = (avatar, filename) => JSON.stringify([avatar, stem(filename)]);
export function timestamp(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
    if (!v) return 0;
    if (/^\d{13}$/.test(String(v))) return Number(v);
    // Native historical exports also contain spaced humanized dates and 12h dates.
    const human = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*[@ ]\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?$/);
    if (human) return Date.UTC(+human[1], +human[2] - 1, +human[3], +human[4], +human[5], +human[6], +(human[7] || '0').padStart(3, '0'));
    const meridiem = String(v).replace(/(\d)(am|pm)$/i, '$1 $2');
    const direct = Date.parse(meridiem);
    if (Number.isFinite(direct)) return direct;
    const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[@ T](\d{2})[h:](\d{2})(?:[m:](\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : 0;
}
export const RANK_PRESETS = Object.freeze({
    history: { queen: '皇后', noble: '贵妃', consort: '妃', concubine: '嫔', lady: '贵人' },
    empress: { queen: '帝后', noble: '贵君', consort: '文君', concubine: '侧君', lady: '侍君' },
});
export function applyRankPreset(state, type) {
    if (!Object.hasOwn(RANK_PRESETS, type)) throw new Error('未知的默认分类类型。');
    for (const rank of state.ranks) {
        if (Object.values(RANK_PRESETS).some(preset => preset[rank.id] === rank.name)) rank.name = RANK_PRESETS[type][rank.id];
    }
    state.rankPreset = type;
}
export function defaults() {
    return {
        schema: 1, rankDefaultsVersion: 2, enabled: true, homepage: false, replaceCharacters: true, rankPreset: 'history',
        ranks: [
            { id: 'queen', name: '皇后', weight: 8 },
            { id: 'noble', name: '贵妃', weight: 5 },
            { id: 'consort', name: '妃', weight: 3 },
            { id: 'concubine', name: '嫔', weight: 2 },
            { id: 'lady', name: '贵人', weight: 1 },
            { id: 'unranked', name: '未册封', weight: 0.5 },
            { id: 'cold', name: '冷宫', weight: 0 },
        ], records: {}, archives: {}, chronicle: newChronicle(), mode: 'random', presentation: 'blind', drawTag: '', drawRank: '',
    };
}
export function discordUrl(value) {
    if (!text(value).trim()) return '';
    let url;
    try { url = new URL(value.trim()); } catch { throw new Error('请填写完整的 Discord 原帖链接。'); }
    if (url.protocol !== 'https:' || !['discord.com', 'www.discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com'].includes(url.hostname) || !/^\/channels\/\d+\/\d+(?:\/\d+)?\/?$/.test(url.pathname) || url.username || url.password) {
        throw new Error('原帖需为 https://discord.com/channels/… 格式的频道、帖子或消息链接。');
    }
    return url.href;
}
export function downloadUrl(value) {
    let url;
    try { url = new URL(text(value).trim()); } catch { throw new Error('请填写完整的下载网址。'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('下载网址只支持 HTTP 或 HTTPS。');
    if (['discord.com', 'www.discord.com', 'discordapp.com'].includes(url.hostname) && url.pathname.startsWith('/channels/')) throw new Error('Discord 原帖不能直接更新。请下载附件后选择本地文件，或提供有效的附件下载直链。');
    return url.href;
}
function cleanRecord(input = {}) {
    const record = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    let sourceUrl = '';
    try { sourceUrl = discordUrl(record.sourceUrl); } catch { /* Keep invalid imported URLs inert. */ }
    return {
        rankId: text(record.rankId) || 'unranked', sourceUrl,
        enteredAt: Math.max(0, number(record.enteredAt)),
        enteredExact: record.enteredExact === true,
        firstPlayedAt: Math.max(0, number(record.firstPlayedAt)),
        lastPlayedAt: Math.max(0, number(record.lastPlayedAt)),
        lastChat: stem(record.lastChat),
        flippedAt: Math.max(0, number(record.flippedAt)), flipCount: Math.max(0, Math.floor(number(record.flipCount))),
        viewedAt: Math.max(0, number(record.viewedAt)), viewCount: Math.max(0, Math.floor(number(record.viewCount))),
        openedAt: Math.max(0, number(record.openedAt)), openCount: Math.max(0, Math.floor(number(record.openCount))),
    };
}
export function normalize(input, { strict = false } = {}) {
    const base = defaults();
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        if (strict) throw new Error('备份格式不正确。');
        return base;
    }
    if (input.schema !== undefined && input.schema !== 1) throw new Error('此备份的数据版本暂不支持，请先更新插件。');
    base.chronicle = input.chronicle ? cleanChronicle(input.chronicle) : base.chronicle;
    if (strict && (!Array.isArray(input.ranks) || !input.records || typeof input.records !== 'object' || Array.isArray(input.records))) throw new Error('备份缺少封位或角色记录。');
    const ids = new Set();
    const ranks = (Array.isArray(input.ranks) ? input.ranks : base.ranks).filter(r => r && safeKey(r.id) && r.id.length < 100 && text(r.name).trim() && !ids.has(r.id) && ids.add(r.id)).slice(0, 40).map(r => ({ id: r.id, name: r.name.trim().slice(0, 30), weight: r.id === 'cold' ? 0 : clamp(r.weight ?? 1, 0.1, 100) }));
    for (const id of ['queen', 'unranked', 'cold']) if (!ranks.some(r => r.id === id)) ranks.push(base.ranks.find(r => r.id === id));
    // Collapse retired stock ranks only once; custom-named ranks remain user-owned.
    const retired = new Map();
    if (input.rankDefaultsVersion !== 2) {
        for (const [id, names, target] of [['imperial', ['皇贵妃', '皇贵君'], 'noble'], ['attendant', ['常在', '侍君'], 'lady']]) {
            const index = ranks.findIndex(r => r.id === id && names.includes(r.name));
            if (index < 0) continue;
            retired.set(id, ranks.some(r => r.id === target) ? target : 'unranked'); ranks.splice(index, 1);
        }
        const lady = ranks.find(r => r.id === 'lady' && r.name === '贵卿'); if (lady) lady.name = '侍君';
        const noble = ranks.find(r => r.id === 'noble' && ['贵妃', '贵君'].includes(r.name) && r.weight === 4); if (noble) noble.weight = 5;
    }
    const valid = new Set(ranks.map(r => r.id));
    base.ranks = [ranks.find(r => r.id === 'queen'), ...ranks.filter(r => !['queen', 'unranked', 'cold'].includes(r.id)), ranks.find(r => r.id === 'unranked'), ranks.find(r => r.id === 'cold')];
    let queen = false;
    for (const [key, value] of Object.entries(input.records || {})) {
        if (!safeKey(key) || key.length > 500) continue;
        const record = cleanRecord(value);
        if (retired.has(record.rankId)) record.rankId = retired.get(record.rankId);
        if (!valid.has(record.rankId)) record.rankId = 'unranked';
        if (record.rankId === 'queen') {
            if (queen && strict) throw new Error('备份中存在多位皇后，未导入。');
            if (queen) record.rankId = 'unranked';
            queen = true;
        }
        base.records[key] = record;
    }
    for (const [key, value] of Object.entries(input.archives || {})) {
        if (safeKey(key) && key.length < 1500 && value && typeof value === 'object') base.archives[key] = { alias: text(value.alias).slice(0, 100), pinned: value.pinned === true };
    }
    base.enabled = input.enabled !== false;
    base.homepage = input.homepage === true;
    base.replaceCharacters = input.replaceCharacters !== false;
    base.rankPreset = input.rankPreset === 'empress' ? 'empress' : 'history';
    base.mode = MODES.some(([id]) => id === input.mode) ? input.mode : 'random';
    base.presentation = input.presentation === 'named' ? 'named' : 'blind';
    base.drawTag = text(input.drawTag).slice(0, 100);
    const drawRank = retired.get(input.drawRank) || input.drawRank;
    base.drawRank = valid.has(drawRank) && drawRank !== 'cold' ? drawRank : '';
    return base;
}
export function recordFor(state, avatar, added = 0) {
    if (!safeKey(avatar)) throw new Error('角色标识无效。');
    if (!Object.hasOwn(state.records, avatar)) state.records[avatar] = cleanRecord({ enteredAt: timestamp(added) });
    return state.records[avatar];
}
export function assignRank(state, avatar, target, demotion = 'unranked') {
    if (!state.ranks.some(r => r.id === target)) throw new Error('这个封位已不存在。');
    const incumbent = Object.entries(state.records).find(([id, r]) => id !== avatar && r.rankId === 'queen');
    if (target === 'queen' && incumbent) {
        if (demotion === 'queen' || !state.ranks.some(r => r.id === demotion)) throw new Error('请选择原皇后的新封位。');
        incumbent[1].rankId = demotion;
    }
    const record = recordFor(state, avatar); promotion(state, avatar, record.rankId, target); record.rankId = target;
}
export function removeRank(state, id) {
    if (['queen', 'unranked', 'cold'].includes(id)) throw new Error('皇后、未册封和冷宫可以改名，但不能删除。');
    state.ranks = state.ranks.filter(r => r.id !== id);
    for (const r of Object.values(state.records)) if (r.rankId === id) r.rankId = 'unranked';
}
export function renameIdentity(state, oldAvatar, newAvatar) {
    if (!safeKey(oldAvatar) || !safeKey(newAvatar) || oldAvatar === newAvatar) return;
    if (Object.hasOwn(state.records, oldAvatar)) {
        state.records[newAvatar] = state.records[oldAvatar]; delete state.records[oldAvatar];
    }
    const book = state.chronicle;
    if (book) {
        if (Object.hasOwn(book.arrivals, oldAvatar)) { book.arrivals[newAvatar] = book.arrivals[oldAvatar]; delete book.arrivals[oldAvatar]; }
        for (const day of Object.values(book.days)) if (Object.hasOwn(day, oldAvatar)) { day[newAvatar] = day[oldAvatar]; delete day[oldAvatar]; }
        for (const row of [...book.promotions, ...book.returns, ...Object.values(book.seen)]) if (row.id === oldAvatar) row.id = newAvatar;
    }
    for (const [key, value] of Object.entries(state.archives)) {
        try {
            const [avatar, name] = JSON.parse(key);
            if (avatar === oldAvatar) { state.archives[archiveKey(newAvatar, name)] = value; delete state.archives[key]; }
        } catch { /* Ignore keys from malformed older data. */ }
    }
}
export function logAction(state, avatar, kind, at = Date.now(), chat = '') {
    const r = recordFor(state, avatar);
    if (kind === 'flip') { r.flippedAt = at; r.flipCount++; }
    if (kind === 'view') { r.viewedAt = at; r.viewCount++; }
    if (kind === 'open') { r.openedAt = at; r.openCount++; if (chat) r.lastChat = stem(chat); }
    if (kind === 'play') {
        r.firstPlayedAt = r.firstPlayedAt ? Math.min(r.firstPlayedAt, at) : at;
        r.lastPlayedAt = at;
        if (chat) r.lastChat = stem(chat);
    }
}
export function entities(ctx, state, stats = {}) {
    const tagNames = new Map((ctx.tags || []).map(t => [String(t.id), text(t.name)]));
    return (ctx.characters || []).filter(c => c && safeKey(c.avatar) && c.avatar !== 'none').map(c => {
        const r = recordFor(state, c.avatar, c.date_added);
        const stat = stats[c.avatar] || {};
        const firstCandidates = [number(stat.user_msg_count) > 0 ? timestamp(stat.date_first_chat) : 0, r.firstPlayedAt].filter(t => t > 0 && t <= Date.now());
        const firstPlayed = firstCandidates.length ? Math.min(...firstCandidates) : 0;
        // Never lock a mistaken "discovered today" value over an older native entry.
        // Chat time describes companionship, not character import time.
        const entryCandidates = [r.enteredAt, timestamp(c.date_added)].filter(t => t > 0 && t <= Date.now());
        if (entryCandidates.length) r.enteredAt = Math.min(...entryCandidates);
        if (r.enteredAt > 0) {
            state.chronicle.arrivals[c.avatar] = r.enteredAt;
            state.chronicle.startedAt = Math.min(state.chronicle.startedAt, r.enteredAt);
            for (const event of state.chronicle.promotions) if (event.id === c.avatar && event.at >= r.enteredAt) event.elapsed = event.at - r.enteredAt;
        }
        const tags = [...new Set([...(ctx.tagMap?.[c.avatar] || []).map(id => tagNames.get(String(id))), ...(Array.isArray(c.data?.tags || c.tags) ? (c.data?.tags || c.tags) : [])].filter(t => typeof t === 'string' && t.trim()))];
        return {
            id: c.avatar, name: text(c.name || c.data?.name) || stem(c.avatar), raw: c, tags, record: r,
            rank: state.ranks.find(rank => rank.id === r.rankId) || state.ranks.find(rank => rank.id === 'unranked'),
            // Native user-message history avoids scoring alternate swipes as additional investment.
            investment: Math.max(0, number(stat.user_msg_count)),
            played: number(stat.user_msg_count) > 0 || !!r.firstPlayedAt || !!r.lastPlayedAt,
            firstPlayed,
            lastPlayed: Math.max(r.lastPlayedAt, timestamp(stat.date_last_chat)),
        };
    });
}
/** Read only actual message dates, never infer first play from latest/file mtime. */
export function interactionDates(chat, now = Date.now()) {
    let first = 0, last = 0, played = false, messageIndex = 0;
    for (const row of chat) {
        if (!row || typeof row.mes !== 'string' || row.is_system) continue;
        const genuine = row.is_user === true || messageIndex > 0;
        messageIndex++;
        if (!genuine) continue; // An automatically inserted opening is not play.
        played = true;
        const at = timestamp(row.send_date) || timestamp(row.gen_started);
        if (at <= 0 || at > now) continue;
        first = first ? Math.min(first, at) : at; last = Math.max(last, at);
    }
    return { first, last, played };
}
export function drawWeight(entity, mode, now = Date.now()) {
    if (entity.rank.id === 'cold') return 0;
    if (mode === 'random') return 1;
    if (mode === 'devoted') return entity.rank.weight;
    if (mode === 'fickle') return 1 / Math.max(0.1, entity.rank.weight);
    if (mode === 'rekindle') {
        if (!entity.lastPlayed || (!entity.investment && !entity.record.lastPlayedAt)) return 0;
        const messages = Math.max(1, entity.investment);
        const absentDays = Math.min(3650, Math.max(0, (now - entity.lastPlayed) / DAY));
        return Math.log2(1 + messages) ** 2 * (1 + Math.log1p(absentDays));
    }
    throw new Error('未知的翻牌规则。');
}
export function weightedPick(candidates, mode, random = Math.random, now = Date.now()) {
    const pool = candidates.map(entity => ({ entity, weight: drawWeight(entity, mode, now) })).filter(x => Number.isFinite(x.weight) && x.weight > 0);
    const total = pool.reduce((sum, x) => sum + x.weight, 0);
    if (!total) return null;
    let cursor = clamp(random(), 0, 1 - Number.EPSILON) * total;
    for (const { entity, weight } of pool) { cursor -= weight; if (cursor < 0) return entity; }
    return pool.at(-1).entity;
}
export function excerpt(value, limit = 140) {
    return text(value).slice(0, 150000).replace(/<(script|style|think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
export function chatRows(data) {
    if (!data || typeof data !== 'object' || data.error) throw new Error('未能读取存档，请刷新重试。');
    return (Array.isArray(data) ? data : Object.values(data)).filter(row => row && typeof row.file_name === 'string').map(row => ({
        name: stem(row.file_name), messages: (row.chat_items ?? row.message_count) == null ? null : Math.max(0, number(row.chat_items ?? row.message_count)),
        date: timestamp(row.last_mes), preview: excerpt(row.mes ?? row.preview_message),
    })).sort((a, b) => b.date - a.date || b.name.localeCompare(a.name));
}
export function makeBackup(state) { return { app: KEY, version: VERSION, exportedAt: new Date().toISOString(), scope: 'manager', data: structuredClone(state) }; }
export function readBackup(value) {
    if (value?.app !== KEY || value.scope !== 'manager') throw new Error('请选择 U皇万岁的管理数据备份。');
    return normalize(value.data, { strict: true });
}
export function dateLabel(value) { return value ? new Date(value).toLocaleDateString('zh-CN') : '未知'; }
export function companionLabel(first, now = Date.now(), played = false) {
    const day = value => { const date = new Date(value); return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); };
    return first > 0 ? `入宫 ${Math.max(1, Math.round((day(now) - day(first)) / DAY) + 1)} 天` : played ? '入宫时间待补全' : '入宫时间未知';
}
