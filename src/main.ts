/** Bootstrap: loading screen with progress, error overlay, then the game. */
import './ui/style.css';
import './ui/menus.css';
import { settings } from './core/settings';
import { Game } from './game';

const ui = document.getElementById('ui') as HTMLDivElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;

const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = `
  <div class="loading-inner">
    <div class="logo">FLUX<span>CITY</span></div>
    <div class="tagline">an architectural open world</div>
    <div class="bar"><div class="fill"></div></div>
    <div class="status">Initialising…</div>
  </div>`;
ui.appendChild(loading);
const fill = loading.querySelector('.fill') as HTMLDivElement;
const status = loading.querySelector('.status') as HTMLDivElement;

function showError(err: unknown): void {
  const box = document.createElement('div');
  box.className = 'error-overlay';
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  box.innerHTML = '<h2>Something went wrong</h2><pre></pre><button>Reload</button>';
  (box.querySelector('pre') as HTMLPreElement).textContent = msg;
  (box.querySelector('button') as HTMLButtonElement).onclick = () => location.reload();
  ui.appendChild(box);
}

window.addEventListener('error', (e) => showError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

function checkWebGL2(): boolean {
  const c = document.createElement('canvas');
  return !!c.getContext('webgl2');
}

async function boot(): Promise<void> {
  if (!checkWebGL2())
    throw new Error('WebGL 2 is required to play FLUX CITY. Please use an up-to-date browser.');
  const game = await Game.create(canvas, ui, (p, text) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    status.textContent = text;
  });
  document.body.classList.toggle('cb', settings.colorBlindHud);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);
  game.start();
}

boot().catch(showError);
