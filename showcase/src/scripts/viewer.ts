import { createCdCase, type CdCaseApi, type CdCaseQuality } from '../../../src/index.js';

function requireNode<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`CD showcase: missing #${id}`);
  return node as T;
}

const stage = requireNode<HTMLDivElement>('stage');
const status = requireNode<HTMLParagraphElement>('status');
const fields = requireNode<HTMLFieldSetElement>('control-fields');
const accent = requireNode<HTMLInputElement>('accent');
const quality = requireNode<HTMLSelectElement>('quality');
const motion = requireNode<HTMLButtonElement>('motion');
const reset = requireNode<HTMLButtonElement>('reset');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let api: CdCaseApi | null = null;
let paused = reduced.matches;
let visible = true;
let destroyed = false;
let opening = false;
let operation = 0;
const events = new AbortController();
const listenerOptions = { signal: events.signal };

quality.value = window.matchMedia('(max-width: 700px)').matches ? 'low' : 'medium';

function error(cause: unknown): void {
  status.dataset.error = 'true';
  status.textContent = `Case unavailable: ${cause instanceof Error ? cause.message : String(cause)}`;
}

function syncPause(): void {
  api?.setPaused(document.hidden || !visible || (paused && !opening));
  motion.textContent = paused ? 'Resume motion' : 'Pause motion';
  motion.setAttribute('aria-pressed', String(paused));
}

function mount(open = api?.getOpen() ?? 0): void {
  operation += 1;
  opening = false;
  api?.dispose();
  api = null;
  fields.disabled = true;
  delete status.dataset.error;
  status.textContent = 'Loading case…';
  try {
    api = createCdCase(stage, {
      title: 'Refraction', subtitle: 'OverSeer Design', accent: accent.value,
      quality: quality.value as CdCaseQuality, background: '#0b0d12',
      open, openOnInteract: false, autoSpin: !reduced.matches, idleDrift: 0,
      maxPixelRatio: 1.5, respectReducedMotion: true, pauseWhenOffscreen: true,
      onError: error,
    });
    fields.disabled = false;
    status.textContent = '';
    syncPause();
  } catch (cause) { error(cause); }
}

for (const button of fields.querySelectorAll<HTMLButtonElement>('[data-open]')) {
  button.addEventListener('click', async () => {
    if (!api) return;
    const current = api;
    const token = ++operation;
    opening = true;
    syncPause();
    try {
      await current.setOpen(Number(button.dataset.open));
      if (destroyed || token !== operation) return;
      current.render();
    } catch (cause) { error(cause); }
    finally {
      if (token === operation) { opening = false; syncPause(); }
    }
  }, listenerOptions);
}
accent.addEventListener('input', () => {
  try { api?.setAccent(accent.value); api?.render(); }
  catch (cause) { error(cause); }
}, listenerOptions);
stage.addEventListener('pointermove', () => {
  if (paused && !document.hidden && visible) {
    try { api?.render(); } catch (cause) { error(cause); }
  }
}, listenerOptions);
quality.addEventListener('change', () => mount(), listenerOptions);
motion.addEventListener('click', () => { paused = !paused; syncPause(); }, listenerOptions);
reset.addEventListener('click', () => mount(0), listenerOptions);
document.addEventListener('visibilitychange', syncPause, listenerOptions);
reduced.addEventListener('change', () => { paused = reduced.matches; mount(); }, listenerOptions);

const observer = new IntersectionObserver(([entry]) => {
  visible = Boolean(entry?.isIntersecting);
  syncPause();
}, { threshold: 0.01 });
observer.observe(stage);

function dispose(): void {
  destroyed = true;
  operation += 1;
  events.abort();
  observer.disconnect();
  api?.dispose();
  api = null;
}
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

Object.assign(window, {
  __cd: {
    get api() { return api; },
    status: () => ({ ready: Boolean(api), paused, visible, reducedMotion: reduced.matches, quality: quality.value, open: api?.getOpen() ?? null, error: status.dataset.error ? status.textContent : null }),
  },
});
mount();
