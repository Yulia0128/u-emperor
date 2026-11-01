/** Deliberate adapter for the 1.15.0 character drawer. Native nodes stay in place. */
export class NativeCharacterPanel {
    constructor(ui) {
        this.ui = ui; this.bypass = false; this.frame = null;
        this.click = event => {
            if (!(event.target instanceof Element) || !event.target.closest('#rightNavDrawerIcon, #unimportantYes, #rm_button_characters')) return;
            this.bypass = false; this.sync();
        };
        document.addEventListener('click', this.click, true);
    }
    showNative() { this.bypass = true; this.sync(); }
    clear() {
        this.shell?.dispose(); this.shell = null;
        this.mount?.remove(); this.mount = null;
        this.returnButton?.remove(); this.returnButton = null;
        this.panel?.classList.remove('ue-characters-active');
        this.observer?.disconnect(); this.observer = null; this.panel = null;
    }
    sync() {
        if (!this.ui.state.replaceCharacters || !this.ui.state.enabled) { this.clear(); return; }
        const panel = document.getElementById('right-nav-panel');
        if (!panel) { this.clear(); return; }
        if (panel !== this.panel) this.clear();
        this.panel = panel;
        if (!this.shell || !this.mount?.isConnected) {
            this.mount = document.createElement('section'); this.mount.id = 'ue-character-mount'; this.mount.setAttribute('aria-label', 'U皇万岁角色面板');
            this.shell = this.ui.shell({ native: true }); this.shell.root.classList.add('ue-native-app'); this.mount.append(this.shell.root); panel.append(this.mount);
            this.returnButton = this.ui.button('♛ 返回 U皇万岁', () => { this.bypass = false; this.sync(); }, 'ue-native-return'); this.returnButton.id = 'ue-return-manager'; panel.prepend(this.returnButton);
            this.observer = new MutationObserver(() => {
                if (this.frame) return;
                this.frame = requestAnimationFrame(() => { this.frame = null; this.sync(); });
            });
            this.observer.observe(panel, { childList: true });
        }
        panel.classList.toggle('ue-characters-active', !this.bypass);
        this.mount.hidden = this.bypass;
        this.returnButton.hidden = !this.bypass;
    }
    dispose() {
        document.removeEventListener('click', this.click, true);
        if (this.frame) cancelAnimationFrame(this.frame); this.frame = null;
        this.clear();
    }
}
