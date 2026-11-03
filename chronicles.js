// Date-only arithmetic avoids DST day-length errors. Journals contain counts, never chat text.
const DAY = 86400000;
const safe = key => typeof key === 'string' && !['__proto__', 'prototype', 'constructor'].includes(key);
const count = n => Number.isFinite(+n) ? Math.max(0, Math.floor(+n)) : 0;
export const dayKey = (at = Date.now(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
export const validDay = key => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) && new Date(key).toISOString().slice(0, 10) === key;
export const moveDay = (key, days) => new Date(Date.parse(key) + days * DAY).toISOString().slice(0, 10);
export function periodFor(key, mode = 'month') {
    const date = new Date(key + 'T00:00:00Z'); let start, end;
    if (mode === 'week') { start = moveDay(key, -((date.getUTCDay() + 6) % 7)); end = moveDay(start, 7); }
    else if (mode === 'year') { start = key.slice(0, 4) + '-01-01'; end = String(+key.slice(0, 4) + 1) + '-01-01'; }
    else { start = key.slice(0, 7) + '-01'; end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); }
    return { start, end, last: moveDay(end, -1), contains: value => value >= start && value < end };
}
export function newChronicle(now = Date.now()) { return { version: 1, startedAt: now, zone: Intl.DateTimeFormat().resolvedOptions().timeZone, days: {}, arrivals: {}, promotions: [], returns: [], seen: {}, gaps: [], pausedAt: 0 }; }
export function cleanChronicle(raw) {
    const out = newChronicle(); if (!raw || typeof raw !== 'object') return out;
    if (raw.version !== 1) throw new Error('史册数据版本暂不支持，请先更新插件。');
    try { dayKey(Date.now(), raw.zone); out.zone = raw.zone; } catch { /* default device zone */ }
    out.startedAt = count(raw.startedAt) || out.startedAt;
    out.pausedAt = count(raw.pausedAt);
    out.gaps = (Array.isArray(raw.gaps) ? raw.gaps : []).filter(x => x && x.start > 0 && x.end >= x.start).map(x => ({ start: count(x.start), end: count(x.end) }));
    for (const [day, rows] of Object.entries(raw.days || {})) if (validDay(day) && rows && typeof rows === 'object') {
        out.days[day] = {};
        for (const [id, row] of Object.entries(rows)) if (safe(id) && row && typeof row === 'object') out.days[day][id] = { floors: count(row.floors), tokens: count(row.tokens), tokenFloors: Math.min(count(row.floors), count(row.tokenFloors)) };
    }
    for (const [id, at] of Object.entries(raw.arrivals || {})) if (safe(id) && at > 0) out.arrivals[id] = count(at);
    for (const [key, row] of Object.entries(raw.seen || {})) if (safe(key) && row && safe(row.id) && validDay(row.day)) out.seen[key] = { id: row.id, day: row.day, tokens: row.tokens === null ? null : count(row.tokens) };
    for (const row of Array.isArray(raw.promotions) ? raw.promotions : []) if (row && safe(row.id) && row.at > 0 && row.levels > 0) out.promotions.push({ id: row.id, at: count(row.at), levels: count(row.levels), from: String(row.from || '').slice(0, 30), to: String(row.to || '').slice(0, 30), elapsed: row.elapsed === null ? null : count(row.elapsed), first: row.first === true });
    for (const row of Array.isArray(raw.returns) ? raw.returns : []) if (row && safe(row.id) && row.at > 0 && row.absence >= 7 * DAY) out.returns.push({ id: row.id, at: count(row.at), absence: count(row.absence) });
    return out;
}
export function arrival(state, id, at = Date.now()) {
    const book = state.chronicle; if (!book || !safe(id) || book.arrivals[id]) return;
    book.arrivals[id] = at;
    if (state.records[id]) { state.records[id].enteredAt = at; state.records[id].enteredExact = true; }
}
export function promotion(state, id, from, to, at = Date.now()) {
    const book = state.chronicle; if (!book || from === to) return;
    const ladder = state.ranks.filter(r => r.id !== 'cold');
    const a = ladder.findIndex(r => r.id === from), b = ladder.findIndex(r => r.id === to);
    if (a < 0 || b < 0 || a <= b) return;
    const record = state.records[id];
    book.promotions.push({ id, from: ladder[a].name, to: ladder[b].name, levels: a - b, at, first: !book.promotions.some(r => r.id === id), elapsed: record?.enteredExact && record.enteredAt <= at ? at - record.enteredAt : null });
}
export function activity(state, id, { key, at = Date.now(), tokens = null, previous = 0, newFloor = true } = {}) {
    const book = state.chronicle; if (!book || !safe(id)) return;
    const day = dayKey(at, book.zone);
    const rows = book.days[day] ||= {}; const row = rows[id] ||= { floors: 0, tokens: 0, tokenFloors: 0 };
    if (previous > 0 && at - previous >= 7 * DAY) book.returns.push({ id, at, absence: at - previous });
    if (!newFloor || !safe(key)) return;
    const validTokens = typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 ? Math.floor(tokens) : null;
    const seen = book.seen[key];
    if (seen) {
        // A duplicate final event may arrive after native token counting finishes.
        if (seen.tokens === null && validTokens !== null) { const old = book.days[seen.day]?.[seen.id]; if (old) { old.tokens += validTokens; old.tokenFloors++; seen.tokens = validTokens; } }
        return;
    }
    row.floors++; if (validTokens !== null) { row.tokens += validTokens; row.tokenFloors++; }
    book.seen[key] = { id, day, tokens: validTokens };
}
export function chronicleReport(book, key, mode) {
    const period = periodFor(key, mode), rows = new Map();
    for (const [day, members] of Object.entries(book.days)) if (period.contains(day)) for (const [id, value] of Object.entries(members)) {
        const row = rows.get(id) || { id, floors: 0, days: 0, tokens: 0, tokenFloors: 0 };
        row.floors += value.floors; row.days++; row.tokens += value.tokens; row.tokenFloors += value.tokenFloors; rows.set(id, row);
    }
    const list = [...rows.values()]; const winners = field => { const max = Math.max(0, ...list.map(r => r[field])); return max ? list.filter(r => r[field] === max) : []; };
    const ascents = book.promotions.filter(r => r.first && r.elapsed !== null && period.contains(dayKey(r.at, book.zone)));
    const fastest = ascents.length ? Math.min(...ascents.map(r => r.elapsed / r.levels)) : null;
    const returns = book.returns.filter(r => period.contains(dayKey(r.at, book.zone)));
    const longest = Math.max(0, ...returns.map(r => r.absence)); const unique = rows => [...new Map(rows.map(r => [r.id, r])).values()];
    return { period, rows: list, floors: list.reduce((s, r) => s + r.floors, 0), tokens: list.reduce((s, r) => s + r.tokens, 0), tokenFloors: list.reduce((s, r) => s + r.tokenFloors, 0), newcomers: Object.entries(book.arrivals).filter(([, at]) => period.contains(dayKey(at, book.zone))), favorites: winners('floors'), companions: winners('days'), ascents: ascents.filter(r => r.elapsed / r.levels === fastest), returns: unique(returns.filter(r => r.absence === longest)) };
}
export const QUIPS = {
    floors: ['陛下，御笔歇了这些时日，杂家都快听得见落灰声了。', '各宫递来的话本都摞高了，杂家斗胆请陛下翻上两页。', '这期一句新话也未留，杂家只好替陛下研着空墨。'],
    tokens: ['陛下惜字如金，杂家这一期连算盘都没拨响。', '这期字数清静，杂家替御书房省下一盏灯油。', '陛下笔下尚未落字，杂家候着便是。'],
    newcomers: ['启禀陛下，本期宫门清静，倒省了杂家不少登记功夫。', '迎新的红毯还卷着呢，杂家可一直替陛下留着。', '陛下，宫门许久未迎新人，杂家这花名册都翻熟了。'],
    favorites: ['各宫雨露均未沾，杂家这圣眷榜只好先空着。', '陛下尚未落笔，杂家可不敢擅点谁的名。', '这期未闻传召，杂家也猜不透圣心。'],
    companions: ['各宫的灯都候着呢，杂家请陛下得空坐坐。', '陛下日理万机，杂家替各宫递个念想。', '这期尚未相伴，杂家先把座儿替陛下暖着。'],
    ascents: ['本期各宫安守本位，杂家拟好的诏书还搁在案头。', '晋封的喜讯还没来，杂家这嗓子白练了。', '陛下未降晋封旨意，杂家便不多嘴了。'],
    returns: ['旧人的门前未闻圣驾，杂家也不敢多问。', '故人的茶还温着，杂家就等陛下一句传召。', '本期未续旧缘，杂家把旧牌签又轻轻擦了一遍。'],
};
export const PRAISES = {
    favorites: ['陛下与小主聊了足足 {floors} 楼，当真颇得圣心呐，杂家都记着呢！', '启禀陛下，{floors} 楼的情分落在这位小主身上，杂家可看明白圣意了。', '这期竟聊了 {floors} 楼！杂家斗胆一句，小主这圣眷可真羡煞旁人。'],
    companions: ['小主已经陪了陛下 {days} 天了，杂家斗胆问问，这封位之事……', '整整 {days} 天相伴，杂家瞧着，小主这一片心意可都在呢。', '陛下这期有 {days} 天都与小主相伴，杂家连传召的路都走熟了！'],
    ascents: ['恭喜小主，贺喜小主，从{from}晋升为{to}，一跃晋 {levels} 级！杂家这就传喜讯去。', '从{from}到{to}，足足晋 {levels} 级，杂家宣旨的声音都添了三分喜气！', '小主由{from}荣升{to}，连晋 {levels} 级，杂家先给您道喜了！'],
    returns: ['陛下与小主阔别 {absence} 天后重逢，杂家都落泪了……', '盼了 {absence} 天，终于又盼来陛下，杂家这便替小主把灯点上。', '隔了 {absence} 天，这份旧情终究没断，杂家就知道陛下还记着小主。'],
};
export function praiseLine(type, row, variant = 0) {
    const values = { ...row, absence: ((row.absence || 0) / DAY).toFixed(1) };
    return PRAISES[type][variant % PRAISES[type].length].replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
