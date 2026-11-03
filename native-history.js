import { timestamp, recordFor } from './core.js';
import { activity, dayKey, messageIdentity } from './chronicles.js';

/** One chat in memory at a time; only counts/identities survive, never message text. */
export function importNativeChat(state, id, filename, chat, now = Date.now()) {
    const book = state.chronicle, record = recordFor(state, id);
    let index = 0, imported = 0, undated = 0; const times = [];
    for (const message of chat) {
        if (!message || typeof message.mes !== 'string') continue;
        const current = index++;
        if (message.is_system || (current === 0 && !message.is_user)) continue;
        const at = timestamp(message.send_date) || timestamp(message.gen_started);
        if (!(at > 0 && at <= now)) { undated++; continue; }
        const key = messageIdentity(id, filename, current, at, message.is_user);
        const legacy = JSON.stringify([id, filename, current, message.send_date || message.gen_started || 'undated']);
        if (book.seen[legacy] && !book.seen[key]) { book.seen[key] = book.seen[legacy]; delete book.seen[legacy]; }
        const old = book.seen[key];
        // Old realtime journals used arrival/event day; replace its contribution with native date.
        const day = dayKey(at, book.zone);
        if (old && old.day !== day) {
            const previous = book.days[old.day]?.[id];
            if (previous) { previous.floors = Math.max(0, previous.floors - 1); if (old.tokens !== null) { previous.tokens = Math.max(0, previous.tokens - old.tokens); previous.tokenFloors = Math.max(0, previous.tokenFloors - 1); } if (!previous.floors) delete book.days[old.day][id]; }
            delete book.seen[key];
        }
        const stored = book.seen[key], tokens = message.extra?.token_count;
        if (stored?.tokens !== null && stored && typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 && stored.tokens !== Math.floor(tokens)) {
            const row = book.days[stored.day]?.[id]; if (row) { row.tokens = Math.max(0, row.tokens + Math.floor(tokens) - stored.tokens); stored.tokens = Math.floor(tokens); }
        }
        if (!book.seen[key]) imported++;
        activity(state, id, { key, at, tokens: message.extra?.token_count });
        record.firstPlayedAt = record.firstPlayedAt ? Math.min(record.firstPlayedAt, at) : at;
        record.lastPlayedAt = Math.max(record.lastPlayedAt, at);
        book.startedAt = Math.min(book.startedAt, at);
        times.push(at);
    }
    return { imported, undated, times };
}

export async function readNativeHistory(host, state, progress, signal) {
    const characters = [...host.ctx.characters]; let complete = 0, failed = 0, undated = 0;
    for (const character of characters) {
        if (signal.aborted || host.disposed || !state.enabled) return { complete, failed, undated, cancelled: true };
        try {
            const rows = await host.listChats(character.avatar);
            const times = new Set();
            for (const row of rows) {
                if (signal.aborted || host.disposed || !state.enabled) return { complete, failed, undated, cancelled: true };
                try {
                    const chat = await host.readChat(character.avatar, row.name);
                    if (signal.aborted || host.disposed) return { complete, failed, undated, cancelled: true };
                    const imported = importNativeChat(state, character.avatar, row.name, chat); undated += imported.undated; for (const at of imported.times) times.add(at);
                } catch { failed++; }
                // Yield so input, painting and close remain responsive during larger libraries.
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            const ordered = [...times].sort((a, b) => a - b);
            for (let i = 1; i < ordered.length; i++) if (ordered[i] - ordered[i - 1] >= 7 * 86400000 && !state.chronicle.returns.some(r => r.id === character.avatar && r.at === ordered[i])) state.chronicle.returns.push({ id: character.avatar, at: ordered[i], absence: ordered[i] - ordered[i - 1] });
        } catch { failed++; }
        complete++; progress({ complete, total: characters.length, failed, undated });
    }
    return { complete, failed, undated, cancelled: false };
}
