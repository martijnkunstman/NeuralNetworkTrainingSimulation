// src/panels/TrackPanel.ts
// Track configuration, visual editor, and save/load.

import { simState } from '../SimState';
import { Vector } from '../Vector';
import { buildPanel } from './BrainPanel';
import { resetBoidsForNewTrack } from './ConfigPanel';

interface TrackExport {
    controlPoints: { x: number; y: number }[];
    trackWidth: number;
    numControlPoints: number;
    segmentsPerCurve: number;
    radiusVariance: number;
    cornerTightness: number;
}

export function createTrackPanel(): HTMLElement {
    const panel = buildPanel('track', '🛣 Track', 300, 500, 20, Math.max(60, window.innerHeight - 530));
    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.overflowY = 'auto';
    body.style.padding = '10px 14px';

    body.innerHTML = `
    <div class="cfg-section">
      <div class="cfg-label">Track Width</div>
      <div class="cfg-row">
        <input type="range" id="trk-width" min="80" max="240" step="5" value="120">
        <span class="cfg-value" id="trk-width-val">120</span>
      </div>
    </div>
    <div class="cfg-section">
      <div class="cfg-label">Control Points</div>
      <div class="cfg-row">
        <input type="range" id="trk-cp" min="6" max="22" step="1" value="14">
        <span class="cfg-value" id="trk-cp-val">14</span>
      </div>
    </div>
    <div class="cfg-section">
      <div class="cfg-label">Radius Variance <span style="color:#555;font-size:0.75rem">Oval ← → Diverse</span></div>
      <div class="cfg-row">
        <input type="range" id="trk-variance" min="0" max="0.8" step="0.05" value="0.35">
        <span class="cfg-value" id="trk-variance-val">0.35</span>
      </div>
    </div>
    <div class="cfg-section">
      <div class="cfg-label">Corner Tightness <span style="color:#555;font-size:0.75rem">Gentle ← → Sharp</span></div>
      <div class="cfg-row">
        <input type="range" id="trk-corners" min="0" max="0.5" step="0.05" value="0.20">
        <span class="cfg-value" id="trk-corners-val">0.20</span>
      </div>
    </div>
    <div class="cfg-section">
      <div class="cfg-label">Smoothness</div>
      <div class="cfg-row">
        <input type="range" id="trk-smooth" min="6" max="30" step="1" value="15">
        <span class="cfg-value" id="trk-smooth-val">15</span>
      </div>
    </div>
    <div class="cfg-section">
      <div class="cfg-row-v" style="gap:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="trk-btn-generate" style="flex:1;">🔀 Generate</button>
          <input type="number" id="trk-seed" placeholder="Seed" min="1"
            style="width:70px;background:#1a1a2e;border:1px solid #333;color:#ddd;border-radius:4px;padding:3px 6px;font-size:0.82rem;">
        </div>
        <div style="display:flex;gap:5px;margin-top:2px;">
          <button id="trk-preset-oval"  class="trk-preset-btn">🔵 Oval</button>
          <button id="trk-preset-tech"  class="trk-preset-btn">⚙️ Technical</button>
          <button id="trk-preset-f1"    class="trk-preset-btn">🏎 F1</button>
        </div>
      </div>
    </div>

    <div class="cfg-section" style="border-top:1px solid #222;padding-top:8px;margin-top:4px;">
      <div class="cfg-label">Edit Mode</div>
      <div class="cfg-row-v" style="gap:6px;">
        <button id="trk-btn-edit">✏️ Enter Edit Mode</button>
        <button id="trk-btn-exit-edit" style="display:none;">✅ Exit &amp; Apply</button>
        <div id="trk-edit-hint" style="display:none;font-size:0.75rem;color:#888;line-height:1.4;">
          Drag the numbered dots to reshape the track. Track updates live.
        </div>
      </div>
    </div>

    <div class="cfg-section" style="border-top:1px solid #222;padding-top:8px;margin-top:4px;">
      <div class="cfg-label">Files</div>
      <div class="cfg-row-v" style="gap:6px;">
        <button id="trk-btn-export">⬇ Export Track (.json)</button>
        <button id="trk-btn-import">⬆ Import Track (.json)</button>
      </div>
    </div>
  `;

    // ── Sliders ────────────────────────────────────────────────────────────
    wireTrackSlider(body, 'trk-width',    'trk-width-val',    v => { if (simState.track) simState.track.trackWidth = v; });
    wireTrackSlider(body, 'trk-cp',       'trk-cp-val',       v => { if (simState.track) simState.track.numControlPoints = v; });
    wireTrackSlider(body, 'trk-variance', 'trk-variance-val', v => { if (simState.track) simState.track.radiusVariance = v; }, 2);
    wireTrackSlider(body, 'trk-corners',  'trk-corners-val',  v => { if (simState.track) simState.track.cornerTightness = v; }, 2);
    wireTrackSlider(body, 'trk-smooth',   'trk-smooth-val',   v => { if (simState.track) simState.track.segmentsPerCurve = v; });

    // ── Generate ───────────────────────────────────────────────────────────
    body.querySelector('#trk-btn-generate')?.addEventListener('click', () => {
        const { track } = simState;
        if (!track) return;
        const seedInput = body.querySelector('#trk-seed') as HTMLInputElement;
        const rawSeed = parseInt(seedInput.value);
        const seed = isNaN(rawSeed) || rawSeed < 1 ? 0 : rawSeed;
        const newSeed = track.randomize(1200, 1200);
        if (seed > 0) {
            // User provided explicit seed — use it
            track.generateSimpleLoopedTrack(1200, 1200, seed);
            seedInput.value = String(seed);
        } else {
            seedInput.value = String(newSeed);
        }
        resetBoidsForNewTrack();
    });

    // ── Presets ────────────────────────────────────────────────────────────
    body.querySelector('#trk-preset-oval')?.addEventListener('click', () => {
        applyPreset(body, { numControlPoints: 8, radiusVariance: 0.05, cornerTightness: 0.05, trackWidth: 150, segmentsPerCurve: 15 });
    });
    body.querySelector('#trk-preset-tech')?.addEventListener('click', () => {
        applyPreset(body, { numControlPoints: 16, radiusVariance: 0.45, cornerTightness: 0.35, trackWidth: 100, segmentsPerCurve: 18 });
    });
    body.querySelector('#trk-preset-f1')?.addEventListener('click', () => {
        applyPreset(body, { numControlPoints: 14, radiusVariance: 0.55, cornerTightness: 0.25, trackWidth: 110, segmentsPerCurve: 18 });
    });

    // ── Edit mode ──────────────────────────────────────────────────────────
    const editBtn     = body.querySelector('#trk-btn-edit')      as HTMLButtonElement;
    const exitEditBtn = body.querySelector('#trk-btn-exit-edit') as HTMLButtonElement;
    const editHint    = body.querySelector('#trk-edit-hint')     as HTMLElement;

    editBtn.addEventListener('click', () => {
        simState.isEditingTrack = true;
        simState.isFastTraining = false;
        simState.isPaused = true;
        simState.fitCamera?.();
        editBtn.style.display = 'none';
        exitEditBtn.style.display = '';
        editHint.style.display = '';
    });

    exitEditBtn.addEventListener('click', () => {
        simState.isEditingTrack = false;
        simState.trackDragIndex = -1;
        simState.isPaused = false;
        exitEditBtn.style.display = 'none';
        editHint.style.display = 'none';
        editBtn.style.display = '';
        resetBoidsForNewTrack();
    });

    // ── Export ─────────────────────────────────────────────────────────────
    body.querySelector('#trk-btn-export')?.addEventListener('click', () => {
        const { track } = simState;
        if (!track || track.controlPoints.length === 0) return;
        const data: TrackExport = {
            controlPoints: track.controlPoints.map(p => ({ x: p.x, y: p.y })),
            trackWidth: track.trackWidth,
            numControlPoints: track.numControlPoints,
            segmentsPerCurve: track.segmentsPerCurve,
            radiusVariance: track.radiusVariance,
            cornerTightness: track.cornerTightness,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `track-${Date.now()}.json`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // ── Import ─────────────────────────────────────────────────────────────
    body.querySelector('#trk-btn-import')?.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json';
        inp.onchange = () => {
            const file = inp.files?.[0];
            if (!file) return;
            file.text().then(text => {
                try {
                    const data = JSON.parse(text) as Partial<TrackExport>;
                    const { track } = simState;
                    if (!track || !Array.isArray(data.controlPoints)) return;
                    track.controlPoints = data.controlPoints.map(p => new Vector(p.x, p.y));
                    if (data.trackWidth)      track.trackWidth      = data.trackWidth;
                    if (data.numControlPoints) track.numControlPoints = data.numControlPoints;
                    if (data.segmentsPerCurve) track.segmentsPerCurve = data.segmentsPerCurve;
                    if (data.radiusVariance !== undefined) track.radiusVariance = data.radiusVariance;
                    if (data.cornerTightness !== undefined) track.cornerTightness = data.cornerTightness;
                    syncSlidersFromTrack(body, track);
                    track.regenerateFromControlPoints();
                    resetBoidsForNewTrack();
                } catch {
                    // silently ignore malformed files
                }
            });
        };
        inp.click();
    });

    return panel;
}

export function updateTrackPanel() {
    const panel = document.querySelector('[data-panel-id="track"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none') return;
    // Sync edit-mode button state if mode was changed externally (e.g. by exiting elsewhere)
    const editBtn     = panel.querySelector('#trk-btn-edit')      as HTMLElement | null;
    const exitEditBtn = panel.querySelector('#trk-btn-exit-edit') as HTMLElement | null;
    const editHint    = panel.querySelector('#trk-edit-hint')     as HTMLElement | null;
    if (editBtn && exitEditBtn && editHint) {
        const editing = simState.isEditingTrack;
        editBtn.style.display     = editing ? 'none' : '';
        exitEditBtn.style.display = editing ? '' : 'none';
        editHint.style.display    = editing ? '' : 'none';
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function wireTrackSlider(
    root: HTMLElement,
    sliderId: string,
    valId: string,
    onChange: (v: number) => void,
    decimals = 0,
) {
    const slider = root.querySelector(`#${sliderId}`) as HTMLInputElement | null;
    const valEl  = root.querySelector(`#${valId}`)   as HTMLElement | null;
    if (!slider || !valEl) return;
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = v.toFixed(decimals);
        onChange(v);
    });
}

interface PresetValues {
    numControlPoints: number;
    radiusVariance: number;
    cornerTightness: number;
    trackWidth: number;
    segmentsPerCurve: number;
}

function applyPreset(body: HTMLElement, preset: PresetValues) {
    const { track } = simState;
    if (!track) return;

    track.numControlPoints = preset.numControlPoints;
    track.radiusVariance   = preset.radiusVariance;
    track.cornerTightness  = preset.cornerTightness;
    track.trackWidth       = preset.trackWidth;
    track.segmentsPerCurve = preset.segmentsPerCurve;

    syncSlidersFromTrack(body, track);

    track.randomize(1200, 1200);
    const seedInput = body.querySelector('#trk-seed') as HTMLInputElement | null;
    if (seedInput) seedInput.value = String(track.seed);
    resetBoidsForNewTrack();
}

function syncSlidersFromTrack(body: HTMLElement, track: { trackWidth: number; numControlPoints: number; segmentsPerCurve: number; radiusVariance: number; cornerTightness: number }) {
    const set = (id: string, valId: string, v: number, dec = 0) => {
        const el  = body.querySelector(`#${id}`)    as HTMLInputElement | null;
        const val = body.querySelector(`#${valId}`) as HTMLElement | null;
        if (el)  el.value = String(v);
        if (val) val.textContent = v.toFixed(dec);
    };
    set('trk-width',    'trk-width-val',    track.trackWidth);
    set('trk-cp',       'trk-cp-val',       track.numControlPoints);
    set('trk-variance', 'trk-variance-val', track.radiusVariance, 2);
    set('trk-corners',  'trk-corners-val',  track.cornerTightness, 2);
    set('trk-smooth',   'trk-smooth-val',   track.segmentsPerCurve);
}
