import { KEY, normalize, entities, recordFor, logAction, renameIdentity } from './core.js';
import { TavernHost } from './host.js';
import { EmperorUI, node } from './ui.js';
import { NativeCharacterPanel } from './native-panel.js';

let host, ui, disposers = [], home, welcome, observer, frame, ready = false;
let enabled = false;
let generation = 0;
let nativePanel;
function selected() { return host.ctx.characterId != null || host.ctx.groupId != null; }
function clearHome() {
    if (home) { home.dispose(); home.root.parentElement?.remove(); home = null; }
    welcome?.classList.remove('ue-native-welcome-hidden'); welcome = null;
}
function reconcileHome() {
    if (!enabled || !ready) return;
    const chat = document.getElementById('chat');
    const nextWelcome = chat?.querySelector('.welcomePanel');
    if (!ui.state.enabled || !ui.state.homepage || selected() || !nextWelcome) { clearHome(); return; }
    if (home?.root.isConnected && welcome === nextWelcome) return;
    clearHome();
    const mount = node('div', 'ue-home-mount'); home = ui.shell({ home: true }); mount.append(home.root); chat.prepend(mount);
    welcome = nextWelcome; welcome.classList.add('ue-native-welcome-hidden');
}
function scheduleHome() { if (!frame) frame = requestAnimationFrame(() => { frame = null; reconcileHome(); }); }
function controls() {
    if (!enabled) return;
    nativePanel?.sync();
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('ue-open')) {
        const b = node('button', 'list-group-item flex-container flexGap5 interactable ue-entry', '♛ U皇万岁'); b.type = 'button'; b.id = 'ue-open'; b.addEventListener('click', () => ui.open()); menu.append(b);
    }
    const settings = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (settings && !document.getElementById('ue-settings')) {
        const panel = node('div'); panel.id = 'ue-settings';
        const details = node('details'); const title = node('summary', '', '♛ U皇万岁');
        const actions = node('div', 'ue-setting-actions'); actions.append(ui.button('打开管理器', () => ui.open()), ui.button('设置与备份', () => ui.settings()));
        details.append(title, node('p', '', '妃位册封 · 盲翻点名 · 多存档管理'), actions); panel.append(details); settings.append(panel);
    }
}
function trackPlay(index, type) {
    const ctx = host.ctx;
    if (ctx.groupId != null || ctx.characterId == null || type === 'first_message') return;
    const message = ctx.chat?.[Number(index)];
    if (!message || message.is_system || (!message.is_user && Number(index) === 0)) return;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    if (!avatar) return;
    const r = recordFor(ui.state, avatar);
    // Hydrate historical first interaction before recording today's activity.
    const historical = host.statsValue[avatar]?.date_first_chat;
    if (historical > 0 && historical < Date.now()) r.firstPlayedAt = r.firstPlayedAt ? Math.min(historical, r.firstPlayedAt) : historical;
    logAction(ui.state, avatar, 'play', Date.now(), ctx.getCurrentChatId()); host.invalidate(); ui.save();
}
export async function onEnable() {
    if (enabled) return;
    enabled = true;
    const ticket = ++generation;
    const { getContext } = await import('/scripts/extensions.js');
    if (!enabled || ticket !== generation) return;
    host = new TavernHost(getContext);
    if (!host.ctx?.eventSource || !host.ctx?.extensionSettings) throw new Error('U皇万岁：酒馆扩展环境尚未就绪。');
    const backup = host.ctx.extensionSettings[KEY];
    try { host.ctx.extensionSettings[KEY] = normalize(backup); }
    catch (e) { enabled = false; console.error('U皇万岁：管理数据版本不兼容，未覆盖原数据。', e.message); return; }
    entities(host.ctx, host.ctx.extensionSettings[KEY]); host.save();
    ui = new EmperorUI(host); ui.onHomePreference = scheduleHome; enabled = true;
    nativePanel = new NativeCharacterPanel(ui);
    ui.onNativeEntry = () => nativePanel.showNative();
    ui.onPanelPreference = () => nativePanel.sync();
    const start = () => {
        ready = true; controls(); scheduleHome();
        host.stats().then(() => ui.redraw()).catch(() => {});
        if (!observer && document.getElementById('chat')) { observer = new MutationObserver(scheduleHome); observer.observe(document.getElementById('chat'), { childList: true }); }
    };
    disposers.push(host.on('APP_READY', start));
    disposers.push(host.on('CHAT_CHANGED', () => { controls(); scheduleHome(); }));
    disposers.push(host.on('MESSAGE_SENT', trackPlay), host.on('MESSAGE_RECEIVED', trackPlay));
    disposers.push(host.on('CHARACTER_RENAMED', (oldAvatar, newAvatar) => { renameIdentity(ui.state, oldAvatar, newAvatar); ui.save(); host.invalidate(); ui.redraw(); }));
    for (const event of ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_DUPLICATED', 'CHAT_CREATED', 'CHAT_DELETED', 'CHARACTER_PAGE_LOADED']) disposers.push(host.on(event, () => { host.invalidate(); ui.redraw(); scheduleHome(); }));
    // Extension activation can occur after APP_READY. Current context is then immediately usable.
    start();
}
export function onDisable() {
    generation++;
    enabled = false; ready = false;
    for (const dispose of disposers.splice(0)) dispose();
    observer?.disconnect(); observer = null;
    if (frame) cancelAnimationFrame(frame); frame = null;
    nativePanel?.dispose(); nativePanel = null;
    clearHome(); ui?.dispose(); ui = null;
    document.getElementById('ue-open')?.remove(); document.getElementById('ue-settings')?.remove();
}
onEnable().catch(error => console.error('U皇万岁：初始化失败。', error.message));
