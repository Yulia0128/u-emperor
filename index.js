import { KEY, normalize, entities, recordFor, logAction, renameIdentity, interactionDates, timestamp } from './core.js';
import { TavernHost } from './host.js';
import { EmperorUI, node } from './ui.js';
import { NativeCharacterPanel } from './native-panel.js';
import { activity, arrival, messageIdentity } from './chronicles.js';

let host, ui, disposers = [], home, welcome, observer, frame, ready = false;
let enabled = false;
let generation = 0;
let nativePanel;
let knownAvatars = new Set(), baselineMessages = new WeakSet();
let inventoryReady = false;
function primeMessages() { baselineMessages = new WeakSet((host.ctx.chat || []).filter(m => m && typeof m === 'object')); }
function discoverArrivals() {
    const characters = (host.ctx.characters || []).filter(c => c.avatar && c.avatar !== 'none');
    if (!inventoryReady) { knownAvatars = new Set(characters.map(c => c.avatar)); inventoryReady = characters.length > 0; entities(host.ctx, ui.state); ui.save(); return; }
    for (const c of host.ctx.characters || []) if (c.avatar && c.avatar !== 'none' && !knownAvatars.has(c.avatar)) {
        knownAvatars.add(c.avatar); const record = recordFor(ui.state, c.avatar, c.date_added); if (ui.state.enabled && (timestamp(c.date_added) || record.enteredAt)) arrival(ui.state, c.avatar, timestamp(c.date_added) || record.enteredAt);
    }
    ui.save();
}
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
    document.getElementById('ue-open')?.remove();
    const settings = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (settings && !document.getElementById('ue-settings')) {
        const panel = node('div', 'inline-drawer'); panel.id = 'ue-settings';
        const header = node('div', 'inline-drawer-header inline-drawer-toggle'); header.tabIndex = 0; header.setAttribute('role', 'button'); header.setAttribute('aria-expanded', 'false');
        const icon = node('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down'); icon.setAttribute('aria-hidden', 'true');
        header.append(node('b', '', 'U皇万岁'), icon);
        header.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); header.click(); } });
        header.addEventListener('click', () => queueMicrotask(() => header.setAttribute('aria-expanded', String(icon.classList.contains('up')))));
        const content = node('div', 'inline-drawer-content'); content.style.display = 'none';
        const toggle = node('input'); toggle.type = 'checkbox'; toggle.id = 'ue-enabled';
        const label = node('label', 'checkbox_label'); label.htmlFor = toggle.id; label.append(toggle, node('span', '', '启动插件'));
        toggle.addEventListener('change', () => {
            ui.state.enabled = toggle.checked; ui.save();
            if (!toggle.checked) ui.state.chronicle.pausedAt ||= Date.now();
            else if (ui.state.chronicle.pausedAt) { ui.state.chronicle.gaps.push({ start: ui.state.chronicle.pausedAt, end: Date.now() }); ui.state.chronicle.pausedAt = 0; }
            primeMessages(); ui.save();
            if (!toggle.checked) ui.closeAll();
            else ui.historyJobs.clear();
            controls(); reconcileHome();
        });
        const open = node('button', 'menu_button', '打开管理器'); open.type = 'button'; open.id = 'ue-open-manager';
        open.addEventListener('click', () => { if (ui.state.enabled) ui.open(); });
        const actions = node('div', 'ue-extension-actions'); actions.append(label, open); content.append(actions);
        panel.append(header, content); settings.append(panel);
    }
    const toggle = document.getElementById('ue-enabled'); if (toggle) toggle.checked = ui.state.enabled;
    const open = document.getElementById('ue-open-manager'); if (open) open.disabled = !ui.state.enabled;
}
function trackPlay(index, type) {
    if (!ui.state.enabled) return;
    const ctx = host.ctx;
    if (ctx.groupId != null || ctx.characterId == null || type === 'first_message') return;
    const message = ctx.chat?.[Number(index)];
    if (!message || message.is_system || (!message.is_user && Number(index) === 0)) return;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    if (!avatar) return;
    const r = recordFor(ui.state, avatar);
    const messageKey = messageIdentity(avatar, ctx.getCurrentChatId(), Number(index), timestamp(message.send_date) || timestamp(message.gen_started), message.is_user);
    const newFloor = !baselineMessages.has(message) && !['swipe', 'continue', 'append', 'appendFinal'].includes(type);
    activity(ui.state, avatar, { key: messageKey, previous: r.lastPlayedAt, tokens: message.extra?.token_count, newFloor });
    baselineMessages.add(message);
    // Current message dates and background archive reads recover first interaction.
    // Native frontend stats may start their clock at an automatically inserted greeting.
    const dates = interactionDates(ctx.chat);
    if (dates.first) r.firstPlayedAt = r.firstPlayedAt ? Math.min(r.firstPlayedAt, dates.first) : dates.first;
    logAction(ui.state, avatar, 'play', timestamp(message.send_date) || Date.now(), ctx.getCurrentChatId()); host.invalidate(); ui.save();
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
    const restored = host.ctx.extensionSettings[KEY];
    if (restored.enabled && restored.chronicle.pausedAt) { restored.chronicle.gaps.push({ start: restored.chronicle.pausedAt, end: Date.now() }); restored.chronicle.pausedAt = 0; }
    entities(host.ctx, restored); host.save();
    knownAvatars = new Set((host.ctx.characters || []).map(c => c.avatar)); inventoryReady = knownAvatars.size > 0; primeMessages();
    ui = new EmperorUI(host); ui.onHomePreference = scheduleHome; enabled = true;
    nativePanel = new NativeCharacterPanel(ui);
    ui.onNativeEntry = () => nativePanel.showNative();
    ui.onPanelPreference = controls;
    const start = () => {
        ready = true; controls(); scheduleHome();
        if (ui.state.enabled) host.stats().then(() => ui?.redraw()).catch(() => {});
        if (!observer && document.getElementById('chat')) { observer = new MutationObserver(scheduleHome); observer.observe(document.getElementById('chat'), { childList: true }); }
    };
    disposers.push(host.on('APP_READY', start));
    disposers.push(host.on('CHAT_CHANGED', () => { primeMessages(); controls(); scheduleHome(); }));
    disposers.push(host.on('MESSAGE_SENT', trackPlay), host.on('MESSAGE_RECEIVED', trackPlay));
    disposers.push(host.on('CHARACTER_RENAMED', (oldAvatar, newAvatar) => { knownAvatars.delete(oldAvatar); knownAvatars.add(newAvatar); renameIdentity(ui.state, oldAvatar, newAvatar); ui.save(); host.invalidate(); ui.redraw(); }));
    disposers.push(host.on('CHARACTER_PAGE_LOADED', discoverArrivals), host.on('CHARACTER_DUPLICATED', discoverArrivals));
    for (const event of ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_DUPLICATED', 'CHAT_CREATED', 'CHAT_DELETED', 'CHARACTER_PAGE_LOADED']) disposers.push(host.on(event, () => { host.invalidate(); ui.redraw(); scheduleHome(); }));
    // Extension activation can occur after APP_READY. Current context is then immediately usable.
    start();
}
export function onDisable() {
    generation++;
    enabled = false; ready = false;
    if (ui && host) { ui.state.chronicle.pausedAt ||= Date.now(); ui.save(); }
    for (const dispose of disposers.splice(0)) dispose();
    observer?.disconnect(); observer = null;
    if (frame) cancelAnimationFrame(frame); frame = null;
    nativePanel?.dispose(); nativePanel = null;
    clearHome(); ui?.dispose(); ui = null; host?.dispose(); host = null;
    document.getElementById('ue-open')?.remove(); document.getElementById('ue-settings')?.remove();
}
onEnable().catch(error => console.error('U皇万岁：初始化失败。', error.message));
