import { chatRows, downloadUrl, stem, timestamp, interactionDates } from './core.js';

/** Native adapter. Every version-sensitive dependency is pinned in docs/COMPATIBILITY.md. */
export class TavernHost {
    constructor(getContext, loaders = {}) {
        this.context = getContext;
        this.core = loaders.core || (() => import('/script.js'));
        this.groups = loaders.groups || (() => import('/scripts/group-chats.js'));
        this.world = loaders.world || (() => import('/scripts/world-info.js'));
        this.statsValue = {}; this.statsTime = 0; this.pendingStats = null;
        this.serial = false;
        this.historyValue = new Map(); this.historyJobs = new Map(); this.historyQueue = []; this.historyActive = 0;
    }
    get ctx() { return this.context(); }
    async request(path, body, { blob = false, form = false, allowError = false, textResponse = false } = {}) {
        const response = await fetch(path, {
            method: 'POST', headers: this.ctx.getRequestHeaders({ omitContentType: form }),
            body: form ? body : JSON.stringify(body), cache: 'no-store',
        });
        if (!response.ok) throw new Error(`酒馆请求失败（${response.status}），请稍后重试。`);
        if (blob) return response.blob();
        if (textResponse) return response.text();
        const result = await response.json();
        if (result?.error && !allowError) throw new Error('酒馆未能完成操作，请检查文件或重试。');
        return result;
    }
    invalidate() { this.statsTime = 0; }
    async stats(fresh = false) {
        if (!fresh && this.statsTime && Date.now() - this.statsTime < 15000) return this.statsValue;
        if (this.pendingStats) return this.pendingStats;
        this.pendingStats = this.request('/api/stats/get', {}).then(value => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('酒馆统计格式不可用。');
            this.statsValue = value; this.statsTime = Date.now(); return value;
        }).finally(() => { this.pendingStats = null; });
        return this.pendingStats;
    }
    history(avatar) {
        if (this.historyJobs.has(avatar)) return this.historyJobs.get(avatar);
        const jobs = this.historyJobs;
        const promise = new Promise((resolve, reject) => {
            this.historyQueue.push(async () => {
                if (this.disposed) { resolve({ first: 0, last: 0, played: false, complete: false }); return; }
                try {
                    const dates = { first: 0, last: 0, played: false, complete: true };
                    const rows = await this.listChats(avatar);
                    // Sequential archive reads, with at most two characters loading at once.
                    for (const row of rows) {
                        if (this.disposed) { dates.complete = false; break; }
                        try {
                            const current = interactionDates(await this.readChat(avatar, row.name));
                            dates.played ||= current.played;
                            if (current.first) dates.first = dates.first ? Math.min(dates.first, current.first) : current.first;
                            dates.last = Math.max(dates.last, current.last);
                        } catch { dates.complete = false; }
                    }
                    if (jobs === this.historyJobs) this.historyValue.set(avatar, dates);
                    resolve(dates);
                } catch (error) { if (jobs === this.historyJobs) this.historyValue.set(avatar, { first: 0, last: 0, played: false, complete: false }); reject(error); }
            });
        });
        jobs.set(avatar, promise); this.drainHistory(); return promise;
    }
    drainHistory() {
        while (this.historyActive < 2 && this.historyQueue.length) {
            const task = this.historyQueue.shift(); this.historyActive++;
            task().finally(() => { this.historyActive--; this.drainHistory(); });
        }
    }
    dispose() { this.disposed = true; }
    find(avatar) {
        const index = (this.ctx.characters || []).findIndex(c => c.avatar === avatar);
        if (index < 0) throw new Error('角色已不存在，请刷新列表。');
        return { index, character: this.ctx.characters[index] };
    }
    async fullCharacter(avatar) {
        const { index } = this.find(avatar);
        if (this.ctx.characters[index].shallow) {
            if (typeof this.ctx.unshallowCharacter !== 'function') throw new Error('当前酒馆无法读取完整角色资料。');
            await this.ctx.unshallowCharacter(String(index));
        }
        return this.find(avatar).character;
    }
    cover(avatar) { return this.ctx.getThumbnailUrl('avatar', avatar); }
    async assertIdle() {
        const [api, groups] = await Promise.all([this.core(), this.groups()]);
        if (api.is_send_press || api.isChatSaving || groups.is_group_generating) throw new Error('酒馆正在生成或保存，请结束后再操作。');
        return api;
    }
    async exclusive(task) {
        if (this.serial) throw new Error('上一项操作尚未完成，请稍候。');
        this.serial = true;
        try { await this.assertIdle(); return await task(); } finally { this.serial = false; }
    }
    selected(avatar) { return this.ctx.groupId == null && this.ctx.characters?.[this.ctx.characterId]?.avatar === avatar; }
    async select(avatar, switchMenu = false) {
        await this.assertIdle();
        if (this.ctx.chat?.length && (this.ctx.characterId != null || this.ctx.groupId != null)) await this.ctx.saveChat();
        await this.assertIdle();
        const { index } = this.find(avatar);
        if (typeof this.ctx.selectCharacterById !== 'function') throw new Error('需要酒馆 1.15.0 或以上的角色选择接口。');
        await this.ctx.selectCharacterById(index, { switchMenu });
        if (!this.selected(avatar)) throw new Error('角色尚未切换成功，请稍后重试。');
    }
    async open(avatar, filename = '') {
        return this.exclusive(async () => {
            if (filename && !(await this.listChats(avatar)).some(row => row.name === stem(filename))) throw new Error('该存档已不在列表中，请刷新后重选。');
            await this.select(avatar);
            if (filename && this.ctx.getCurrentChatId() !== stem(filename)) await this.ctx.openCharacterChat(stem(filename));
            if (!this.selected(avatar) || (filename && this.ctx.getCurrentChatId() !== stem(filename))) throw new Error('存档尚未切换成功，请重试。');
            return this.ctx.getCurrentChatId();
        });
    }
    async newChat(avatar, greetingIndex = null) {
        return this.exclusive(async () => {
            const api = await this.assertIdle();
            if (typeof api.doNewChat !== 'function') throw new Error('当前酒馆缺少新建聊天接口。');
            await this.select(avatar);
            const before = this.ctx.getCurrentChatId();
            // Native names have second-level precision: never reuse a filename made this second.
            const names = new Set((await this.listChats(avatar)).map(row => row.name));
            const expected = `${this.find(avatar).character.name} - ${this.ctx.humanizedDateTime()}`;
            if (names.has(expected)) throw new Error('刚刚已经建立了一份存档，请稍等一秒再新建。');
            await this.ctx.saveChat(); await this.assertIdle();
            await api.doNewChat({ deleteCurrentChat: false });
            const filename = this.ctx.getCurrentChatId();
            if (!this.selected(avatar) || !filename || filename === before || names.has(filename)) throw new Error('未能确认建立新存档，请检查原生聊天列表。');
            if (greetingIndex !== null && greetingIndex > 0) {
                const first = this.ctx.chat?.[0];
                if (this.ctx.chat.length !== 1 || !first || first.is_user || !Array.isArray(first.swipes) || greetingIndex >= first.swipes.length) throw new Error('新存档已建立，但该开场已变化，请在酒馆中切换开场。');
                await this.ctx.swipe.to(null, 'right', { message: first, forceMesId: 0, forceSwipeId: greetingIndex, forceDuration: 0 });
                if (this.ctx.chat[0].swipe_id !== greetingIndex) throw new Error('新存档已建立，但开场未切换成功，请使用原生开场切换。');
                await this.ctx.saveChat();
            }
            return filename;
        });
    }
    async listChats(avatar) {
        const data = await this.request('/api/characters/chats', { avatar_url: avatar, simple: true }, { allowError: true });
        // 1.15 uses the same error flag for a missing directory and a read failure.
        // Its supported search endpoint distinguishes an empty directory from an HTTP error.
        if (data?.error) return chatRows(await this.request('/api/chats/search', { avatar_url: avatar, query: '' }));
        return chatRows(data);
    }
    async chatDetails(avatar) {
        return chatRows(await this.request('/api/characters/chats', { avatar_url: avatar }));
    }
    async readChat(avatar, filename) {
        const { character } = this.find(avatar);
        const data = await this.request('/api/chats/get', { avatar_url: avatar, ch_name: character.name, file_name: stem(filename) });
        if (!Array.isArray(data)) throw new Error('存档格式不可用。');
        return data;
    }
    async deleteChat(avatar, filename) {
        return this.exclusive(async () => {
            const api = await this.assertIdle();
            if (typeof api.deleteCharacterChatByName !== 'function') throw new Error('当前酒馆无法从插件删除存档，请使用原生入口。');
            if (!(await this.listChats(avatar)).some(row => row.name === filename)) throw new Error('这份存档已不存在，请刷新。');
            if (this.selected(avatar) && this.ctx.getCurrentChatId() === filename) {
                if (typeof api.closeCurrentChat !== 'function') throw new Error('请先退出当前聊天，再删除这份存档。');
                await api.closeCurrentChat();
                if (this.ctx.characterId != null || this.ctx.groupId != null) throw new Error('聊天尚未退出，未删除存档。');
            }
            await this.assertIdle();
            const { index } = this.find(avatar);
            const event = this.ctx.eventTypes.CHAT_DELETED;
            let confirmed = false;
            const listener = name => { if (stem(name) === filename) confirmed = true; };
            this.ctx.eventSource.on(event, listener);
            try { await api.deleteCharacterChatByName(String(index), filename); }
            finally { this.off(event, listener); }
            const remaining = await this.listChats(avatar);
            if (remaining.some(row => row.name === filename)) throw new Error('删除未成功，存档仍在列表中。');
            if (!confirmed) throw new Error('文件已不在列表中，但原生删除事件未确认，请刷新酒馆检查。');
            this.invalidate(); return remaining;
        });
    }
    async importFile(file, avatar = '') {
        return this.exclusive(async () => {
            if (!file || file.size > 100 * 1024 * 1024) throw new Error('请选择不超过 100 MB 的角色卡文件。');
            const format = file.name.split('.').at(-1).toLowerCase();
            if (!['png', 'json', 'charx', 'yaml', 'yml', 'byaf'].includes(format)) throw new Error('请选择 PNG、JSON、CHARX、YAML 或 BYAF 角色卡。');
            if (this.ctx.chat?.length && (this.ctx.characterId != null || this.ctx.groupId != null)) await this.ctx.saveChat();
            await this.assertIdle();
            const form = new FormData();
            form.append('avatar', file); form.append('file_type', format); form.append('user_name', this.ctx.name1 || 'User');
            const current = avatar ? this.find(avatar).character.chat : '';
            if (avatar) form.append('preserved_name', avatar);
            const result = await this.request('/api/characters/import', form, { form: true });
            if (typeof result.file_name !== 'string' || !result.file_name) throw new Error('酒馆未返回有效角色标识，导入未确认。');
            const returned = `${result.file_name}.png`;
            if (avatar && returned !== avatar) throw new Error('酒馆返回了不同角色标识，请检查原生列表，管理记录未迁移。');
            if (avatar && current) {
                const api = await this.core();
                await api.updateRemoteChatName(this.find(avatar).index, current);
            }
            const verified = await this.request('/api/characters/get', { avatar_url: returned });
            if (verified.avatar !== returned || (avatar && current && verified.chat !== current)) throw new Error('角色资料已导入，但原角色或存档指针尚未确认。现有聊天仍保留，请刷新原生列表检查。');
            await this.ctx.getCharacters();
            if (avatar && current && this.selected(avatar)) await this.ctx.openCharacterChat(current);
            this.invalidate();
            return returned;
        });
    }
    async importUrl(value, avatar = '') {
        const url = downloadUrl(value);
        await this.assertIdle();
        const response = await fetch('/api/content/importURL', { method: 'POST', headers: this.ctx.getRequestHeaders(), body: JSON.stringify({ url }) });
        if (!response.ok) throw new Error('无法下载角色卡。请检查直链是否有效、站点是否支持或已加入酒馆白名单。');
        if (response.headers.get('X-Custom-Content-Type') !== 'character') throw new Error('该网址返回的不是角色卡。');
        const disposition = response.headers.get('Content-Disposition') || '';
        let filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'character.png';
        try { filename = decodeURIComponent(filename); } catch { /* retain literal filename */ }
        return this.importFile(new File([await response.blob()], filename, { type: response.headers.get('Content-Type') || 'image/png' }), avatar);
    }
    async editCharacter(avatar) { return this.exclusive(() => this.select(avatar, true)); }
    async updateProfile(avatar, changes, baseline) {
        return this.exclusive(async () => {
            const allowed = ['description', 'personality', 'scenario', 'mes_example', 'creator_notes'];
            const fields = Object.keys(changes);
            if (fields.some(field => !allowed.includes(field) || typeof changes[field] !== 'string')) throw new Error('人设字段无效，未保存。');
            const read = (raw, field) => raw.data?.[field] ?? (field === 'creator_notes' ? raw.creatorcomment : raw[field]) ?? '';
            const before = await this.request('/api/characters/get', { avatar_url: avatar });
            if (before.avatar !== avatar) throw new Error('角色标识已变化，请重新打开档案。');
            for (const field of fields) if (read(before, field) !== baseline[field] && read(before, field) !== changes[field]) throw new Error('原生资料已被修改，请重新打开编辑器后再保存。你的输入仍保留在这里。');
            const patch = { avatar, data: {} };
            for (const field of fields) { patch.data[field] = changes[field]; patch[field === 'creator_notes' ? 'creatorcomment' : field] = changes[field]; }
            if (fields.length) await this.request('/api/characters/merge-attributes', patch, { textResponse: true });
            const verified = await this.request('/api/characters/get', { avatar_url: avatar });
            if (verified.avatar !== avatar || fields.some(field => read(verified, field) !== changes[field])) throw new Error('保存结果尚未确认，请重新读取原生角色资料检查。输入仍保留。');
            await this.ctx.getCharacters(); this.invalidate(); return verified;
        });
    }
    async createCharacter() {
        await this.assertIdle();
        // Deliberate native UI entry: 1.15.0 public/script.js, #rm_button_create click binding.
        const button = document.getElementById('rm_button_create');
        if (!button) throw new Error('未找到原生创建入口，请打开酒馆角色面板后重试。');
        button.click();
    }
    async worldbooks(avatar) {
        const c = await this.fullCharacter(avatar);
        const wi = await this.world();
        const extra = wi.world_info?.charLore?.find(row => row.name === avatar.replace(/\.png$/i, ''))?.extraBooks || [];
        return [...new Set([c.data?.extensions?.world, c.world, ...extra].filter(name => typeof name === 'string' && name.trim()))];
    }
    async openWorld(name) {
        const wi = await this.world();
        if (typeof wi.openWorldInfoEditor !== 'function') throw new Error('当前酒馆无法打开世界书编辑器。');
        wi.openWorldInfoEditor(name);
    }
    async exportCard(avatar) { return this.request('/api/characters/export', { avatar_url: avatar, format: 'png' }, { blob: true }); }
    async readWorld(name) { const wi = await this.world(); const data = await wi.loadWorldInfo(name); if (!data) throw new Error(`世界书 ${name} 读取失败。`); return data; }
    async refresh() { await this.ctx.getCharacters(); this.invalidate(); this.historyJobs = new Map(); this.historyValue.clear(); }
    off(event, fn) { const source = this.ctx.eventSource; if (source.removeListener) source.removeListener(event, fn); else source.off(event, fn); }
    on(name, fn) {
        const event = this.ctx.eventTypes[name];
        if (!event) return () => {};
        this.ctx.eventSource.on(event, fn);
        return () => this.off(event, fn);
    }
    save() { this.ctx.saveSettingsDebounced(); }
    metadataTime(value) { return timestamp(value); }
}
