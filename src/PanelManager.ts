// src/PanelManager.ts
// Manages floating, draggable, resizable, minimizable panels.

export interface PanelState {
    left: number;
    top: number;
    width: number;
    height: number;
    minimized: boolean;
    visible: boolean;
}

export class PanelManager {
    private panels: Map<string, HTMLElement> = new Map();
    private zBase = 200;
    private zTop = 200;

    register(panel: HTMLElement): void {
        const id = panel.dataset.panelId!;
        this.panels.set(id, panel);
        this.wireDrag(panel);
        this.wireMinimize(panel);
        this.wireClose(panel);
        this.wireFocus(panel);
        this.restorePanelState(panel);
    }

    // ── Drag ──────────────────────────────────────────────────────────────────
    private wireDrag(panel: HTMLElement) {
        const header = panel.querySelector('.panel-header') as HTMLElement;
        if (!header) return;

        let startX = 0, startY = 0, originLeft = 0, originTop = 0;
        let dragging = false;

        const onMove = (e: MouseEvent) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = `${Math.max(0, originLeft + dx)}px`;
            panel.style.top = `${Math.max(0, originTop + dy)}px`;
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.savePanelState(panel);
        };

        header.addEventListener('mousedown', (e) => {
            // Don't start drag if clicking a button inside the header
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            originLeft = parseInt(panel.style.left) || 0;
            originTop = parseInt(panel.style.top) || 0;
            this.bringToFront(panel);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
    }

    // ── Minimize ──────────────────────────────────────────────────────────────
    private wireMinimize(panel: HTMLElement) {
        const btn = panel.querySelector('.panel-btn-minimize') as HTMLButtonElement;
        if (!btn) return;
        btn.addEventListener('click', () => {
            const minimized = panel.classList.toggle('panel--minimized');
            btn.textContent = minimized ? '□' : '−';
            this.savePanelState(panel);
        });
    }

    // ── Close ─────────────────────────────────────────────────────────────────
    private wireClose(panel: HTMLElement) {
        const btn = panel.querySelector('.panel-btn-close') as HTMLButtonElement;
        if (!btn) return;
        btn.addEventListener('click', () => {
            this.setVisible(panel, false);
        });
    }

    // ── Focus / Z-index ───────────────────────────────────────────────────────
    private wireFocus(panel: HTMLElement) {
        panel.addEventListener('mousedown', () => this.bringToFront(panel));
    }

    bringToFront(panel: HTMLElement) {
        this.zTop++;
        panel.style.zIndex = String(this.zTop);
    }

    // ── Visibility ────────────────────────────────────────────────────────────
    setVisible(panel: HTMLElement, visible: boolean) {
        panel.style.display = visible ? 'flex' : 'none';
        this.savePanelState(panel);
        // Update toolbar button state
        const id = panel.dataset.panelId!;
        const btn = document.querySelector(`[data-toggle-panel="${id}"]`) as HTMLElement;
        if (btn) btn.classList.toggle('toolbar-btn--active', visible);
    }

    toggleVisible(id: string) {
        const panel = this.panels.get(id);
        if (!panel) return;
        const currently = panel.style.display !== 'none';
        this.setVisible(panel, !currently);
        if (!currently) this.bringToFront(panel);
    }

    // ── Persistence ───────────────────────────────────────────────────────────
    savePanelState(panel: HTMLElement) {
        const id = panel.dataset.panelId!;
        const state: PanelState = {
            left: parseInt(panel.style.left) || 0,
            top: parseInt(panel.style.top) || 0,
            width: panel.offsetWidth,
            height: panel.offsetHeight,
            minimized: panel.classList.contains('panel--minimized'),
            visible: panel.style.display !== 'none',
        };
        localStorage.setItem(`panel_state_${id}`, JSON.stringify(state));
    }

    private restorePanelState(panel: HTMLElement) {
        const id = panel.dataset.panelId!;
        const raw = localStorage.getItem(`panel_state_${id}`);
        if (!raw) return;
        try {
            const s: PanelState = JSON.parse(raw);
            panel.style.left = `${s.left}px`;
            panel.style.top = `${s.top}px`;
            panel.style.width = `${s.width}px`;
            panel.style.height = `${s.height}px`;
            panel.style.display = s.visible ? 'flex' : 'none';
            if (s.minimized) {
                panel.classList.add('panel--minimized');
                const btn = panel.querySelector('.panel-btn-minimize') as HTMLButtonElement;
                if (btn) btn.textContent = '□';
            }
            // Sync toolbar button
            const btn = document.querySelector(`[data-toggle-panel="${id}"]`) as HTMLElement;
            if (btn) btn.classList.toggle('toolbar-btn--active', s.visible);
        } catch { /* ignore */ }
    }

    saveAll() {
        this.panels.forEach(p => this.savePanelState(p));
    }
}
